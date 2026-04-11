"""Pydantic request/response schemas for the backend API."""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

JobStatus = Literal["queued", "running", "complete", "failed"]
JobPhase = Literal["segmenting", "extracting", "embedding", "done", "idle"]


class AnalyzeRequest(BaseModel):
    """POST /analyze payload for demo-image runs.

    For file uploads, the endpoint uses ``multipart/form-data`` instead
    and this schema is not used directly.
    """

    demo_condition: str | None = Field(
        default=None,
        description="Load a bundled demo dataset by its manifest name.",
    )
    cell_diameter: int = Field(default=80, ge=10, le=300)
    include_deep_features: bool = Field(default=False)
    pixel_size_um: float | None = Field(
        default=None,
        ge=0.05,
        le=2.0,
        description=(
            "Physical pixel size in microns. Required for the FA "
            "maturation classifier (Buskermolen 2018) to bin "
            "adhesions in the correct biological size range. When "
            "None the backend falls back to the demo manifest entry "
            "for bundled images, or 0.325 µm/px (typical 20× confocal) "
            "for uploads."
        ),
    )


class AnalyzeResponse(BaseModel):
    """Returned immediately from POST /analyze — the job is scheduled, not done."""

    job_id: str
    status: JobStatus
    created_at: str


class JobProgress(BaseModel):
    phase: JobPhase
    pct: int = Field(ge=0, le=100)
    message: str


class CellFeature(BaseModel):
    """A single row in the per-cell feature table."""

    cell_id: int
    features: dict[str, float]


class MechanoScoreSummary(BaseModel):
    """Diagnostics for the composite mechanotransduction score.

    Surfaced next to the score-distribution histogram on Tab 1 so the
    user can see how the score was computed (PCA vs. weighted-sum
    fallback), how many cells contributed, the variance explained by
    PC1, and the loadings — turning a single scalar into a defensible
    measurement.
    """

    mode: Literal["pca", "weighted_sum"] = "pca"
    n_cells_used: int = 0
    n_features_used: int = 0
    pc1_variance_explained: float = 0.0
    loadings: dict[str, float] = Field(default_factory=dict)
    mean: float | None = None
    std: float | None = None
    top_correlation_r: float | None = Field(
        default=None,
        description=(
            "Strongest absolute Spearman correlation between any "
            "glycocalyx feature and any mechanotransduction feature "
            "in this image. Surfaced as a hero metric so the central "
            "PhD novelty (single-cell glyco↔mechano coupling) is "
            "front-and-centre."
        ),
    )
    top_correlation_pair: tuple[str, str] | None = Field(
        default=None,
        description="(glycocalyx_feature, mechano_feature) for the top correlation.",
    )


class JobResult(BaseModel):
    """Final result payload attached to a complete job."""

    image_hash: str
    cell_count: int
    features_df_json: str = Field(
        description="pandas.DataFrame.to_json(orient='table') for the per-cell feature table."
    )
    segmentation_figure_json: str = Field(
        description="Plotly figure JSON for the interactive image viewer."
    )
    radial_profile_figure_json: str = Field(
        description="Plotly figure JSON for the mean ± std radial profile chart."
    )
    correlation_figure_json: str = Field(
        description="Plotly figure JSON for the feature correlation heatmap."
    )
    glyco_mechano_correlation_figure_json: str | None = Field(
        default=None,
        description=(
            "Plotly figure JSON for the rectangular glycocalyx × "
            "mechanotransduction correlation heatmap. This is the "
            "headline Tab 1 deliverable — single-cell correlative "
            "analysis between glycocalyx conformation and "
            "mechanotransduction state, a measurement no published "
            "study has reported (Paszek 2014, Möckl 2019, Barai "
            "2024, Hamrangsekachaee 2025 all stop at population "
            "comparisons)."
        ),
    )
    mechano_score_distribution_figure_json: str | None = Field(
        default=None,
        description=(
            "Plotly figure JSON for the per-cell composite "
            "mechanotransduction score distribution (histogram + "
            "mean line)."
        ),
    )
    mechano_score_summary: MechanoScoreSummary | None = None
    hero_metrics: dict[str, float | None] = Field(
        description=(
            "Pre-aggregated per-image statistics for the metric-card row: "
            "cell_count, mean_yap_nc, mean_fa_count, mean_actin_coherence, "
            "mean_glycocalyx_ratio, mean_mechano_score, top_glyco_mechano_r."
        )
    )
    has_deep_features: bool = False
    warnings: list[str] = Field(
        default_factory=list,
        description=(
            "Non-fatal messages raised during analysis — typically about "
            "missing or extra channels that caused some extractors to be "
            "skipped. Rendered as a yellow banner above the result card."
        ),
    )


