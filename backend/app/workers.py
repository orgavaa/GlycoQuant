"""Background analysis-job runner with an in-memory job store.

FastAPI's ``BackgroundTasks`` executes after the HTTP response is sent,
which is perfect for our use case — the client gets an immediate
``job_id`` and polls ``/jobs/{id}`` for progress. Jobs are stored in a
process-local dict guarded by a threading lock; they do not persist
across restarts. For a demo platform this is fine; if we ever need
durability we'll swap to SQLite or Redis behind the same
``JobStore`` interface.
"""
from __future__ import annotations

import threading
import traceback
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from backend.app.schemas import (
    JobPhase,
    JobProgress,
    JobResult,
    JobStatus,
    MechanoScoreSummary as MechanoScoreSummarySchema,
)


@dataclass
class Job:
    id: str
    status: JobStatus
    progress: JobProgress
    created_at: datetime
    finished_at: datetime | None = None
    result: JobResult | None = None
    error: str | None = None
    meta: dict[str, Any] = field(default_factory=dict)


class JobStore:
    """Thread-safe in-memory store for analysis jobs."""

    def __init__(self) -> None:
        self._jobs: dict[str, Job] = {}
        self._lock = threading.Lock()

    def create(self, meta: dict[str, Any] | None = None) -> Job:
        """Register a new queued job and return its handle."""
        job_id = uuid4().hex
        now = datetime.now(tz=timezone.utc)
        job = Job(
            id=job_id,
            status="queued",
            progress=JobProgress(phase="idle", pct=0, message="Queued for analysis"),
            created_at=now,
            meta=meta or {},
        )
        with self._lock:
            self._jobs[job_id] = job
        return job

    def get(self, job_id: str) -> Job | None:
        with self._lock:
            return self._jobs.get(job_id)

    def update(
        self,
        job_id: str,
        *,
        status: JobStatus | None = None,
        phase: JobPhase | None = None,
        pct: int | None = None,
        message: str | None = None,
        result: JobResult | None = None,
        error: str | None = None,
    ) -> None:
        """Patch any subset of a job's state atomically."""
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return
            if status is not None:
                job.status = status
            if phase is not None or pct is not None or message is not None:
                job.progress = JobProgress(
                    phase=phase if phase is not None else job.progress.phase,
                    pct=pct if pct is not None else job.progress.pct,
                    message=(
                        message if message is not None else job.progress.message
                    ),
                )
            if result is not None:
                job.result = result
            if error is not None:
                job.error = error
            if status in ("complete", "failed"):
                job.finished_at = datetime.now(tz=timezone.utc)

    def all_ids(self) -> list[str]:
        with self._lock:
            return list(self._jobs.keys())


# Process-local singleton
_STORE = JobStore()


def get_job_store() -> JobStore:
    return _STORE


# ---------------------------------------------------------------------------
# Worker function — executed by FastAPI BackgroundTasks
# ---------------------------------------------------------------------------


