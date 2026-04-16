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
    recompute_pathway_ranking,
)
from glycoquant.predictor.prior_loader import GeneRanking

router = APIRouter(prefix="/priors", tags=["priors"])

DATA_DIR = Path(__file__).resolve().parents[3] / "data" / "priors"
PATHWAY_PRIOR_PATH = DATA_DIR / "pathway_ranks.json"
GENEFORMER_PRIOR_PATH = DATA_DIR / "geneformer_ranks.json"
PATHWAY_EVIDENCE_PATH = DATA_DIR / "pathway_evidence.json"


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
    genes: list[PriorGeneEntry] = []
    for _, row in df.iterrows():
        gene_symbol = row["gene"]
        signed_val = signed_scores.get(gene_symbol)
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
                abs_rank_divergence=_nan_to_none(row.get("abs_rank_divergence")),
                pathway_signed_score=signed_val,
            )
        )

    # Mechanism descriptions for each metabolic inhibitor
    MECHANISMS: dict[str, str] = {
        "2-DG": (
            "Competitively inhibits hexokinase (HK2), blocking glucose-6-phosphate "
            "entry into the hexosamine biosynthetic pathway. Reduces UDP-GlcNAc "
            "availability, limiting glycocalyx biosynthesis and O-GlcNAcylation "
            "of mechanotransduction effectors."
        ),
        "DON": (
            "Glutamine analogue that irreversibly inhibits GFPT1, the rate-limiting "
            "enzyme of the hexosamine pathway. Directly reduces UDP-GlcNAc flux, "
            "depleting substrate for both N- and O-linked glycosylation of the "
            "glycocalyx and intracellular O-GlcNAc signalling."
        ),
        "tunicamycin": (
            "Blocks DPAGT1, the first enzyme in dolichol-linked oligosaccharide "
            "assembly, completely inhibiting N-glycosylation in the ER. Prevents "
            "glycoprotein maturation of syndecans, glypicans, and integrins — "
            "disrupting both glycocalyx structure and integrin-mediated mechanosensing."
        ),
        "benzyl-GalNAc": (
            "Competitive inhibitor of GalNAc-transferases (GALNT family), blocking "
            "mucin-type O-glycosylation. Reduces O-glycan decoration of membrane "
            "mucins (MUC1) and other surface glycoproteins that contribute to "
            "glycocalyx thickness and charge."
        ),
        "PUGNAc": (
            "Inhibits O-GlcNAcase (OGA), the enzyme that removes O-GlcNAc from "
            "intracellular proteins. Causes hyper-O-GlcNAcylation, including of "
            "YAP (Ser109) and cytoskeletal regulators, altering mechanotransduction "
            "signalling downstream of the glycocalyx."
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

    # Panel summary dot plot
    from glycoquant.viz.prior_table import plot_panel_summary
    mechano_sig = get_mechano_signature()
    gene_dicts = [
        {"gene": g.gene, "pathway_score": g.pathway_score, "pathway_rank": g.pathway_rank}
        for g in genes
    ]
    summary_fig = plot_panel_summary(gene_dicts, mechano_sig)

    return PriorsResponse(
        pathway_available=pathway.available,
        geneformer_available=geneformer.available,
        genes=genes,
        mechano_signature=mechano_sig,
        metabolic_inhibitors=inhibitors,
        pathway_metadata=pathway.metadata,
        geneformer_metadata=geneformer.metadata,
        panel_summary_figure_json=summary_fig.to_json(),
        dynamic=dynamic,
        mechano_weights=mechano_weights,
        mechano_signed_z=mechano_signed_z,
        used_fallback_reference=used_fallback_reference,
        can_generate_geneformer=_can_generate_geneformer(),
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
                "Pathway prior missing. Run "
                "`python scripts/generate_pathway_priors.py` to generate it."
            ),
        )

    return _build_response(pathway, geneformer)


@router.get("/drill/{gene}", response_model=DrillDownResponse)
async def get_gene_drill_down(gene: str) -> DrillDownResponse:
    """Return the drill-down heatmap and STRING evidence for one gene."""
    pathway = load_prior(PATHWAY_PRIOR_PATH, source="pathway")
    geneformer = load_prior(GENEFORMER_PRIOR_PATH, source="geneformer")
    if not pathway.available:
        raise HTTPException(status_code=503, detail="Pathway prior unavailable")

    # Build the 2-row heatmap figure via the shared library factory
    from glycoquant.viz import plot_drill_down_heatmap

    mechano_genes = get_mechano_signature()
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
    )

    # Load the raw evidence blob
    evidence_per_target: dict[str, PathwayEvidence] = {}
    if PATHWAY_EVIDENCE_PATH.is_file():
        blob: dict[str, Any] = json.loads(
            PATHWAY_EVIDENCE_PATH.read_text(encoding="utf-8")
        )
        gene_evidence = blob.get(gene, {})
        for target, entry in gene_evidence.items():
            evidence_per_target[target] = PathwayEvidence(
                distance=entry.get("distance"),
                path=list(entry.get("path", [])),
                path_edges=[
                    PathwayEdge.model_validate(
                        {
                            "from": e["from"],
                            "to": e["to"],
                            "confidence": float(e["confidence"]),
                        }
                    )
                    for e in entry.get("path_edges", [])
                ],
            )

    # Network graph showing shortest paths from gene to all reachable targets
    from glycoquant.viz.prior_table import plot_pathway_network

    # Convert evidence to raw dict format for the network viz
    evidence_raw = {}
    if PATHWAY_EVIDENCE_PATH.is_file():
        blob_raw = json.loads(PATHWAY_EVIDENCE_PATH.read_text(encoding="utf-8"))
        evidence_raw = blob_raw.get(gene, {})

    network_fig = plot_pathway_network(gene, evidence_raw, mechano_genes)

    return DrillDownResponse(
        gene=gene,
        heatmap_figure_json=fig.to_json(),
        network_figure_json=network_fig.to_json(),
        evidence_per_target=evidence_per_target,
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
    """Re-aggregate the pathway prior with weights derived from a Tab 1 result.

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
            detail="Pathway prior missing on the server.",
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
