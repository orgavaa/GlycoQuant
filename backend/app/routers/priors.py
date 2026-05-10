"""Tab 2 — Perturbation Prioritization endpoints."""
from __future__ import annotations

import io
import json
import math
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import APIRouter, HTTPException

from backend.app.schemas import (
    ContextualPriorsRequest,
    DrillDownResponse,
    GeneformerGenerationResponse,
    GeneformerStatusResponse,
    MetabolicInhibitor,
    PathwayEdge,
    PathwayEvidence,
    PriorGeneEntry,
    PriorsResponse,
    PriorStatusBlock,
)
from glycoquant.predictor import (
    PriorTable,
    build_ranking_dataframe,
    compute_mechano_signed_z,
    compute_mechano_weights,
    get_mechano_signature,
    get_metabolic_inhibitors,
    load_prior,
    load_reference_cohort,
    prior_status,
    recompute_pathway_ranking,
)
from glycoquant.predictor.prior_loader import GeneRanking
from glycoquant.predictor.ranking_metadata import (
    GENE_CLASS_LEGEND,
    SIGNATURE_LAYERS,
    edge_cost_from_confidence,
    gene_class_label,
    target_alias,
    target_layer_label,
    target_metadata,
)

router = APIRouter(prefix="/priors", tags=["priors"])

DATA_DIR = Path(__file__).resolve().parents[3] / "data" / "priors"
PATHWAY_PRIOR_PATH = DATA_DIR / "pathway_ranks.json"
GENEFORMER_PRIOR_PATH = DATA_DIR / "geneformer_ranks.json"
PATHWAY_EVIDENCE_PATH = DATA_DIR / "pathway_evidence.json"


def _load_pathway_evidence() -> dict[str, Any]:
    if not PATHWAY_EVIDENCE_PATH.is_file():
        return {}
    return json.loads(PATHWAY_EVIDENCE_PATH.read_text(encoding="utf-8"))


def _nan_to_none(val: Any) -> Any:
    if isinstance(val, float) and math.isnan(val):
        return None
    return val