def run_analysis_job(
    job_id: str,
    channels: dict[str, Any],  # dict[str, np.ndarray], kept generic to avoid top-level numpy import
    cell_diameter: int,
    include_deep_features: bool,
    pixel_size_um: float = 0.325,
) -> None:
    """Run the full Tab 1 pipeline for one image in the background.

    Pulls the heavy imports lazily so FastAPI app startup stays fast —
    Cellpose, DINOv2, and scikit-image all live behind this function.
    """
    import time as _time

    store = get_job_store()
    try:
        _t0 = _time.monotonic()
        store.update(job_id, status="running", phase="segmenting", pct=5, message="Preparing the analysis")

        # Channel-count warnings recorded by the router when a non-
        # canonical upload was mapped into a partial channel dict.
        job = store.get(job_id)
        channel_warnings: list[str] = list(
            (job.meta.get("channel_warnings", []) if job else []) or []
        )

        # Remote GPU dispatch: when GLYCOQUANT_GPU_PROVIDER=modal, the
        # entire heavy pipeline runs on a Modal L4 container and we
        # only parse the returned JobResult back into the store. The
        # local code path below is preserved for laptop dev runs and
        # CPU-fallback Railway deployments.
        from backend.app.gpu_client import get_provider, run_pipeline_remote

        if get_provider() == "modal":
            store.update(
                job_id,
                phase="segmenting",
                pct=20,
                message="Running on remote GPU",
            )
            print(f"[worker] dispatching job {job_id} to Modal GPU")
            try:
                remote_result = run_pipeline_remote(
                    channels=channels,
                    cell_diameter=cell_diameter,
                    include_deep_features=include_deep_features,
                )
            except Exception as modal_exc:
                print(f"[worker] Modal dispatch FAILED: {modal_exc}")
                raise
            print(f"[worker] Modal returned result for job {job_id}: {remote_result.cell_count} cells")
            if channel_warnings:
                remote_result.warnings = list(remote_result.warnings) + channel_warnings
            # Propagate channel metadata
            job_for_meta = store.get(job_id)
            if job_for_meta is not None:
                remote_result.substitute_channels = list(job_for_meta.meta.get("substitute_channels", []))
                remote_result.channel_assignments = job_for_meta.meta.get("channel_assignments")
            store.update(
                job_id,
                status="complete",
                phase="done",
                pct=100,
                message=f"Done — {remote_result.cell_count} cells analysed",
                result=remote_result,
            )
            return

        from glycoquant.profiles import AssemblerConfig, ProfileAssembler

        store.update(job_id, phase="segmenting", pct=15, message="Detecting cells and nuclei")
        _t1 = _time.monotonic()
        segmenter = _get_segmenter()
        cell_mask, nuclear_mask = segmenter.segment_both(
            channels[_seg_channel(channels)],
            channels["dapi"],
            cell_diameter=float(cell_diameter),
        )
        _t2 = _time.monotonic()
        n_cells = int((cell_mask > 0).max() and len(set(cell_mask.flat) - {0}))
        print(f"[worker] segmentation: {_t2 - _t1:.1f}s ({n_cells} cells)")

        store.update(job_id, phase="extracting", pct=55, message="Measuring features for every detected cell")
        embedder = None
        if include_deep_features:
            embedder = _get_embedder()
        assembler = ProfileAssembler(
            config=AssemblerConfig(
                include_deep_features=include_deep_features,
                include_radial_profile=True,
                pixel_size_um=pixel_size_um,
            ),
            dinov2_embedder=embedder,
        )
        features_df = assembler.process_image(
            channels, cell_mask=cell_mask, nuclear_mask=nuclear_mask
        )
        _t3 = _time.monotonic()
        print(f"[worker] feature extraction + embeddings: {_t3 - _t2:.1f}s ({len(features_df)} cells)")
        mechano_summary = assembler.last_mechano_summary

        if include_deep_features:
            store.update(job_id, phase="embedding", pct=75, message="Computing visual embeddings")

        store.update(job_id, phase="extracting", pct=85, message="Preparing charts")
        result = _build_result_payload(
            channels=channels,
            cell_mask=cell_mask,
            nuclear_mask=nuclear_mask,
            features_df=features_df,
            include_deep_features=include_deep_features,
            pixel_size_um=pixel_size_um,
            mechano_summary=mechano_summary,
            embedder_backend=(
                embedder.backend_name() if embedder is not None else None
            ),
        )
        _t4 = _time.monotonic()
        print(f"[worker] chart generation: {_t4 - _t3:.1f}s")
        print(f"[worker] total pipeline: {_t4 - _t0:.1f}s")
        if channel_warnings:
            result.warnings = list(result.warnings) + channel_warnings

        # Propagate channel metadata from the job store
        job_meta = store.get(job_id)
        if job_meta is not None:
            result.substitute_channels = list(job_meta.meta.get("substitute_channels", []))
            result.channel_assignments = job_meta.meta.get("channel_assignments")

        # Cache channels + masks for the per-cell crops endpoint.
        # ~50 MB per job; fine for a demo with <10 concurrent jobs.
        job = store.get(job_id)
        if job is not None:
            job.meta["_channels"] = channels
            job.meta["_cell_mask"] = cell_mask
            job.meta["_nuclear_mask"] = nuclear_mask

        store.update(
            job_id,
            status="complete",
            phase="done",
            pct=100,
            message=f"Done — {len(features_df)} cells analysed",
            result=result,
        )
    except Exception as exc:  # noqa: BLE001 - surface any failure to the client
        store.update(
            job_id,
            status="failed",
            phase="idle",
            pct=0,
            message="Pipeline failed",
            error=f"{type(exc).__name__}: {exc}\n{traceback.format_exc()}",
        )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_SEGMENTER_SINGLETON = None
_EMBEDDER_SINGLETON = None


