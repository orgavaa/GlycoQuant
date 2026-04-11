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
    hero_metrics: dict[str, float | None] = Field(
        description=(
            "Pre-aggregated per-image statistics for the metric-card row: "
            "cell_count, mean_yap_nc, mean_fa_count, mean_actin_coherence, "
            "mean_glycocalyx_ratio."
        )
    )
    has_deep_features: bool = False


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


class DrillDownResponse(BaseModel):
    gene: str
    heatmap_figure_json: str
    evidence_per_target: dict[str, PathwayEvidence]