def _build_response(
    pathway: PriorTable,
    geneformer: PriorTable,
    *,
    dynamic: bool = False,
    mechano_weights: dict[str, float] | None = None,
    mechano_signed_z: dict[str, float] | None = None,
    pathway_signed_scores: dict[str, float] | None = None,
    used_fallback_reference: bool = False,
) -> PriorsResponse:
    """Assemble a PriorsResponse from two PriorTables.

    Shared by ``GET /priors`` and ``POST /priors/contextual`` so both
    endpoints return identical JSON shapes; only the underlying scores
    and the Axis-A flags differ. When ``pathway_signed_scores`` is
    provided (dynamic mode only), each :class:`PriorGeneEntry` also
    carries its directional sidecar score.
    """
    df = build_ranking_dataframe(geneformer, pathway)
    df = df.sort_values(
        by=["pathway_rank", "gene"], ascending=[True, True], na_position="last"
    )

    signed_scores = pathway_signed_scores or {}
    evidence_blob = _load_pathway_evidence()
    genes: list[PriorGeneEntry] = []
    for _, row in df.iterrows():
        gene_symbol = row["gene"]
        signed_val = signed_scores.get(gene_symbol)
        reachable_signature_targets: int | None = None
        reachable_signature_target_names: list[str] | None = None
        pathway_ranking = pathway.rankings.get(gene_symbol)
        if pathway_ranking is not None:
            reachable_signature_target_names = [
                target
                for target, score in pathway_ranking.per_mechano.items()
                if isinstance(score, (int, float))
                and math.isfinite(float(score))
                and float(score) > 0
            ]
            reachable_signature_targets = len(set(reachable_signature_target_names))
        # NaN → None so Pydantic serialises it cleanly
        if isinstance(signed_val, float) and math.isnan(signed_val):
            signed_val = None
        genes.append(
            PriorGeneEntry(
                gene=gene_symbol,
                geneformer_rank=_nan_to_none(row.get("geneformer_rank")),
                geneformer_score=_nan_to_none(row.get("geneformer_score")),
                pathway_rank=_nan_to_none(row.get("pathway_rank")),
                pathway_score=_nan_to_none(row.get("pathway_score")),
                reachable_signature_targets=reachable_signature_targets,
                reachable_signature_target_names=reachable_signature_target_names,
                gene_class=gene_class_label(gene_symbol),
                abs_rank_divergence=_nan_to_none(row.get("abs_rank_divergence")),
                pathway_signed_score=signed_val,
            )
        )

    # Mechanism descriptions for each assay perturbation link. These are
    # intentionally conservative: most compounds perturb broad metabolic axes
    # and are not clean gene-specific controls.
    MECHANISMS: dict[str, str] = {
        "2-DG": (
            "Broad glycolysis and energy-stress perturbation often annotated through "
            "hexokinase inhibition. It can reduce carbon flux into UDP-GlcNAc pools, "
            "but ATP/AMPK, viability, and growth-rate effects are major confounders "
            "for mechanophenotype interpretation."
        ),
        "DON": (
            "Glutamine antagonist that can suppress hexosamine-biosynthesis flux "
            "through GFPT-family chemistry, but is not GFPT1-specific. Treat as a "
            "pathway-level perturbation with parallel controls for broad glutamine "
            "metabolism."
        ),
        "tunicamycin": (
            "Blocks DPAGT1-dependent initiation of N-glycosylation. Useful as a "
            "positive perturbation of glycoprotein maturation, but ER-stress/UPR and "
            "toxicity are strong confounders for adhesion and YAP/TAZ readouts."
        ),
        "benzyl-GalNAc": (
            "Broad perturbation of mucin-type O-glycosylation through GALNT-family "
            "substrate competition. It is not a clean CD44/HA-axis test and should be "
            "interpreted as a general O-glycan perturbation."
        ),
        "PUGNAc": (
            "OGA inhibitor that increases intracellular O-GlcNAc. It is an older, "
            "broader tool than Thiamet-G or GlcNAcstatin and is an opposite-direction "
            "perturbation relative to OGT inhibition."
        ),
    }
    inhibitors_raw = get_metabolic_inhibitors()
    df_indexed = df.set_index("gene")
    inhibitors: list[MetabolicInhibitor] = []
    for name, entry in inhibitors_raw.items():
        target = entry.get("target", "")
        pathway_name = entry.get("pathway", "")
        rank: int | None = None
        score: float | None = None
        if target in df_indexed.index:
            tr = df_indexed.loc[target]
            rank = _nan_to_none(tr.get("pathway_rank"))
            score = _nan_to_none(tr.get("pathway_score"))
            if isinstance(rank, (int, float)) and rank is not None:
                rank = int(rank)
        inhibitors.append(
            MetabolicInhibitor(
                name=name,
                target=target,
                pathway=pathway_name,
                mechanism=MECHANISMS.get(name, ""),
                pathway_rank=rank,
                pathway_score=score,
            )
        )

    # Panel summary and all-gene target matrix.
    from glycoquant.viz.prior_table import plot_panel_summary, plot_signature_matrix
    mechano_sig = get_mechano_signature()
    gene_dicts = [
        {
            "gene": g.gene,
            "pathway_score": g.pathway_score,
            "pathway_rank": g.pathway_rank,
            "reachable_signature_targets": g.reachable_signature_targets,
            "reachable_signature_target_names": g.reachable_signature_target_names,
            "gene_class": g.gene_class,
            "per_target_scores": (
                pathway.rankings[g.gene].per_mechano
                if g.gene in pathway.rankings
                else {}
            ),
        }
        for g in genes
    ]
    summary_fig = plot_panel_summary(gene_dicts, mechano_sig)
    matrix_fig = plot_signature_matrix(gene_dicts, mechano_sig, evidence_blob)

    # H2 — reproducibility hardening. Validate both priors against
    # the schema + freshness rules and surface the status so the UI
    # can badge missing/invalid/stale priors instead of treating
    # absence as a silent binary.
    pathway_status_report = prior_status(pathway)
    geneformer_status_report = prior_status(geneformer)

    def _to_block(report) -> PriorStatusBlock:
        return PriorStatusBlock(
            status=report.status.value,
            detail=report.detail,
            n_genes=report.n_genes,
            generated_utc=report.generated_utc,
            age_days=report.age_days,
        )

    return PriorsResponse(
        pathway_available=pathway.available,
        geneformer_available=geneformer.available,
        genes=genes,
        mechano_signature=mechano_sig,
        metabolic_inhibitors=inhibitors,
        pathway_metadata=pathway.metadata,
        geneformer_metadata=geneformer.metadata,
        panel_summary_figure_json=summary_fig.to_json(),
        signature_matrix_figure_json=matrix_fig.to_json(),
        hubness_diagnostic_figure_json=None,
        hubness_diagnostic_message="Hubness diagnostic unavailable: degree metadata not present.",
        signature_layers=SIGNATURE_LAYERS,
        target_metadata=target_metadata(),
        gene_class_legend=GENE_CLASS_LEGEND,
        dynamic=dynamic,
        mechano_weights=mechano_weights,
        mechano_signed_z=mechano_signed_z,
        used_fallback_reference=used_fallback_reference,
        can_generate_geneformer=_can_generate_geneformer(),
        pathway_status=_to_block(pathway_status_report),
        geneformer_status=_to_block(geneformer_status_report),
    )