def _get_segmenter():  # noqa: ANN202
    """Lazy, cached Cellpose segmenter — loaded once per process.

    Uses ``glycoquant.compute.use_gpu()`` so the Railway GPU service
    just works without any source changes; ``GLYCOQUANT_DEVICE=cuda``
    in the Railway env var forces CUDA, otherwise we auto-detect.
    """
    global _SEGMENTER_SINGLETON
    if _SEGMENTER_SINGLETON is None:
        from glycoquant.compute import describe_device, use_gpu
        from glycoquant.segmentation import CellSegmenter

        print(f"[worker] initialising CellSegmenter on {describe_device()}")
        _SEGMENTER_SINGLETON = CellSegmenter(gpu=use_gpu())
    return _SEGMENTER_SINGLETON


def _get_embedder():  # noqa: ANN202
    """Lazy, cached deep embedder — loaded once per process.

    Dispatch rule (per docs/CELL_DINO_SETUP.md):

    - If ``GLYCOQUANT_CELL_DINO_CKPT`` is set and points to an existing
      file, load Cell-DINO ``channel_adaptive_dino_vitl16`` from that
      checkpoint via the dinov2 submodule. This is the FAIR
      Non-Commercial Research License path; available only after the
      operator has accepted the form at
      https://ai.meta.com/resources/models-and-libraries/cell-dino-downloads/
    - Otherwise fall back to the natural-image ``facebook/dinov2-base``
      via HuggingFace transformers (Apache-2.0). This is the default
      and runs in CI without any extra setup.

    Both backends share the ``embed_image_with_masks`` and
    ``column_names`` interface, so ``ProfileAssembler._attach_deep_features``
    is unaware of which one is active.
    """
    global _EMBEDDER_SINGLETON
    if _EMBEDDER_SINGLETON is None:
        import os
        from pathlib import Path

        from glycoquant.compute import describe_device, resolve_device

        # Default checkpoint path — can be overridden by env var
        default_ckpt = str(
            Path(__file__).resolve().parents[2] / "models" / "channel_adaptive_dino_vitl16.pth"
        )
        ckpt = os.environ.get("GLYCOQUANT_CELL_DINO_CKPT", default_ckpt)

        # Auto-download from HuggingFace if checkpoint doesn't exist yet.
        # This runs ONCE per container start and takes ~30s on a fast
        # connection. Bypasses all Docker build cache issues.
        HF_URL = "https://huggingface.co/orgava/glycoquant-models/resolve/main/channel_adaptive_dino_vitl16.pth"
        if not Path(ckpt).is_file():
            print(f"[worker] Cell-DINO checkpoint not found at {ckpt}")
            print(f"[worker] downloading from HuggingFace (~1.2 GB)...")
            Path(ckpt).parent.mkdir(parents=True, exist_ok=True)
            try:
                import urllib.request
                urllib.request.urlretrieve(HF_URL, ckpt)
                size_mb = Path(ckpt).stat().st_size / (1024 * 1024)
                print(f"[worker] downloaded Cell-DINO checkpoint ({size_mb:.0f} MB)")
            except Exception as exc:
                print(f"[worker] download failed: {exc} — falling back to DINOv2-base")

        if Path(ckpt).is_file():
            from glycoquant.features.deep_embedding import (
                ChannelAdaptiveDinoEmbedder,
                ChannelAdaptiveDinoParams,
            )

            print(
                f"[worker] initialising Cell-DINO ViT-L/16 "
                f"(channel-adaptive) from {ckpt} on {describe_device()}"
            )
            _EMBEDDER_SINGLETON = ChannelAdaptiveDinoEmbedder(
                params=ChannelAdaptiveDinoParams(
                    checkpoint_path=ckpt,
                    device=resolve_device(),
                )
            )
        else:
            from glycoquant.features.deep_embedding import (
                DinoV2Embedder,
                DinoV2Params,
            )

            print(
                f"[worker] Cell-DINO unavailable — "
                f"using DINOv2-base fallback on {describe_device()}"
            )
            _EMBEDDER_SINGLETON = DinoV2Embedder(
                params=DinoV2Params(device=resolve_device())
            )
    return _EMBEDDER_SINGLETON


def _seg_channel(channels: dict[str, Any]) -> str:
    for preferred in ("actin", "glycocalyx", "paxillin"):
        if preferred in channels:
            return preferred
    return next(iter(channels))