class JobStatusResponse(BaseModel):
    job_id: str
    status: JobStatus
    progress: JobProgress
    created_at: str
    finished_at: str | None = None
    result: JobResult | None = None
    error: str | None = None


class DemoCondition(BaseModel):
    name: str
    display_name: str = ""
    description: str
    source: str = "Synthetic"
    license: str = ""
    attribution: str = ""
    attribution_url: str = ""
    gene: str = ""
    cell_line: str = ""
    is_real_microscopy: bool = False
    slot_sources: dict[str, Any] = Field(default_factory=dict)
    pixel_size_um: float | None = Field(
        default=None,
        description=(
            "Physical pixel size in microns from the manifest. The "
            "frontend auto-fills the sidebar input with this value "
            "on demo selection so FA maturation bins use the actual "
            "acquisition optics rather than a hardcoded fallback. "
            "May be None for legacy manifests — UI surfaces a warning."
        ),
    )


class DemoListResponse(BaseModel):
    conditions: list[DemoCondition]


class PriorGeneEntry(BaseModel):
    gene: str
    geneformer_rank: int | None = None
    geneformer_score: float | None = None
    pathway_rank: int | None = None
    pathway_score: float | None = None
    abs_rank_divergence: int | None = None


class MetabolicInhibitor(BaseModel):
    name: str
    target: str
    pathway: str
    pathway_rank: int | None = None
    pathway_score: float | None = None


class PathwayEdge(BaseModel):
    from_: str = Field(alias="from")
    to: str
    confidence: float

    model_config = {"populate_by_name": True}


class PathwayEvidence(BaseModel):
    distance: float | None = None
    path: list[str]
    path_edges: list[PathwayEdge]


class PriorsResponse(BaseModel):
    pathway_available: bool
    geneformer_available: bool
    genes: list[PriorGeneEntry]
    mechano_signature: list[str]
    metabolic_inhibitors: list[MetabolicInhibitor]
    pathway_metadata: dict[str, Any]
    geneformer_metadata: dict[str, Any]
    # Axis A — dynamic image-aware re-weighting
    dynamic: bool = False
    mechano_weights: dict[str, float] | None = None
    used_fallback_reference: bool = False
    # Axis B — on-demand Geneformer generation
    can_generate_geneformer: bool = False


class ContextualPriorsRequest(BaseModel):
    """POST /priors/contextual — re-weight the pathway prior by observed features.

    Sends the serialised per-cell feature table from a completed Tab 1
    job. The backend computes image-specific mechano-gene weights and
    returns a :class:`PriorsResponse` with ``dynamic=True``.
    """

    features_df_json: str = Field(
        description="pandas.DataFrame.to_json(orient='records') from JobResult."
    )
    cell_count: int = Field(default=0, ge=0)
    dataset_label: str | None = Field(
        default=None,
        description="Optional display name of the Tab 1 dataset for the banner.",
    )


class GeneformerGenerationResponse(BaseModel):
    """POST /priors/geneformer/generate — job kicked off on Modal."""

    job_id: str
    modal_call_id: str | None = None
    state: str = "queued"
    message: str = ""


class GeneformerStatusResponse(BaseModel):
    """GET /priors/geneformer/status/{job_id} — poll status of a Modal run."""

    job_id: str
    state: str  # queued | running | complete | failed
    elapsed_sec: int
    message: str = ""
    error: str | None = None


class DrillDownResponse(BaseModel):
    gene: str
    heatmap_figure_json: str
    evidence_per_target: dict[str, PathwayEvidence]
