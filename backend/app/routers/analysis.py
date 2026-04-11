"""Analysis job submission and status endpoints."""
from __future__ import annotations

import io
from pathlib import Path

import numpy as np
from fastapi import (
    APIRouter,
    BackgroundTasks,
    File,
    Form,
    HTTPException,
    UploadFile,
)
from fastapi.responses import StreamingResponse

from backend.app.preview import composite_preview_png
from backend.app.schemas import (
    AnalyzeResponse,
    JobStatusResponse,
)
from backend.app.workers import get_job_store, run_analysis_job

router = APIRouter(prefix="/analysis", tags=["analysis"])

DEMO_DIR = Path(__file__).resolve().parents[3] / "data" / "demo"
CANONICAL_CHANNELS = ("dapi", "glycocalyx", "yap", "paxillin", "actin")


def _partial_channel_mapping(n_channels: int) -> tuple[dict[str, int], list[str]]:
    """Return a ``{name: index}`` mapping for an image with ``n_channels``.

    Handles non-canonical uploads gracefully: if the image has fewer
    than 5 channels we take the first N in canonical order and record
    a warning listing which extractors will be skipped. If it has more
    than 5, we use the first 5 slots and warn about the extra channels.
    """
    warnings: list[str] = []
    if n_channels >= 5:
        if n_channels > 5:
            warnings.append(
                f"Image has {n_channels} channels; used the first 5 in the "
                "canonical order DAPI, WGA, YAP, paxillin, phalloidin. "
                "Re-order your channels if this is wrong."
            )
        return {name: i for i, name in enumerate(CANONICAL_CHANNELS)}, warnings

    mapping = {name: i for i, name in enumerate(CANONICAL_CHANNELS[:n_channels])}
    missing = CANONICAL_CHANNELS[n_channels:]
    human_missing = ", ".join(missing)
    extractors = {
        "dapi": "nuclear segmentation",
        "glycocalyx": "glycocalyx shell features",
        "yap": "YAP nuclear/cytoplasmic features",
        "paxillin": "focal-adhesion features",
        "actin": "actin cytoskeleton features",
    }
    skipped = [extractors[m] for m in missing]
    warnings.append(
        f"Image has {n_channels} channels; expected 5 in the order DAPI, WGA, "
        f"YAP, paxillin, phalloidin. Missing slots ({human_missing}) will be "
        f"skipped — no {', '.join(skipped)} computed."
    )
    return mapping, warnings


@router.post("/preview")
async def preview_upload(
    upload: UploadFile = File(...),  # noqa: B008
) -> StreamingResponse:
    """Return a PNG preview of an uploaded multi-channel image.

    Mirrors ``GET /demo/{name}/preview`` for bundled datasets, but
    accepts an arbitrary upload and uses the same compositing helper
    so the frontend always shows a valid RGB preview — even for
    TIFFs, which a browser ``<img>`` tag cannot render directly.
    """
    from glycoquant.io import load_multichannel_image

    try:
        content = await upload.read()
        image = load_multichannel_image(content)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=422,
            detail=(
                f"Could not read uploaded image: {type(exc).__name__}: {exc}. "
                "Supported formats: multi-page TIFF, PNG, JPEG."
            ),
        ) from exc

    try:
        png_bytes = composite_preview_png(np.asarray(image))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return StreamingResponse(
        io.BytesIO(png_bytes),
        media_type="image/png",
        headers={"Cache-Control": "no-store"},
    )


@router.post("/analyze", response_model=AnalyzeResponse)
async def submit_analysis(
    background_tasks: BackgroundTasks,
    demo_condition: str | None = Form(default=None),  # noqa: B008
    cell_diameter: int = Form(default=80),  # noqa: B008
    include_deep_features: bool = Form(default=False),  # noqa: B008
    pixel_size_um: float | None = Form(default=None),  # noqa: B008
    upload: UploadFile | None = File(default=None),  # noqa: B008
) -> AnalyzeResponse:
    """Queue an analysis job and return its ``job_id`` immediately.

    The caller must provide either a ``demo_condition`` (loads one of
    the bundled TIFFs from ``data/demo/``, identified by its manifest
    ``name``) or a file ``upload`` (loaded and analyzed directly).
    """
    if demo_condition is None and upload is None:
        raise HTTPException(
            status_code=400,
            detail="Provide either demo_condition or an upload.",
        )

    from glycoquant.io import load_multichannel_image, split_into_channels

    # Load the channels into RAM (small for synthetic demos; streamed
    # for uploads). Uploaded files are consumed here and not saved to
    # disk — the worker operates on the already-loaded numpy arrays.
    if demo_condition is not None:
        path = DEMO_DIR / f"{demo_condition}.tiff"
        if not path.is_file():
            raise HTTPException(
                status_code=404,
                detail=f"Demo image not found: {demo_condition}",
            )
        raw = load_multichannel_image(path)
    else:
        assert upload is not None
        content = await upload.read()
        try:
            raw = load_multichannel_image(content)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Could not read uploaded image: {type(exc).__name__}: "
                    f"{exc}. Supported formats: multi-page TIFF, PNG, JPEG."
                ),
            ) from exc

    if raw.ndim != 3:
        raise HTTPException(
            status_code=422,
            detail=f"Image must be 2D or multi-channel; got shape {raw.shape}",
        )
    n_channels = raw.shape[2]
    if n_channels < 1:
        raise HTTPException(
            status_code=422,
            detail="Image has no channels.",
        )

    mapping, channel_warnings = _partial_channel_mapping(n_channels)
    try:
        channels = split_into_channels(raw, mapping)
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Channel split failed: {exc}",
        ) from exc

    # Resolve pixel size: explicit form value > demo manifest entry >
    # default. Demo manifests carry the per-image µm/px so bundled
    # HPA datasets are classified with their actual acquisition
    # optics rather than a hardcoded fallback.
    resolved_pixel_size_um = pixel_size_um
    if resolved_pixel_size_um is None and demo_condition is not None:
        from backend.app.routers.demo import _find_dataset

        dataset = _find_dataset(demo_condition)
        if dataset and dataset.get("pixel_size_um") is not None:
            resolved_pixel_size_um = float(dataset["pixel_size_um"])
    if resolved_pixel_size_um is None:
        resolved_pixel_size_um = 0.325

    store = get_job_store()
    job = store.create(
        meta={
            "demo_condition": demo_condition,
            "cell_diameter": cell_diameter,
            "include_deep_features": include_deep_features,
            "pixel_size_um": resolved_pixel_size_um,
            "channel_warnings": channel_warnings,
        }
    )

    background_tasks.add_task(
        run_analysis_job,
        job_id=job.id,
        channels=channels,
        cell_diameter=cell_diameter,
        include_deep_features=include_deep_features,
        pixel_size_um=resolved_pixel_size_um,
    )

    return AnalyzeResponse(
        job_id=job.id,
        status=job.status,
        created_at=job.created_at.isoformat(),
    )


@router.get("/jobs/{job_id}", response_model=JobStatusResponse)
async def get_job_status(job_id: str) -> JobStatusResponse:
    """Return current status, progress, and (if finished) results for a job."""
    store = get_job_store()
    job = store.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    return JobStatusResponse(
        job_id=job.id,
        status=job.status,
        progress=job.progress,
        created_at=job.created_at.isoformat(),
        finished_at=job.finished_at.isoformat() if job.finished_at else None,
        result=job.result,
        error=job.error,
    )
