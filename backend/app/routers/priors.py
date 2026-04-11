"""Tab 2 — Perturbation Prioritization endpoints."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException

from backend.app.schemas import (
    DrillDownResponse,
    MetabolicInhibitor,
    PathwayEdge,
    PathwayEvidence,
    PriorGeneEntry,
    PriorsResponse,
)
from glycoquant.predictor import (
    build_ranking_dataframe,
    get_mechano_signature,
    get_metabolic_inhibitors,
    load_prior,
)

router = APIRouter(prefix="/priors", tags=["priors"])

DATA_DIR = Path(__file__).resolve().parents[3] / "data" / "priors"
PATHWAY_PRIOR_PATH = DATA_DIR / "pathway_ranks.json"
GENEFORMER_PRIOR_PATH = DATA_DIR / "geneformer_ranks.json"
PATHWAY_EVIDENCE_PATH = DATA_DIR / "pathway_evidence.json"


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

    df = build_ranking_dataframe(geneformer, pathway)
    df = df.sort_values(
        by=["pathway_rank", "gene"], ascending=[True, True], na_position="last"
    )

    def _nan_to_none(val: Any) -> Any:
        try:
            import math

            if isinstance(val, float) and math.isnan(val):
                return None
        except Exception:  # noqa: BLE001
            pass
        return val

    genes: list[PriorGeneEntry] = []
    for _, row in df.iterrows():
        genes.append(
            PriorGeneEntry(
                gene=row["gene"],
                geneformer_rank=_nan_to_none(row.get("geneformer_rank")),
                geneformer_score=_nan_to_none(row.get("geneformer_score")),
                pathway_rank=_nan_to_none(row.get("pathway_rank")),
                pathway_score=_nan_to_none(row.get("pathway_score")),
                abs_rank_divergence=_nan_to_none(row.get("abs_rank_divergence")),
            )
        )

    # Metabolic inhibitors joined against the ranked panel
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
                pathway_rank=rank,
                pathway_score=score,
            )
        )

    return PriorsResponse(
        pathway_available=pathway.available,
        geneformer_available=geneformer.available,
        genes=genes,
        mechano_signature=get_mechano_signature(),
        metabolic_inhibitors=inhibitors,
        pathway_metadata=pathway.metadata,
        geneformer_metadata=geneformer.metadata,
    )


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

    return DrillDownResponse(
        gene=gene,
        heatmap_figure_json=fig.to_json(),
        evidence_per_target=evidence_per_target,
    )
