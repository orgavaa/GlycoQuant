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
    CompareRequest,
    CompareResult,
    EffectSize,
    JobStatusResponse,
)
from backend.app.workers import get_job_store, run_analysis_job

router = APIRouter(prefix="/analysis", tags=["analysis"])

DEMO_DIR = Path(__file__).resolve().parents[3] / "data" / "demo"
CANONICAL_CHANNELS = ("dapi", "glycocalyx", "yap", "paxillin", "actin")


EXTRACTOR_NAMES = {
    "dapi": "nuclear segmentation",
    "glycocalyx": "glycocalyx shell features",
    "yap": "YAP nuclear/cytoplasmic features",
    "paxillin": "focal-adhesion features",
    "actin": "actin cytoskeleton features",
}


def _partial_channel_mapping(n_channels: int) -> tuple[dict[str, int], list[str], list[str]]:
    """Return ``({name: index}, warnings, substitute_channels)`` for positional assignment."""
    warnings: list[str] = []
    substitutes: list[str] = []
    if n_channels >= 5:
        if n_channels > 5:
            warnings.append(
                f"Image has {n_channels} channels; used the first 5 in the "
                "canonical order DAPI, WGA, YAP, paxillin, phalloidin. "
                "Re-order your channels if this is wrong."
            )
        return {name: i for i, name in enumerate(CANONICAL_CHANNELS)}, warnings, substitutes

    mapping = {name: i for i, name in enumerate(CANONICAL_CHANNELS[:n_channels])}
    missing = CANONICAL_CHANNELS[n_channels:]
    skipped = [EXTRACTOR_NAMES[m] for m in missing]
    warnings.append(
        f"Image has {n_channels} channels; expected 5 in the order DAPI, WGA, "
        f"YAP, paxillin, phalloidin. Missing slots ({', '.join(missing)}) will be "
        f"skipped — no {', '.join(skipped)} computed."
    )
    return mapping, warnings, substitutes


def _explicit_channel_mapping(
    assignments_json: str,
    n_channels: int,
) -> tuple[dict[str, int], list[str], list[str], dict[str, str]]:
    """Parse user-provided channel assignments.

    Returns (mapping, warnings, substitute_channels, assignments_echo).
    """
    import json

    try:
        raw = json.loads(assignments_json)
    except (json.JSONDecodeError, TypeError) as exc:
        raise HTTPException(422, f"Invalid channel_assignments JSON: {exc}") from exc

    if not isinstance(raw, dict):
        raise HTTPException(422, "channel_assignments must be a JSON object")

    warnings: list[str] = []
    substitutes: list[str] = []
    mapping: dict[str, int] = {}
    echo: dict[str, str] = {}

    for idx_str, role in raw.items():
        idx = int(idx_str)
        if idx >= n_channels:
            continue
        echo[idx_str] = str(role)
        role_lower = str(role).lower().strip()
        if role_lower in ("unknown", "other", ""):
            continue
        # Map display names to canonical names
        role_map = {
            "dapi": "dapi",
            "wga-lectin": "glycocalyx", "wga": "glycocalyx", "glycocalyx": "glycocalyx",
            "yap": "yap", "yap antibody": "yap",
            "paxillin": "paxillin",
            "phalloidin": "actin", "actin": "actin",
        }
        canonical = role_map.get(role_lower)
        if canonical and canonical in CANONICAL_CHANNELS:
            mapping[canonical] = idx

    # Report skipped extractors
    for ch in CANONICAL_CHANNELS:
        if ch not in mapping and ch != "dapi":
            warnings.append(
                f"{ch.capitalize()} channel not assigned — {EXTRACTOR_NAMES[ch]} will be skipped."
            )

    return mapping, warnings, substitutes, echo


def _demo_channel_mapping(
    demo_condition: str,
    n_channels: int,
) -> tuple[dict[str, int], list[str], list[str], dict[str, str]]:
    """Build mapping from demo manifest slot_sources.

    Real channels (matches_labouesse_protocol=True) get assigned.
    Synthetic channels are excluded and added to substitute_channels.
    """
    from backend.app.routers.demo import _find_dataset

    dataset = _find_dataset(demo_condition)
    if not dataset or "slot_sources" not in dataset:
        mapping, warnings, subs = _partial_channel_mapping(n_channels)
        return mapping, warnings, subs, {}

    slot_sources = dataset.get("slot_sources", {})
    warnings: list[str] = []
    substitutes: list[str] = []
    mapping: dict[str, int] = {}
    echo: dict[str, str] = {}

    for i, ch_name in enumerate(CANONICAL_CHANNELS):
        if i >= n_channels:
            break
        source = slot_sources.get(ch_name, {})
        is_real = source.get("matches_labouesse_protocol", False)
        bio_id = source.get("biological_identity", ch_name)

        echo[str(i)] = ch_name if is_real else "substitute"

        if is_real:
            mapping[ch_name] = i
        else:
            substitutes.append(ch_name)
            note = source.get("note", "")
            short_note = note[:120] + "..." if len(note) > 120 else note
            warnings.append(
                f"{ch_name.capitalize()} slot contains \"{bio_id}\" (substitute) — "
                f"{EXTRACTOR_NAMES.get(ch_name, ch_name + ' features')} skipped. "
                f"{short_note}"
            )

    return mapping, warnings, substitutes, echo


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
    channel_assignments: str | None = Form(default=None),  # noqa: B008
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

    # 3-way channel mapping:
    # A) Explicit assignments from frontend
    # B) Demo dataset → use manifest slot_sources (real vs synthetic)
    # C) Upload with no assignments → positional default
    substitute_channels: list[str] = []
    assignments_echo: dict[str, str] = {}

    if channel_assignments is not None:
        mapping, channel_warnings, substitute_channels, assignments_echo = (
            _explicit_channel_mapping(channel_assignments, n_channels)
        )
    elif demo_condition is not None:
        mapping, channel_warnings, substitute_channels, assignments_echo = (
            _demo_channel_mapping(demo_condition, n_channels)
        )
    else:
        mapping, channel_warnings, substitute_channels = _partial_channel_mapping(n_channels)

    try:
        channels = split_into_channels(raw, mapping)
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Channel split failed: {exc}",
        ) from exc

    # Resolve pixel size: explicit form value > demo manifest entry >
    # default.
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
            "substitute_channels": substitute_channels,
            "channel_assignments": assignments_echo,
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


