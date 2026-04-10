"""Load pre-computed Geneformer and STRING pathway priors for Tab 2.

Tab 2 never runs Geneformer inference at runtime. Instead, two
committed JSON files in ``data/priors/`` hold the precomputed rankings:

- ``geneformer_ranks.json`` — produced once on Colab GPU via
  ``scripts/generate_geneformer_priors.py``
- ``pathway_ranks.json`` — produced locally via
  ``scripts/generate_pathway_priors.py`` (STRING v12 REST API)

This module loads those files into lightweight immutable dataclasses,
computes the divergence column, and assembles the combined dataframe
that Tab 2's ``tab_prioritization.py`` renders. It gracefully handles
missing Geneformer files (pathway-only fallback) so the platform is
shippable even before the Colab run completes.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import pandas as pd


@dataclass(frozen=True)
class GeneRanking:
    """Per-gene entry in a :class:`PriorTable`."""

    gene: str
    rank: int
    score: float
    per_mechano: dict[str, float] = field(default_factory=dict)


@dataclass(frozen=True)
class PriorTable:
    """One source's worth of precomputed perturbation rankings.

    Attributes
    ----------
    source : str
        ``"geneformer"`` or ``"pathway"``.
    metadata : dict
        The ``metadata`` block from the source JSON (model name,
        generation timestamp, STRING confidence threshold, etc.).
    rankings : dict[str, GeneRanking]
        Keyed by glycocalyx gene symbol.
    available : bool
        ``False`` if the source file was missing at load time; Tab 2
        degrades gracefully to pathway-only mode in that case.
    """

    source: str
    metadata: dict[str, Any]
    rankings: dict[str, GeneRanking]
    available: bool


def load_prior(path: str | Path, source: str) -> PriorTable:
    """Load one prior JSON. Returns ``available=False`` if the file is missing.

    Parameters
    ----------
    path : str or Path
        Path to the JSON file on disk.
    source : str
        ``"geneformer"`` or ``"pathway"``. Stored on the returned
        :class:`PriorTable` so Tab 2 can label the columns correctly.
    """
    path = Path(path)
    if not path.is_file():
        return PriorTable(source=source, metadata={}, rankings={}, available=False)

    data = json.loads(path.read_text(encoding="utf-8"))
    rankings: dict[str, GeneRanking] = {}
    for gene_name, g_data in data.get("genes", {}).items():
        score = float(
            g_data.get("score", g_data.get("median_cosine_shift", 0.0))
        )
        per_mechano_raw = g_data.get("per_mechano_gene", {})
        per_mechano: dict[str, float] = {}
        for target, val in per_mechano_raw.items():
            if isinstance(val, dict):
                # Pathway format: {distance, inverse, path}
                per_mechano[target] = float(
                    val.get("inverse", val.get("distance", 0.0))
                )
            else:
                per_mechano[target] = float(val)
        rankings[gene_name] = GeneRanking(
            gene=gene_name,
            rank=int(g_data["rank"]),
            score=score,
            per_mechano=per_mechano,
        )

    return PriorTable(
        source=source,
        metadata=dict(data.get("metadata", {})),
        rankings=rankings,
        available=True,
    )


def compute_divergence(
    geneformer: PriorTable,
    pathway: PriorTable,
) -> dict[str, int]:
    """Per-gene ``|rank_geneformer − rank_pathway|``.

    Returns an empty dict if either prior is unavailable; the Tab 2 UI
    interprets that as "pathway-only mode" and omits the divergence
    column entirely.
    """
    if not (geneformer.available and pathway.available):
        return {}
    out: dict[str, int] = {}
    for gene, gf in geneformer.rankings.items():
        if gene in pathway.rankings:
            out[gene] = abs(int(gf.rank) - int(pathway.rankings[gene].rank))
    return out


def build_ranking_dataframe(
    geneformer: PriorTable,
    pathway: PriorTable,
) -> pd.DataFrame:
    """Combine both priors into the dataframe consumed by Tab 2.

    Columns: ``gene``, ``geneformer_rank``, ``geneformer_score``,
    ``pathway_rank``, ``pathway_score``, ``abs_rank_divergence``.
    Missing values (one source unavailable, or a gene absent from one
    side) are left as ``NaN`` so pandas sorting still works.
    """
    all_genes = sorted(set(geneformer.rankings) | set(pathway.rankings))
    divergence = compute_divergence(geneformer, pathway)

    rows: list[dict[str, Any]] = []
    for gene in all_genes:
        gf = geneformer.rankings.get(gene)
        pw = pathway.rankings.get(gene)
        rows.append(
            {
                "gene": gene,
                "geneformer_rank": gf.rank if gf else None,
                "geneformer_score": gf.score if gf else None,
                "pathway_rank": pw.rank if pw else None,
                "pathway_score": pw.score if pw else None,
                "abs_rank_divergence": divergence.get(gene),
            }
        )
    return pd.DataFrame(rows)