def _can_generate_geneformer() -> bool:
    """True when the backend can dispatch Geneformer to Modal."""
    import os

    return os.environ.get("GLYCOQUANT_GPU_PROVIDER", "").strip().lower() == "modal"


@router.get("", response_model=PriorsResponse)
async def get_priors() -> PriorsResponse:
    """Return the combined dual-prior ranking + metabolic inhibitor panel."""
    pathway = load_prior(PATHWAY_PRIOR_PATH, source="pathway")
    geneformer = load_prior(GENEFORMER_PRIOR_PATH, source="geneformer")

    if not pathway.available:
        raise HTTPException(
            status_code=503,
            detail=(
                "STRING functional-association prior missing. Run "
                "`python scripts/generate_pathway_priors.py` to generate it."
            ),
        )

    return _build_response(pathway, geneformer)


@router.get("/drill/{gene}", response_model=DrillDownResponse)
async def get_gene_drill_down(
    gene: str,
    target: str | None = None,
    network_mode: str = "selected",
) -> DrillDownResponse:
    """Return the drill-down heatmap and STRING evidence for one gene."""
    pathway = load_prior(PATHWAY_PRIOR_PATH, source="pathway")
    geneformer = load_prior(GENEFORMER_PRIOR_PATH, source="geneformer")
    if not pathway.available:
        raise HTTPException(status_code=503, detail="STRING functional-association prior unavailable")

    # Build the 2-row heatmap figure via the shared library factory
    mechano_genes = get_mechano_signature()
    selected_target = target if target in mechano_genes else "YAP1"
    if selected_target not in mechano_genes and mechano_genes:
        selected_target = mechano_genes[0]

    evidence_raw: dict[str, Any] = _load_pathway_evidence().get(gene, {})

    from glycoquant.viz import plot_drill_down_heatmap

    fig = plot_drill_down_heatmap(
        geneformer_row=(
            {m: geneformer.rankings[gene].per_mechano.get(m, 0.0) for m in mechano_genes}
            if gene in geneformer.rankings
            else None
        ),
        pathway_row=(
            {m: pathway.rankings[gene].per_mechano.get(m, 0.0) for m in mechano_genes}
            if gene in pathway.rankings
            else None
        ),
        mechano_genes=mechano_genes,
        evidence_per_target=evidence_raw,
    )

    evidence_per_target: dict[str, PathwayEvidence] = {}
    for evidence_target, entry in evidence_raw.items():
        raw_path = list(entry.get("path", []))
        evidence_per_target[evidence_target] = PathwayEvidence(
            distance=entry.get("distance"),
            network_distance=entry.get("distance"),
            target_alias=target_alias(evidence_target),
            signature_layer=target_layer_label(evidence_target),
            path_length=max(0, len(raw_path) - 1) if raw_path else None,
            path=raw_path,
            path_edges=[
                PathwayEdge.model_validate(
                    {
                        "from": e["from"],
                        "to": e["to"],
                        "confidence": float(e["confidence"]),
                        "source": e.get("source"),
                        "pubmed_doi": e.get("pubmed_doi"),
                        "reason": e.get("reason"),
                        "edge_cost": edge_cost_from_confidence(float(e["confidence"])),
                        "evidence_channels": e.get("evidence_channels"),
                        "is_curated": e.get("source") == "curated",
                        "is_string": e.get("source", "string") == "string",
                    }
                )
                for e in entry.get("path_edges", [])
            ],
        )

    for mechano_target in mechano_genes:
        if mechano_target not in evidence_per_target:
            evidence_per_target[mechano_target] = PathwayEvidence(
                distance=None,
                network_distance=None,
                target_alias=target_alias(mechano_target),
                signature_layer=target_layer_label(mechano_target),
                path_length=None,
                path=[],
                path_edges=[],
            )

    # Network graph showing selected or all reachable STRING functional-association paths.
    from glycoquant.viz.prior_table import plot_pathway_network

    network_fig = plot_pathway_network(
        gene,
        evidence_raw,
        mechano_genes,
        selected_target=selected_target,
        network_mode=network_mode,
    )

    return DrillDownResponse(
        gene=gene,
        heatmap_figure_json=fig.to_json(),
        network_figure_json=network_fig.to_json(),
        evidence_per_target=evidence_per_target,
        selected_target=selected_target,
        network_mode=network_mode,
    )