def _build_result_payload(
    channels: dict[str, Any],
    cell_mask,  # noqa: ANN001
    nuclear_mask,  # noqa: ANN001
    features_df,  # noqa: ANN001
    include_deep_features: bool,
    pixel_size_um: float = 0.325,
    mechano_summary=None,  # noqa: ANN001 - MechanoScoreSummary | None
    embedder_backend: str | None = None,
) -> JobResult:
    """Package masks + features + plotly figures into a JobResult."""
    import numpy as np

    from glycoquant.io import hash_image_bytes
    from glycoquant.profiles import AssemblerConfig, ProfileAssembler
    from glycoquant.viz import (
        plot_correlation_map,
        plot_glyco_mechano_correlation,
        plot_mechano_score_distribution,
        plot_radial_profile,
    )

    # Build an image_hash so the frontend can key caches
    base_channel = channels[_seg_channel(channels)]
    image_hash = hash_image_bytes(base_channel)

    # Compute hero metrics
    def _mean_safe(col: str) -> float | None:
        if col in features_df.columns and features_df[col].notna().any():
            return float(features_df[col].mean())
        return None

    # Channel PNGs for additive compositing in the frontend
    channel_pngs = _build_channel_pngs(channels)

    # Segmentation figure: build via the same overlay logic, serialized to JSON
    seg_fig, channel_trace_indices, overlay_trace_ranges = _build_segmentation_figure(channels, cell_mask, nuclear_mask, features_df)

    # Radial profile figure: use profile columns already in features_df
    # (include_radial_profile=True is now set in the main assembler call)
    profile_cols = [
        c for c in features_df.columns if c.startswith("glycocalyx_radial_profile_")
    ]
    if profile_cols:
        profiles = features_df[profile_cols].to_numpy().astype(np.float32)
        radial_fig = plot_radial_profile(profiles)
    else:
        import plotly.graph_objects as go

        radial_fig = go.Figure()

    # Correlation heatmap — drop deep feature cols for clarity
    numeric_df = features_df.select_dtypes(include=[np.number])
    numeric_df = numeric_df.loc[:, ~numeric_df.columns.str.startswith("deep_")]
    if numeric_df.shape[1] >= 2:
        corr_fig = plot_correlation_map(numeric_df)
    else:
        import plotly.graph_objects as go

        corr_fig = go.Figure()

    # Headline figure: rectangular glyco × mechano correlation matrix.
    # Returns the bundle so we can populate the
    # mechano_score_summary.top_correlation_* fields without re-walking.
    glyco_mechano_fig, glyco_mechano_result = plot_glyco_mechano_correlation(
        features_df
    )
    score_dist_fig = plot_mechano_score_distribution(features_df)

    summary_payload: MechanoScoreSummarySchema | None = None
    if mechano_summary is not None:
        summary_payload = MechanoScoreSummarySchema(
            mode=mechano_summary.mode,
            n_cells_used=mechano_summary.n_cells_used,
            n_features_used=mechano_summary.n_features_used,
            pc1_variance_explained=mechano_summary.pc1_variance_explained,
            loadings=mechano_summary.loadings,
            mean=mechano_summary.mean if np.isfinite(mechano_summary.mean) else None,
            std=mechano_summary.std if np.isfinite(mechano_summary.std) else None,
            top_correlation_r=(
                float(glyco_mechano_result.top_r)
                if glyco_mechano_result.top_pair is not None
                else None
            ),
            top_correlation_pair=glyco_mechano_result.top_pair,
        )

    hero_metrics = {
        "cell_count": float(len(features_df)),
        "mean_yap_nc": _mean_safe("yap_nc_ratio"),
        "mean_yap_nc_size_corrected": _mean_safe("yap_nc_ratio_size_corrected"),
        "mean_fa_count": _mean_safe("fa_count"),
        "mean_fa_mature_fraction": _mean_safe("fa_mature_fraction"),
        "mean_actin_coherence": _mean_safe("actin_stress_fiber_coherence"),
        "mean_glycocalyx_ratio": _mean_safe("glycocalyx_pericellular_ratio"),
        "mean_mechano_score": _mean_safe("mechano_score"),
        "top_glyco_mechano_r": (
            float(glyco_mechano_result.top_r)
            if glyco_mechano_result.top_pair is not None
            else None
        ),
    }

    return JobResult(
        image_hash=image_hash,
        cell_count=len(features_df),
        features_df_json=features_df.reset_index().to_json(orient="records"),
        segmentation_figure_json=seg_fig.to_json(),
        channel_trace_indices=channel_trace_indices,
        overlay_trace_ranges=overlay_trace_ranges,
        channel_pngs=channel_pngs,
        radial_profile_figure_json=radial_fig.to_json(),
        correlation_figure_json=corr_fig.to_json(),
        glyco_mechano_correlation_figure_json=glyco_mechano_fig.to_json(),
        mechano_score_distribution_figure_json=score_dist_fig.to_json(),
        mechano_score_summary=summary_payload,
        hero_metrics=hero_metrics,
        has_deep_features=include_deep_features,
        deep_embedding_backend=(
            embedder_backend if include_deep_features else None
        ),
    )


