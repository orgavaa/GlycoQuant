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
    store = get_job_store()
    try:
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
            remote_result = run_pipeline_remote(
                channels=channels,
                cell_diameter=cell_diameter,
                include_deep_features=include_deep_features,
            )
            if channel_warnings:
                remote_result.warnings = list(remote_result.warnings) + channel_warnings
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
        segmenter = _get_segmenter()
        cell_mask, nuclear_mask = segmenter.segment_both(
            channels[_seg_channel(channels)],
            channels["dapi"],
            cell_diameter=float(cell_diameter),
        )

        store.update(job_id, phase="extracting", pct=55, message="Measuring features for every detected cell")
        embedder = None
        if include_deep_features:
            embedder = _get_embedder()
        assembler = ProfileAssembler(
            config=AssemblerConfig(
                include_deep_features=include_deep_features,
                pixel_size_um=pixel_size_um,
            ),
            dinov2_embedder=embedder,
        )
        features_df = assembler.process_image(
            channels, cell_mask=cell_mask, nuclear_mask=nuclear_mask
        )
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
        )
        if channel_warnings:
            result.warnings = list(result.warnings) + channel_warnings

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
    """Lazy, cached DINOv2 embedder — loaded once per process."""
    global _EMBEDDER_SINGLETON
    if _EMBEDDER_SINGLETON is None:
        from glycoquant.compute import describe_device, resolve_device
        from glycoquant.features.deep_embedding import (
            DinoV2Embedder,
            DinoV2Params,
        )

        print(f"[worker] initialising DinoV2Embedder on {describe_device()}")
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

    # Segmentation figure: build via the same overlay logic, serialized to JSON
    seg_fig = _build_segmentation_figure(channels, cell_mask, nuclear_mask, features_df)

    # Radial profile figure: re-run the assembler with radial profile inclusion
    radial_assembler = ProfileAssembler(
        config=AssemblerConfig(
            include_radial_profile=True,
            pixel_size_um=pixel_size_um,
        )
    )
    df_with_profile = radial_assembler.process_image(
        channels, cell_mask=cell_mask, nuclear_mask=nuclear_mask
    )
    profile_cols = [
        c for c in df_with_profile.columns if c.startswith("glycocalyx_radial_profile_")
    ]
    if profile_cols:
        profiles = df_with_profile[profile_cols].to_numpy().astype(np.float32)
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
        radial_profile_figure_json=radial_fig.to_json(),
        correlation_figure_json=corr_fig.to_json(),
        glyco_mechano_correlation_figure_json=glyco_mechano_fig.to_json(),
        mechano_score_distribution_figure_json=score_dist_fig.to_json(),
        mechano_score_summary=summary_payload,
        hero_metrics=hero_metrics,
        has_deep_features=include_deep_features,
    )


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

    base = downsample_for_display(channels[_seg_channel(channels)]).astype(np.float32)
    # Percentile contrast stretch so faint cytoplasmic channels render at a
    # legible brightness — mirrors the HPA preview endpoint.
    finite = base[np.isfinite(base)]
    if finite.size:
        lo, hi = np.percentile(finite, (1.0, 99.5))
        if hi > lo:
            base = np.clip((base - lo) / (hi - lo), 0.0, 1.0)
    h, w = base.shape[:2]
    scale_y = base.shape[0] / cell_mask.shape[0]
    scale_x = base.shape[1] / cell_mask.shape[1]

    fig = go.Figure()
    fig.add_trace(
        go.Heatmap(
            z=base,
            zmin=0.0,
            zmax=1.0,
            colorscale="Magma",
            showscale=False,
            hoverinfo="skip",
        )
    )

    # Cell outlines — bright cyan on magma for maximum contrast
    for cell_id, contour in cell_outline_polygons(cell_mask).items():
        fig.add_trace(
            go.Scatter(
                x=contour[:, 1] * scale_x,
                y=contour[:, 0] * scale_y,
                mode="lines",
                fill="toself",
                fillcolor="rgba(94, 234, 212, 0.10)",
                line={"color": "#5EEAD4", "width": 1.6},
                customdata=[cell_id] * len(contour),
                hovertemplate=f"<b>Cell {cell_id}</b><extra></extra>",
                name=f"Cell {cell_id}",
                showlegend=False,
                legendgroup="cells",
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
            "plot_bgcolor": "#FFFFFF",
        }
    )
    fig.update_layout(**layout)
    return fig