# ---------------------------------------------------------------------------
# Axis A — image-aware re-weighting
# ---------------------------------------------------------------------------


def _prior_table_from_dynamic(
    base: PriorTable,
    dynamic_scores: dict[str, float],
    dynamic_ranks: dict[str, int],
) -> PriorTable:
    """Rebuild a PriorTable with re-ranked scores but the same per-mechano map."""
    rankings: dict[str, GeneRanking] = {}
    for gene, base_ranking in base.rankings.items():
        rankings[gene] = GeneRanking(
            gene=gene,
            rank=dynamic_ranks.get(gene, base_ranking.rank),
            score=dynamic_scores.get(gene, base_ranking.score),
            per_mechano=base_ranking.per_mechano,
        )
    return PriorTable(
        source=base.source,
        metadata={**base.metadata, "dynamic": True},
        rankings=rankings,
        available=base.available,
    )


@router.post("/contextual", response_model=PriorsResponse)
async def get_contextual_priors(req: ContextualPriorsRequest) -> PriorsResponse:
    """Re-aggregate the STRING functional-association prior with weights derived from a Tab 1 result.

    Accepts the serialised per-cell feature table from a completed
    Tab 1 analysis, computes image-specific weights over the 15-gene
    mechanotransduction signature, and returns a ranking where the
    pathway score is a **weighted median** of the existing per-target
    inverse-distance vectors (no STRING graph rebuild).
    """
    pathway = load_prior(PATHWAY_PRIOR_PATH, source="pathway")
    geneformer = load_prior(GENEFORMER_PRIOR_PATH, source="geneformer")

    if not pathway.available:
        raise HTTPException(
            status_code=503,
            detail="STRING functional-association prior missing on the server.",
        )

    try:
        features_df = pd.read_json(io.StringIO(req.features_df_json), orient="records")
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Could not parse features_df_json: {exc}",
        ) from exc

    reference = load_reference_cohort()
    weights = compute_mechano_weights(features_df, reference)
    signed_z = compute_mechano_signed_z(features_df, reference)

    dynamic = recompute_pathway_ranking(pathway, weights, signed_z=signed_z)
    pathway_dyn = _prior_table_from_dynamic(pathway, dynamic.scores, dynamic.ranks)

    # If a Geneformer prior is present, apply the *same* weights to its
    # per_mechano cosine-shift vectors. This is what makes the
    # divergence column meaningful on a dynamic basis. The signed
    # sidecar is intentionally *not* propagated to Geneformer because
    # Geneformer's cosine-shift vectors are not signed distances — the
    # "sign of perturbation" concept does not transfer cleanly and
    # conflating the two scores would mislead the UI.
    geneformer_dyn = geneformer
    if geneformer.available and geneformer.rankings:
        gf_dyn = recompute_pathway_ranking(geneformer, weights)
        geneformer_dyn = _prior_table_from_dynamic(
            geneformer, gf_dyn.scores, gf_dyn.ranks
        )

    return _build_response(
        pathway_dyn,
        geneformer_dyn,
        dynamic=True,
        mechano_weights=weights,
        mechano_signed_z=signed_z,
        pathway_signed_scores=dynamic.signed_scores,
        used_fallback_reference=reference.used_fallback,
    )


# ---------------------------------------------------------------------------
# Axis B — on-demand Geneformer generation on Modal
# ---------------------------------------------------------------------------


