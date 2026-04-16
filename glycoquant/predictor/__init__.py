"""Perturbation prioritization backend for Tab 2.

The runtime surface is intentionally tiny: load two precomputed JSON
files, combine their rankings, render. All the heavy work (STRING
queries, Geneformer inference) lives in ``scripts/generate_*_priors.py``
and happens offline.
"""

from glycoquant.predictor.dynamic_ranking import (
    FALLBACK_NULLS,
    FEATURE_TO_MECHANO,
    DynamicRanking,
    ReferenceCohort,
    compute_mechano_signed_z,
    compute_mechano_weights,
    load_reference_cohort,
    recompute_pathway_ranking,
    weighted_median,
)
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
    PriorStatus,
    PriorStatusReport,
    PriorTable,
    build_ranking_dataframe,
    compute_divergence,
    load_prior,
    prior_status,
)

__all__ = [
    "EXPECTED_GLYCOCALYX_COUNT",
    "EXPECTED_MECHANO_COUNT",
    "EXPECTED_METABOLIC_COUNT",
    "FALLBACK_NULLS",
    "FEATURE_TO_MECHANO",
    "DynamicRanking",
    "GeneRanking",
    "PriorStatus",
    "PriorStatusReport",
    "PriorTable",
    "ReferenceCohort",
    "build_ranking_dataframe",
    "compute_divergence",
    "compute_mechano_signed_z",
    "compute_mechano_weights",
    "get_glycocalyx_genes",
    "get_mechano_signature",
    "get_metabolic_inhibitors",
    "load_prior",
    "load_reference_cohort",
    "median_inverse_shortest_path",
    "prior_status",
    "recompute_pathway_ranking",
    "validate_gene_panels",
    "weighted_median",
]
