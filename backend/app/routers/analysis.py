"""Analysis job submission and status endpoints."""
from __future__ import annotations

from pathlib import Path

from fastapi import (
    APIRouter,
    BackgroundTasks,
    File,
    Form,
    HTTPException,
    UploadFile,
)

from backend.app.schemas import (
    AnalyzeResponse,
    JobStatusResponse,
)
from backend.app.workers import get_job_store, run_analysis_job

router = APIRouter(prefix="/analysis", tags=["analysis"])

DEMO_DIR = Path(__file__).resolve().parents[3] / "data" / "demo"
CANONICAL_CHANNELS = ("dapi", "glycocalyx", "yap", "paxillin", "actin")


@router.post("/analyze", response_model=AnalyzeResponse)
async def submit_analysis(
    background_tasks: BackgroundTasks,
    demo_condition: str | None = Form(default=None),  # noqa: B008
    cell_diameter: int = Form(default=80),  # noqa: B008
    include_deep_features: bool = Form(default=False),  # noqa: B008
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
        raw = load_multichannel_image(content)

    mapping = {name: i for i, name in enumerate(CANONICAL_CHANNELS)}
    try:
        channels = split_into_channels(raw, mapping)
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Channel split failed: {exc}",
        ) from exc

    store = get_job_store()
    job = store.create(
        meta={
            "demo_condition": demo_condition,
            "cell_diameter": cell_diameter,
            "include_deep_features": include_deep_features,
        }
    )

    background_tasks.add_task(
        run_analysis_job,
        job_id=job.id,
        channels=channels,
        cell_diameter=cell_diameter,
        include_deep_features=include_deep_features,
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