@router.post("/geneformer/generate", response_model=GeneformerGenerationResponse)
async def start_geneformer_generation() -> GeneformerGenerationResponse:
    """Kick off a Modal-hosted Geneformer run and return a polling handle.

    The actual work happens inside the ``generate_geneformer_prior``
    Modal function (see ``backend/modal_app.py``). This endpoint spawns
    it via :func:`backend.app.gpu_client.spawn_geneformer_generation`
    and registers a job handle in the existing in-memory ``JobStore``
    so the frontend polls the same shape it already uses for Tab 1.
    """
    if not _can_generate_geneformer():
        raise HTTPException(
            status_code=400,
            detail=(
                "Geneformer generation requires GLYCOQUANT_GPU_PROVIDER=modal. "
                "Set the env var on the backend service and redeploy."
            ),
        )

    from backend.app.gpu_client import spawn_geneformer_generation
    from backend.app.workers import get_job_store

    try:
        call_id = spawn_geneformer_generation()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=502,
            detail=f"Modal spawn failed: {type(exc).__name__}: {exc}",
        ) from exc

    store = get_job_store()
    job = store.create(
        meta={
            "kind": "geneformer",
            "modal_call_id": call_id,
            "started_at": time.time(),
        }
    )
    store.update(
        job.id,
        status="running",
        phase="segmenting",  # reuses the existing JobPhase enum for the UI
        pct=5,
        message="Geneformer run spawned on Modal L4",
    )
    return GeneformerGenerationResponse(
        job_id=job.id,
        modal_call_id=call_id,
        state="running",
        message="Geneformer run spawned on Modal L4",
    )


@router.get(
    "/geneformer/status/{job_id}",
    response_model=GeneformerStatusResponse,
)
async def geneformer_status(job_id: str) -> GeneformerStatusResponse:
    """Poll a Geneformer generation job.

    On completion, writes the returned dict to
    ``data/priors/geneformer_ranks.json`` so the next ``GET /priors``
    call picks it up and the divergence column lights up.
    """
    from backend.app.gpu_client import poll_geneformer_call
    from backend.app.workers import get_job_store

    store = get_job_store()
    job = store.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    call_id = job.meta.get("modal_call_id")
    started_at = float(job.meta.get("started_at", time.time()))
    elapsed_sec = int(time.time() - started_at)

    if call_id is None:
        raise HTTPException(
            status_code=500,
            detail="Job is missing its Modal call id — was it spawned via /generate?",
        )

    try:
        state, result = poll_geneformer_call(call_id)
    except Exception as exc:  # noqa: BLE001
        store.update(
            job.id,
            status="failed",
            phase="idle",
            pct=0,
            message="Geneformer poll failed",
            error=f"{type(exc).__name__}: {exc}",
        )
        return GeneformerStatusResponse(
            job_id=job.id,
            state="failed",
            elapsed_sec=elapsed_sec,
            error=f"{type(exc).__name__}: {exc}",
        )

    if state == "complete" and result is not None:
        # Persist to disk so GET /priors picks it up. The file is
        # ephemeral on Railway's container filesystem (no persistent
        # volume) — that's fine because the real cache lives on the
        # Modal persistent volume; if the Railway container is
        # recycled, the user just re-runs the job (it's warm on Modal's
        # side and finishes in <1 min).
        try:
            GENEFORMER_PRIOR_PATH.parent.mkdir(parents=True, exist_ok=True)
            # Normalise timestamp into the metadata block for auditability
            if isinstance(result, dict):
                md = result.setdefault("metadata", {})
                md.setdefault(
                    "generated_utc",
                    datetime.now(tz=timezone.utc).isoformat(),
                )
            GENEFORMER_PRIOR_PATH.write_text(
                json.dumps(result, indent=2), encoding="utf-8"
            )
        except OSError as exc:
            store.update(
                job.id,
                status="failed",
                error=f"Could not persist geneformer_ranks.json: {exc}",
            )
            return GeneformerStatusResponse(
                job_id=job.id,
                state="failed",
                elapsed_sec=elapsed_sec,
                error=f"Disk write failed: {exc}",
            )

        store.update(
            job.id,
            status="complete",
            phase="done",
            pct=100,
            message="Geneformer prior ready",
        )
        return GeneformerStatusResponse(
            job_id=job.id,
            state="complete",
            elapsed_sec=elapsed_sec,
            message="Geneformer prior ready",
        )

    if state == "failed":
        store.update(
            job.id,
            status="failed",
            phase="idle",
            pct=0,
            message="Geneformer job failed on Modal",
        )
        return GeneformerStatusResponse(
            job_id=job.id,
            state="failed",
            elapsed_sec=elapsed_sec,
            error="Modal call expired or failed.",
        )

    # state == "running"
    store.update(
        job.id,
        status="running",
        phase="segmenting",
        pct=min(95, 5 + elapsed_sec // 15),
        message=f"Running on Modal GPU (~{elapsed_sec}s elapsed)",
    )
    return GeneformerStatusResponse(
        job_id=job.id,
        state="running",
        elapsed_sec=elapsed_sec,
        message="In-silico perturbation on reference scRNA-seq cohort",
    )