def _build_channel_pngs(channels: dict[str, Any]) -> dict[str, str]:
    """Render each channel as a base64 PNG with a channel-specific LUT.

    The frontend stacks these as <img> elements with mix-blend-mode:screen
    for additive compositing — the standard microscopy channel display.
    Uses FULL resolution — no downsampling — so the image quality matches
    the raw input exactly.
    """
    import base64
    import io

    import numpy as np
    from PIL import Image

    # Channel-specific RGB LUT colors (applied as a tint on grayscale)
    LUTS: dict[str, tuple[int, int, int]] = {
        "dapi": (74, 144, 217),      # Blue
        "glycocalyx": (76, 175, 80),  # Green
        "yap": (224, 64, 251),        # Magenta
        "paxillin": (255, 152, 0),    # Orange
        "actin": (200, 200, 200),     # Light gray (structural)
    }

    result: dict[str, str] = {}
    for ch_name in ("dapi", "glycocalyx", "yap", "paxillin", "actin"):
        if ch_name not in channels:
            continue
        ch = channels[ch_name].astype(np.float32)
        # Percentile contrast stretch
        finite = ch[np.isfinite(ch)]
        if finite.size:
            lo, hi = np.percentile(finite, (1.0, 99.5))
            if hi > lo:
                ch = np.clip((ch - lo) / (hi - lo), 0.0, 1.0)
            else:
                ch = np.zeros_like(ch)
        else:
            ch = np.zeros_like(ch)

        # Apply LUT: grayscale × RGB tint → 3-channel uint8
        r_tint, g_tint, b_tint = LUTS.get(ch_name, (200, 200, 200))
        h, w = ch.shape
        rgb = np.zeros((h, w, 3), dtype=np.uint8)
        rgb[:, :, 0] = np.clip(ch * r_tint, 0, 255).astype(np.uint8)
        rgb[:, :, 1] = np.clip(ch * g_tint, 0, 255).astype(np.uint8)
        rgb[:, :, 2] = np.clip(ch * b_tint, 0, 255).astype(np.uint8)

        img = Image.fromarray(rgb, "RGB")
        buf = io.BytesIO()
        img.save(buf, format="PNG", optimize=True)
        b64 = base64.b64encode(buf.getvalue()).decode("ascii")
        result[ch_name] = f"data:image/png;base64,{b64}"

    return result


