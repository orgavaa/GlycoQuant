"""Perturbation prioritization backend for Tab 2.

The runtime surface is intentionally tiny: load two precomputed JSON
files, combine their rankings, render. All the heavy work (STRING
queries, Geneformer inference) lives in ``scripts/generate_*_priors.py``
and happens offline.
"""

from glycoquant.predictor.mechano_signature import (
    EXPECTED_GLYCOCALYX_COUNT,
    EXPECTED_MECHANO_COUNT,
    EXPECTED_METABOLIC_COUNT,
    get_glycocalyx_genes,
    get_mechano_signature,
    get_metabolic_inhibitors,
    validate_gene_panels,
)
from glycoquant.predictor.pathway_score import median_inverse_shortest_path
from glycoquant.predictor.prior_loader import (
    GeneRanking,
    PriorTable,
    build_ranking_dataframe,
    compute_divergence,
    load_prior,
)

__all__ = [
    "EXPECTED_GLYCOCALYX_COUNT",
    "EXPECTED_MECHANO_COUNT",
    "EXPECTED_METABOLIC_COUNT",
    "GeneRanking",
    "PriorTable",
    "build_ranking_dataframe",
    "compute_divergence",
    "get_glycocalyx_genes",
    "get_mechano_signature",
    "get_metabolic_inhibitors",
    "load_prior",
    "median_inverse_shortest_path",
    "validate_gene_panels",
]
