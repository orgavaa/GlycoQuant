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
    n_significant_pairs_fdr: int | None = Field(
        default=None,
        description=(
            "Number of glyco×mechano correlation tiles surviving "
            "Benjamini–Hochberg FDR adjustment at α=0.05 (out of the "
            "rectangular matrix of finite p-values). Reported so the "
            "user can judge at a glance whether the coupling is sparse "
            "(few tiles lit) or broad (many tiles lit) — contextualising "
            "the top |ρ| hero metric against the multiple-testing "
            "burden."
        ),
    )
    yap_size_correction_applied: bool | None = Field(
        default=None,
        description=(
            "Whether the Jones-2024 YAP size correction was actually "
            "subtracted from yap_nc_ratio on this image. False when "
            "cell_area did not predict yap_nc_ratio (R² below the "
            "gate) — the raw column is then copied through unchanged. "
            "None when the image had too few cells for any correction."
        ),
    )
    yap_size_correction_r2: float | None = Field(
        default=None,
        description=(
            "Coefficient of determination of the cell_area → yap_nc_ratio "
            "regression. Values below ~0.05 trigger the skip path."
        ),
    )
    yap_size_correction_slope_ci_lo: float | None = Field(
        default=None,
        description=(
            "Lower bound of the 200-resample percentile bootstrap 95% CI "
            "on the regression slope. CI crossing zero indicates the "
            "slope is not distinguishable from noise."
        ),
    )
    yap_size_correction_slope_ci_hi: float | None = Field(
        default=None,
        description="Upper bound of the bootstrap 95% CI on the regression slope.",
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
    channel_pngs: dict[str, str] | None = Field(
        default=None,
        description=(
            "Base64-encoded PNG per channel with channel-specific LUT "
            "applied. The frontend stacks these with mix-blend-mode:screen "
            "for additive compositing."
        ),
    )
    channel_trace_indices: dict[str, int] | None = Field(
        default=None,
        description=(
            "Mapping of channel name → Plotly trace index in the "
            "segmentation figure. The frontend uses this to toggle "
            "channel visibility via Plotly.restyle."
        ),
    )
    overlay_trace_ranges: dict[str, list[int]] | None = Field(
        default=None,
        description=(
            "Mapping of overlay name (glycocalyx / mechano) → list of "
            "Plotly trace indices for that overlay's filled polygons. "
            "The frontend toggles visibility via Plotly.restyle."
        ),
    )
    has_deep_features: bool = False
    deep_embedding_backend: Literal["dinov2_base", "cell_dino_channel_adaptive"] | None = Field(
        default=None,
        description=(
            "Identifier of the deep embedder backbone that produced the "
            "``deep_*`` columns. ``dinov2_base`` is the natural-image "
            "default (Apache 2.0); ``cell_dino_channel_adaptive`` is the "
            "Cell-DINO ViT-L/16 channel-adaptive variant (FAIR Non-Commercial "
            "Research License). ``None`` when ``has_deep_features`` is False."
        ),
    )
    warnings: list[str] = Field(
        default_factory=list,
        description=(
            "Non-fatal messages raised during analysis — typically about "
            "missing or extra channels that caused some extractors to be "
            "skipped. Rendered as a yellow banner above the result card."
        ),
    )
    channel_assignments: dict[str, str] | None = Field(
        default=None,
        description=(
            "The {channel_index: canonical_role} mapping used for this run. "
            "Echoed so the frontend can display which channel was assigned "
            "to which biological role."
        ),
    )
    substitute_channels: list[str] = Field(
        default_factory=list,
        description=(
            "Canonical channel names (e.g. 'yap', 'paxillin') that were "
            "identified as synthetic or substitute stains and excluded "
            "from feature extraction. The UI shows '—' for those features."
        ),
    )
    cell_overlay: dict | None = Field(
        default=None,
        description=(
            "Explicit overlay payload for the frontend canvas: "
            "{image_w, image_h, polygons: [{cell_id, vertices: [[x,y],...]}]}. "
            "Generated directly from the cell_mask, decoupled from the "
            "Plotly figure JSON. None if polygon extraction failed; "
            "the frontend then shows a degraded-but-truthful state."
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
    pathway_signed_score: float | None = Field(
        default=None,
        description=(
            "Directionally-aware sidecar on the dynamic pathway score. "
            "Weighted median of sign(signed_z[m]) × inverse_distance(g, m) "
            "across the 15-gene mechano signature, using the same image-"
            "derived magnitude weights. Positive = topologically close to "
            "over-activated axes (candidate KO to attenuate phenotype); "
            "negative = close to under-activated axes (candidate KO to "
            "restore phenotype). Populated only on /priors/contextual "
            "responses; None on the static /priors response."
        ),
    )


class MetabolicInhibitor(BaseModel):
    name: str
    target: str
    pathway: str
    mechanism: str = ""
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


class PriorStatusBlock(BaseModel):
    """Reproducibility status of one prior — surfaced for UI badges.

    Mirrors :class:`glycoquant.predictor.PriorStatusReport`. The
    ``status`` enum is one of ``missing``, ``invalid``, ``stale``,
    ``ready``. The detail string is a human-readable explanation of
    the decision (e.g. "Prior generated 240 days ago, exceeds 180-day
    freshness window").
    """

    status: str
    detail: str
    n_genes: int
    generated_utc: str | None = None
    age_days: float | None = None


class PriorsResponse(BaseModel):
    pathway_available: bool
    geneformer_available: bool
    genes: list[PriorGeneEntry]
    mechano_signature: list[str]
    metabolic_inhibitors: list[MetabolicInhibitor]
    pathway_metadata: dict[str, Any]
    geneformer_metadata: dict[str, Any]
    panel_summary_figure_json: str | None = None
    # Axis A — dynamic image-aware re-weighting
    dynamic: bool = False
    mechano_weights: dict[str, float] | None = None
    mechano_signed_z: dict[str, float] | None = Field(
        default=None,
        description=(
            "Direction-of-deviation sidecar: {mechano_gene: signed_z}. "
            "Each value is the mean of signed z-scores from contributing "
            "features. Positive = axis over-activated in the observed "
            "image relative to the reference cohort; negative = under-"
            "activated. Populated only when dynamic=True."
        ),
    )
    used_fallback_reference: bool = False
    # Axis B — on-demand Geneformer generation
    can_generate_geneformer: bool = False
    # H2 — reproducibility hardening
    pathway_status: PriorStatusBlock | None = Field(
        default=None,
        description=(
            "Reproducibility status of the pathway prior on disk. UI "
            "should display a badge if status != 'ready'."
        ),
    )
    geneformer_status: PriorStatusBlock | None = Field(
        default=None,
        description=(
            "Reproducibility status of the Geneformer prior — surfaces "
            "MISSING / INVALID / STALE / READY so the UI honestly "
            "reports prior provenance instead of treating absence and "
            "presence as a binary flag."
        ),
    )


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


class CompareRequest(BaseModel):
    """POST /analysis/compare — compare two completed jobs."""
    job_id_a: str
    job_id_b: str


class EffectSize(BaseModel):
    feature: str
    cohens_d: float
    p_value: float
    mean_a: float
    mean_b: float
    delta_pct: float  # (mean_b - mean_a) / |mean_a| * 100


class CompareResult(BaseModel):
    """Population-level comparison between two analysis runs."""
    job_id_a: str
    job_id_b: str
    n_cells_a: int
    n_cells_b: int
    effect_sizes: list[EffectSize]
    top_deltas: list[EffectSize]  # top 5 by |Cohen's d|
    # Per-feature arrays for Plotly violin rendering
    violin_features: list[str]
    violin_a: dict[str, list[float]]  # feature → values for condition A
    violin_b: dict[str, list[float]]  # feature → values for condition B


class DrillDownResponse(BaseModel):
    gene: str
    heatmap_figure_json: str
    network_figure_json: str | None = None
    evidence_per_target: dict[str, PathwayEvidence]


# ---------------------------------------------------------------------------
# ML feature responses (phenotype, spatial GNN, cross-modal)
# ---------------------------------------------------------------------------


class ClusterSummarySchema(BaseModel):
    cluster_id: int
    size: int
    fraction: float
    mean_features: dict[str, float]


class PhenotypeResponse(BaseModel):
    """UMAP + Leiden phenotype discovery on Cell-DINO embeddings."""
    job_id: str
    n_clusters: int
    cluster_sizes: dict[int, int]
    cluster_summaries: list[ClusterSummarySchema]
    cells_json: str  # [{cell_id, umap_x, umap_y, cluster}, ...]
    landscape_figure_json: str


class SpatialGNNResponse(BaseModel):
    """Spatial context GNN — Delaunay + GCN mechano prediction.

    ``r2_score`` is the mean R² across spatial CV folds (single value
    when ``cv_strategy == "random"``). ``r2_std`` and
    ``fold_r2_scores`` expose fold-to-fold variability so the UI can
    surface an honest error bar instead of a single optimistic number.
    """

    job_id: str
    r2_score: float
    node_importance: dict[str, float]
    n_edges: int
    mean_neighbors: float
    cells_json: str  # [{cell_id, predicted, actual}, ...]
    graph_figure_json: str
    importance_figure_json: str
    r2_std: float = 0.0
    cv_strategy: str = "random"
    cv_k: int = 1
    fold_r2_scores: list[float] = Field(default_factory=list)


class CrossModalResponse(BaseModel):
    """Cross-modal prediction: glyco <-> mechano."""
    job_id: str
    direction: str
    overall_r2: float
    per_target_r2: dict[str, float]
    feature_importance: dict[str, float]
    input_features: list[str]
    target_features: list[str]
    r2_figure_json: str
    importance_figure_json: str