def _build_segmentation_figure(
    channels: dict[str, Any],
    cell_mask,  # noqa: ANN001
    nuclear_mask,  # noqa: ANN001
    features_df,  # noqa: ANN001
):  # noqa: ANN202
    """Base image heatmap + transparent cell-outline polygons for the React viewer."""
    import numpy as np
    import plotly.graph_objects as go

    from glycoquant.io import downsample_for_display
    from glycoquant.theme import get_plotly_layout_template
    from glycoquant.viz import cell_outline_polygons

    # Per-channel colorscales matched to biological identity
    CHANNEL_COLORSCALES = {
        "dapi": "Blues",
        "glycocalyx": "Greens",
        "yap": "Magenta",
        "paxillin": "Oranges",
        "actin": "Magma",
    }
    DEFAULT_CHANNEL = _seg_channel(channels)

    # Render ALL 5 channels as separate Heatmap traces. Only the default
    # is visible; the frontend swaps via Plotly.restyle.
    channel_trace_indices: dict[str, int] = {}
    first_channel_data = None
    trace_idx = 0

    for ch_name in ("dapi", "glycocalyx", "yap", "paxillin", "actin"):
        if ch_name not in channels:
            continue
        ch_data = downsample_for_display(channels[ch_name]).astype(np.float32)
        finite = ch_data[np.isfinite(ch_data)]
        if finite.size:
            lo, hi = np.percentile(finite, (1.0, 99.5))
            if hi > lo:
                ch_data = np.clip((ch_data - lo) / (hi - lo), 0.0, 1.0)
        if first_channel_data is None:
            first_channel_data = ch_data
        channel_trace_indices[ch_name] = trace_idx
        trace_idx += 1

    base = first_channel_data if first_channel_data is not None else np.zeros((100, 100))
    h, w = base.shape[:2]
    scale_y = base.shape[0] / cell_mask.shape[0]
    scale_x = base.shape[1] / cell_mask.shape[1]

    fig = go.Figure()

    for ch_name in ("dapi", "glycocalyx", "yap", "paxillin", "actin"):
        if ch_name not in channels:
            continue
        ch_data = downsample_for_display(channels[ch_name]).astype(np.float32)
        finite = ch_data[np.isfinite(ch_data)]
        if finite.size:
            lo, hi = np.percentile(finite, (1.0, 99.5))
            if hi > lo:
                ch_data = np.clip((ch_data - lo) / (hi - lo), 0.0, 1.0)
        fig.add_trace(
            go.Heatmap(
                z=ch_data,
                zmin=0.0,
                zmax=1.0,
                colorscale=CHANNEL_COLORSCALES.get(ch_name, "Magma"),
                showscale=False,
                hoverinfo="skip",
                visible=(ch_name == DEFAULT_CHANNEL),
                name=f"channel_{ch_name}",
            )
        )

    # Build a per-cell lookup for the 4 key metrics shown in hover tooltips
    import math

    def _val(cell_id: int, col: str) -> str:
        """Fetch a feature value for hover display, '—' if missing."""
        if col not in features_df.columns:
            return "—"
        try:
            row = features_df.loc[float(cell_id)]
            v = float(row[col])
            if not math.isfinite(v):
                return "—"
            return f"{v:.2f}"
        except (KeyError, TypeError, ValueError):
            return "—"

    # Cell outlines — bright cyan on magma for maximum contrast.
    # Each trace carries 4 key metrics in customdata so the Plotly
    # tooltip renders them on hover without any frontend change.
    for cell_id, contour in cell_outline_polygons(cell_mask).items():
        glyco = _val(cell_id, "glycocalyx_pericellular_ratio")
        yap = _val(cell_id, "yap_nc_ratio_size_corrected")
        mechano = _val(cell_id, "mechano_score")
        fa = _val(cell_id, "fa_mature_fraction")

        n_pts = len(contour)
        fig.add_trace(
            go.Scatter(
                x=contour[:, 1] * scale_x,
                y=contour[:, 0] * scale_y,
                mode="lines",
                fill="toself",
                fillcolor="rgba(94, 234, 212, 0.10)",
                line={"color": "#5EEAD4", "width": 1.6},
                customdata=[[cell_id, glyco, yap, mechano, fa]] * n_pts,
                hovertemplate=(
                    "<b>Cell %{customdata[0]}</b><br>"
                    "Glycocalyx ratio: %{customdata[1]}<br>"
                    "YAP N/C (corr): %{customdata[2]}<br>"
                    "Mechano score: %{customdata[3]}<br>"
                    "FA mature frac: %{customdata[4]}"
                    "<extra></extra>"
                ),
                name=f"Cell {cell_id}",
                showlegend=False,
                legendgroup="cells",
            )
        )

    # ------------------------------------------------------------------
    # Per-cell heatmap fill overlays — two blocks of filled polygons,
    # one colored by glycocalyx_pericellular_ratio (Viridis), one by
    # mechano_score (RdBu centered on 0). Both start visible=False;
    # the frontend toggles them via Plotly.restyle.
    # ------------------------------------------------------------------

    def _float_val(cell_id: int, col: str) -> float:
        if col not in features_df.columns:
            return float("nan")
        try:
            return float(features_df.loc[float(cell_id), col])
        except (KeyError, TypeError, ValueError):
            return float("nan")

    # Collect feature values for colorscale normalization
    all_glyco = [_float_val(cid, "glycocalyx_pericellular_ratio") for cid in cell_outline_polygons(cell_mask)]
    all_mechano = [_float_val(cid, "mechano_score") for cid in cell_outline_polygons(cell_mask)]
    finite_glyco = [v for v in all_glyco if math.isfinite(v)]
    finite_mechano = [v for v in all_mechano if math.isfinite(v)]
    glyco_min = min(finite_glyco) if finite_glyco else 0.0
    glyco_max = max(finite_glyco) if finite_glyco else 1.0
    mechano_abs = max(abs(min(finite_mechano)) if finite_mechano else 1.0,
                      abs(max(finite_mechano)) if finite_mechano else 1.0)

    # Viridis hex ramp for glycocalyx (5 stops)
    VIRIDIS = ["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725"]
    # RdBu for mechano (diverging, centered on 0)
    RDBU = ["#b2182b", "#ef8a62", "#f7f7f7", "#67a9cf", "#2166ac"]

    def _hex_to_rgba(hex_color: str, alpha: float = 0.5) -> str:
        """Convert #RRGGBB to rgba(r,g,b,alpha) for Plotly compatibility."""
        h = hex_color.lstrip("#")
        r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
        return f"rgba({r},{g},{b},{alpha})"

    def _viridis_color(val: float, vmin: float, vmax: float) -> str:
        if not math.isfinite(val) or vmax <= vmin:
            return "rgba(100,100,100,0.2)"
        t = max(0.0, min(1.0, (val - vmin) / (vmax - vmin)))
        idx = min(int(t * (len(VIRIDIS) - 1)), len(VIRIDIS) - 2)
        return _hex_to_rgba(VIRIDIS[idx], 0.5)

    def _rdbu_color(val: float, vabs: float) -> str:
        if not math.isfinite(val) or vabs <= 0:
            return "rgba(100,100,100,0.2)"
        t = max(0.0, min(1.0, (val + vabs) / (2.0 * vabs)))
        idx = min(int(t * (len(RDBU) - 1)), len(RDBU) - 2)
        return _hex_to_rgba(RDBU[idx], 0.5)

    overlay_trace_ranges: dict[str, list[int]] = {"glycocalyx": [], "mechano": []}

    # Glycocalyx fill overlay
    for cell_id, contour in cell_outline_polygons(cell_mask).items():
        val = _float_val(cell_id, "glycocalyx_pericellular_ratio")
        color = _viridis_color(val, glyco_min, glyco_max)
        trace_idx = len(fig.data)
        overlay_trace_ranges["glycocalyx"].append(trace_idx)
        fig.add_trace(
            go.Scatter(
                x=contour[:, 1] * scale_x,
                y=contour[:, 0] * scale_y,
                mode="lines",
                fill="toself",
                fillcolor=color,
                line={"color": color, "width": 0.5},
                hoverinfo="skip",
                visible=False,
                showlegend=False,
            )
        )

    # Mechano fill overlay
    for cell_id, contour in cell_outline_polygons(cell_mask).items():
        val = _float_val(cell_id, "mechano_score")
        color = _rdbu_color(val, mechano_abs)
        trace_idx = len(fig.data)
        overlay_trace_ranges["mechano"].append(trace_idx)
        fig.add_trace(
            go.Scatter(
                x=contour[:, 1] * scale_x,
                y=contour[:, 0] * scale_y,
                mode="lines",
                fill="toself",
                fillcolor=color,
                line={"color": color, "width": 0.5},
                hoverinfo="skip",
                visible=False,
                showlegend=False,
            )
        )

    # ------------------------------------------------------------------
    # Layer 4a: FA detection overlay — colored by maturation class
    # ------------------------------------------------------------------
    FA_MATURATION_COLORS = {
        "nascent": "rgba(0,188,212,0.7)",      # cyan
        "focal_complex": "rgba(255,235,59,0.7)", # yellow
        "mature": "rgba(255,152,0,0.8)",         # orange
        "fibrillar": "rgba(244,67,54,0.8)",      # red
    }
    overlay_trace_ranges["fa_overlay"] = []

    if "paxillin" in channels:
        from glycoquant.features import FocalAdhesionParams, detect_focal_adhesions

        fa_params = FocalAdhesionParams(pixel_size_um=0.656)
        for cell_id in cell_outline_polygons(cell_mask):
            regions = detect_focal_adhesions(
                channels["paxillin"], cell_mask, cell_id, fa_params
            )
            for region in regions:
                major_um = region.axis_major_length * fa_params.pixel_size_um
                if major_um < fa_params.nascent_max_um:
                    color = FA_MATURATION_COLORS["nascent"]
                elif major_um < fa_params.focal_complex_max_um:
                    color = FA_MATURATION_COLORS["focal_complex"]
                elif major_um < fa_params.mature_max_um:
                    color = FA_MATURATION_COLORS["mature"]
                else:
                    color = FA_MATURATION_COLORS["fibrillar"]

                cy, cx = region.centroid
                r_major = region.axis_major_length / 2 * scale_y
                r_minor = max(1, region.axis_minor_length / 2 * scale_x)

                # Draw as a small circle/ellipse marker at the FA centroid
                trace_idx = len(fig.data)
                overlay_trace_ranges["fa_overlay"].append(trace_idx)
                fig.add_trace(
                    go.Scatter(
                        x=[cx * scale_x],
                        y=[cy * scale_y],
                        mode="markers",
                        marker={
                            "size": max(4, min(12, r_major * 2)),
                            "color": color,
                            "symbol": "diamond" if major_um >= fa_params.mature_max_um else "circle",
                            "line": {"width": 0.5, "color": "rgba(255,255,255,0.3)"},
                        },
                        hovertemplate=(
                            f"FA · cell {cell_id}<br>"
                            f"major axis: {major_um:.1f} µm<br>"
                            f"area: {region.area * fa_params.pixel_size_um**2:.1f} µm²"
                            "<extra></extra>"
                        ),
                        visible=False,
                        showlegend=False,
                    )
                )

    # ------------------------------------------------------------------
    # Layer 4b: YAP compartment overlay — nuclear/cytoplasmic outlines
    # ------------------------------------------------------------------
    overlay_trace_ranges["yap_compartment"] = []

    from glycoquant.viz import nuclear_outline_polygons
    from skimage.measure import regionprops

    for cell_id, nuc_contour in nuclear_outline_polygons(nuclear_mask).items():
        # Nuclear outline in magenta
        trace_idx = len(fig.data)
        overlay_trace_ranges["yap_compartment"].append(trace_idx)
        fig.add_trace(
            go.Scatter(
                x=nuc_contour[:, 1] * scale_x,
                y=nuc_contour[:, 0] * scale_y,
                mode="lines",
                line={"color": "rgba(224,64,251,0.6)", "width": 1.5},
                hoverinfo="skip",
                visible=False,
                showlegend=False,
            )
        )

        # N/C ratio label at nuclear centroid
        nuc_props = regionprops((nuclear_mask == cell_id).astype(np.uint8))
        if nuc_props:
            ncy, ncx = nuc_props[0].centroid
            yap_val = _val(cell_id, "yap_nc_ratio_size_corrected")
            trace_idx = len(fig.data)
            overlay_trace_ranges["yap_compartment"].append(trace_idx)
            fig.add_trace(
                go.Scatter(
                    x=[ncx * scale_x],
                    y=[ncy * scale_y],
                    mode="text",
                    text=[yap_val],
                    textfont={"size": 8, "color": "rgba(224,64,251,0.8)"},
                    hoverinfo="skip",
                    visible=False,
                    showlegend=False,
                )
            )

    # ------------------------------------------------------------------
    # Layer 4c: Pericellular ring overlay — WGA measurement region
    # ------------------------------------------------------------------
    overlay_trace_ranges["pericellular_ring"] = []

    from scipy.ndimage import binary_dilation

    for cell_id, contour in cell_outline_polygons(cell_mask).items():
        this_cell = cell_mask == cell_id
        # Build the outer ring boundary (dilated cell edge)
        ring_width = max(3, int(round(0.1 * np.sqrt(float(this_cell.sum()) / np.pi) * 2)))
        dilated = binary_dilation(this_cell, iterations=ring_width)
        ring_mask = dilated & ~this_cell

        # Find the ring outer contour
        from skimage.measure import find_contours
        ring_contours = find_contours(ring_mask.astype(np.float32), 0.5)
        if ring_contours:
            outer = max(ring_contours, key=len)
            trace_idx = len(fig.data)
            overlay_trace_ranges["pericellular_ring"].append(trace_idx)
            fig.add_trace(
                go.Scatter(
                    x=outer[:, 1] * scale_x,
                    y=outer[:, 0] * scale_y,
                    mode="lines",
                    fill="toself",
                    fillcolor="rgba(76,175,80,0.15)",
                    line={"color": "rgba(76,175,80,0.4)", "width": 1},
                    hoverinfo="skip",
                    visible=False,
                    showlegend=False,
                )
            )

    layout = get_plotly_layout_template()
    layout.update(
        {
            "xaxis": {"visible": False, "range": [0, w]},
            "yaxis": {"visible": False, "range": [h, 0], "scaleanchor": "x"},
            "margin": {"l": 0, "r": 0, "t": 0, "b": 0},
            "height": 560,
            "showlegend": False,
            "plot_bgcolor": "rgba(0,0,0,0)",
        }
    )
    fig.update_layout(**layout)
    return fig, channel_trace_indices, overlay_trace_ranges