@router.get("/jobs/{job_id}/cells/{cell_id}/crops")
async def get_cell_crops(job_id: str, cell_id: int):
    """Return base64-encoded channel crops for a single cell.

    The raw channel arrays + cell mask are cached in the job's meta
    dict by ``run_analysis_job``. If the job has expired from the
    in-memory store or was run on Modal (where caching doesn't persist
    back to Railway), returns 404.
    """
    store = get_job_store()
    job = store.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    if job.status != "complete":
        raise HTTPException(status_code=409, detail="Job not complete yet")

    channels = job.meta.get("_channels")
    cell_mask = job.meta.get("_cell_mask")
    if channels is None or cell_mask is None:
        raise HTTPException(
            status_code=404,
            detail="Channel data not cached for this job (may have been run on Modal GPU)",
        )

    from backend.app.cell_crops import extract_cell_crops

    result = extract_cell_crops(channels, cell_mask, cell_id)
    if not result["crops"]:
        raise HTTPException(
            status_code=404,
            detail=f"Cell {cell_id} not found in the segmentation mask",
        )
    return result


@router.post("/compare", response_model=CompareResult)
async def compare_jobs(req: CompareRequest) -> CompareResult:
    """Compare two completed analysis jobs — Cohen's d + violin data."""
    import math

    import numpy as np
    import pandas as pd
    from scipy.stats import mannwhitneyu

    store = get_job_store()
    job_a = store.get(req.job_id_a)
    job_b = store.get(req.job_id_b)
    if job_a is None or job_b is None:
        raise HTTPException(status_code=404, detail="One or both jobs not found")
    if job_a.status != "complete" or job_b.status != "complete":
        raise HTTPException(status_code=409, detail="Both jobs must be complete")
    if not job_a.result or not job_b.result:
        raise HTTPException(status_code=409, detail="Both jobs must have results")

    df_a = pd.DataFrame(pd.read_json(job_a.result.features_df_json, orient="records"))
    df_b = pd.DataFrame(pd.read_json(job_b.result.features_df_json, orient="records"))

    # Features to compare — the curated mechano + glycocalyx panel
    COMPARE_FEATURES = [
        "glycocalyx_mean_intensity",
        "glycocalyx_pericellular_ratio",
        "glycocalyx_heterogeneity",
        "glycocalyx_shannon_entropy",
        "glycocalyx_haralick_contrast",
        "glycocalyx_moran_i",
        "yap_nc_ratio_size_corrected",
        "yap_nuclear_intensity",
        "fa_mature_fraction",
        "fa_density_per_um2",
        "actin_stress_fiber_coherence",
        "actin_cortical_ratio",
        "mechano_score",
        "nuclear_aspect_ratio",
        "nuclear_solidity",
        "cell_area",
    ]

    available = [f for f in COMPARE_FEATURES if f in df_a.columns and f in df_b.columns]

    effect_sizes: list[EffectSize] = []
    violin_a: dict[str, list[float]] = {}
    violin_b: dict[str, list[float]] = {}

    for feat in available:
        vals_a = df_a[feat].dropna().to_numpy(dtype=np.float64)
        vals_b = df_b[feat].dropna().to_numpy(dtype=np.float64)
        if len(vals_a) < 3 or len(vals_b) < 3:
            continue

        mean_a = float(np.mean(vals_a))
        mean_b = float(np.mean(vals_b))
        pooled_std = float(np.sqrt((np.var(vals_a) + np.var(vals_b)) / 2))
        cohens_d = float((mean_b - mean_a) / pooled_std) if pooled_std > 0 else 0.0
        try:
            _, p = mannwhitneyu(vals_a, vals_b, alternative="two-sided")
            p_val = float(p)
        except ValueError:
            p_val = 1.0
        delta_pct = float((mean_b - mean_a) / abs(mean_a) * 100) if abs(mean_a) > 1e-9 else 0.0

        effect_sizes.append(EffectSize(
            feature=feat,
            cohens_d=round(cohens_d, 3),
            p_value=round(p_val, 6),
            mean_a=round(mean_a, 4),
            mean_b=round(mean_b, 4),
            delta_pct=round(delta_pct, 1),
        ))

        # Violin data — send raw values (capped at 500 per condition for payload size)
        violin_a[feat] = [float(v) for v in vals_a[:500] if math.isfinite(v)]
        violin_b[feat] = [float(v) for v in vals_b[:500] if math.isfinite(v)]

    top_deltas = sorted(effect_sizes, key=lambda e: abs(e.cohens_d), reverse=True)[:5]

    return CompareResult(
        job_id_a=req.job_id_a,
        job_id_b=req.job_id_b,
        n_cells_a=len(df_a),
        n_cells_b=len(df_b),
        effect_sizes=effect_sizes,
        top_deltas=top_deltas,
        violin_features=available,
        violin_a=violin_a,
        violin_b=violin_b,
    )
