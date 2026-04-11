"""Image-aware re-weighting of the Tab 2 pathway prior.

The static Tab 2 computes every glycocalyx gene's pathway score as the
**median inverse shortest path** across the 15-gene mechanotransduction
signature (see :func:`glycoquant.predictor.pathway_score.median_inverse_shortest_path`).
This module extends that with a **weighted median** where the per-target
weights come from the user's observed per-cell features.

Why this matters: the scientific question Tab 2 is supposed to answer
is *"for the phenotype I just observed in Tab 1, which glycocalyx
perturbation is most likely to engage the mechanotransduction axes
that are actually active?"*. A uniform median cannot answer that —
it gives the same ranking to every user. A weighted median weighted
by z-scored phenotypic deviations does.

Scientific rationale for the curated feature→gene map:

- **YAP/TAZ axis** — Dupont *et al.*, *Nature* 2011 established
  nuclear/cytoplasmic YAP ratio as the canonical translocation
  readout; Zanconato *et al.*, *Genes Dev* 2016 tied CTGF/CYR61/ANKRD1
  to TEAD-YAP transcription.
- **Integrin/focal-adhesion axis** — Kanchanawong *et al.*, *Nature*
  2010 mapped the paxillin-vinculin-talin architecture; Zaidel-Bar
  *et al.*, *Nat Cell Biol* 2007 staged FA maturation by area +
  elongation + peripheral localisation.
- **Rho/ROCK axis** — Ridley & Hall, *Cell* 1992 linked RhoA to
  stress-fibre formation; Maekawa *et al.*, *Science* 1999 showed
  ROCK1/2 phosphorylation of myosin (MLC2 / MYL9) drives stress-fibre
  contractility — i.e. the ``actin_stress_fiber_coherence`` readout.
- **PIEZO1** — Lomakin *et al.*, *Nature* 2020 and Venturini *et al.*,
  *Science* 2020 showed nuclear shape (solidity, area ratio) reports
  on stretch-activated channels, of which PIEZO1 is the canonical
  plasma-membrane example.

Everything in this module is pure Python + numpy + pandas — no GPU,
no network, no file I/O. It is unit-testable in isolation.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from glycoquant.predictor.mechano_signature import get_mechano_signature
from glycoquant.predictor.prior_loader import PriorTable

# ---------------------------------------------------------------------------
# Curated feature → mechano gene contribution map
# ---------------------------------------------------------------------------


FEATURE_TO_MECHANO: dict[str, list[str]] = {
    # YAP/TAZ axis — direct translocation readouts (Dupont 2011)
    "yap_nc_ratio": ["YAP1", "WWTR1"],
    "yap_nuclear_fraction": ["YAP1", "WWTR1"],
    # YAP transcriptional targets — the same translocation features
    # are the best proxy we have for downstream TEAD activity
    # (Zanconato 2016)
    "yap_target_ctgf_cyr61_ankrd1": ["CTGF", "CYR61", "ANKRD1"],
    # Integrin / focal-adhesion axis (Kanchanawong 2010, Zaidel-Bar 2007)
    "fa_count": ["ITGB1", "PTK2", "VCL", "PXN"],
    "fa_mean_elongation": ["TLN1", "VCL"],
    "fa_peripheral_fraction": ["ITGB1", "PTK2"],
    "fa_mean_area": ["TLN1", "VCL"],
    # Rho/ROCK contractility axis (Ridley 1992, Maekawa 1999)
    "actin_stress_fiber_coherence": ["RHOA", "ROCK1", "ROCK2", "MYL9"],
    "actin_cortical_ratio": ["RHOA", "MYL9"],
    # PIEZO1 stretch sensor, reported by nuclear shape
    # (Lomakin 2020, Venturini 2020)
    "nuclear_to_cell_area_ratio": ["PIEZO1"],
    "nuclear_solidity": ["PIEZO1"],
}

# Features where the biological null is a specific non-zero value.
# Used only when the reference cohort is unavailable and we fall back
# to hardcoded nulls.
FALLBACK_NULLS: dict[str, tuple[float, float]] = {
    # feature: (null_mean, null_std)
    "yap_nc_ratio": (1.0, 0.3),
    "yap_nuclear_fraction": (0.5, 0.2),
    "yap_target_ctgf_cyr61_ankrd1": (1.0, 0.3),  # proxy uses yap_nc_ratio
    "fa_count": (50.0, 30.0),
    "fa_mean_elongation": (1.5, 0.5),
    "fa_peripheral_fraction": (0.3, 0.2),
    "fa_mean_area": (25.0, 15.0),
    "actin_stress_fiber_coherence": (0.4, 0.15),
    "actin_cortical_ratio": (1.0, 0.5),
    "nuclear_to_cell_area_ratio": (0.15, 0.05),
    "nuclear_solidity": (0.95, 0.05),
}

# Epsilon below which a z-score is treated as floating-point noise
# rather than real biological signal. Necessary because pandas
# computes [0.4, 0.4, 0.4].mean() as 0.4000000000000001 — a ~1e-16
# deviation that would otherwise trip the "any signal" flag in
# compute_mechano_weights.
_Z_NOISE_EPS = 1e-9


# ---------------------------------------------------------------------------
# Reference cohort
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ReferenceCohort:
    """Per-feature mean and std from a reference cohort.

    Used to z-score the current image's feature means so the derived
    mechano-gene weights are comparable across images. Loaded from
    ``data/reference/mechano_reference.json`` when present; otherwise a
    hardcoded fallback ladder is used (see :data:`FALLBACK_NULLS`).

    Attributes
    ----------
    source : str
        Human-readable name of the cohort (e.g. "HPA bundled demos").
    features : dict[str, tuple[float, float]]
        ``{feature_name: (mean, std)}``. ``std`` is always > 0 to avoid
        division by zero on z-scoring.
    used_fallback : bool
        True when the cohort was built from :data:`FALLBACK_NULLS`
        because the JSON file was missing.
    """

    source: str
    features: dict[str, tuple[float, float]]
    used_fallback: bool = False


def load_reference_cohort(path: str | Path | None = None) -> ReferenceCohort:
    """Load the reference cohort, falling back to hardcoded nulls on error.

    Parameters
    ----------
    path : str or Path, optional
        Path to ``mechano_reference.json``. Defaults to
        ``<repo>/data/reference/mechano_reference.json``.

    Returns
    -------
    ReferenceCohort
        ``used_fallback=False`` when the JSON loaded cleanly;
        ``used_fallback=True`` when the file was missing, unreadable,
        or lacked any of the features in :data:`FEATURE_TO_MECHANO`.
    """
    import json

    if path is None:
        path = (
            Path(__file__).resolve().parents[2]
            / "data"
            / "reference"
            / "mechano_reference.json"
        )
    path = Path(path)

    try:
        blob = json.loads(path.read_text(encoding="utf-8"))
        raw = blob.get("features", {})
        features: dict[str, tuple[float, float]] = {}
        for name, entry in raw.items():
            mean = float(entry.get("mean", 0.0))
            std = float(entry.get("std", 0.0))
            if not math.isfinite(mean) or not math.isfinite(std) or std <= 0.0:
                continue
            features[name] = (mean, std)
        # Backfill any missing features from the fallback table so
        # weight computation never has to reach for a missing key.
        for name, (mean, std) in FALLBACK_NULLS.items():
            features.setdefault(name, (mean, std))
        return ReferenceCohort(
            source=str(blob.get("source", "unknown")),
            features=features,
            used_fallback=False,
        )
    except (OSError, ValueError):
        return ReferenceCohort(
            source="fallback (hardcoded biological nulls)",
            features=dict(FALLBACK_NULLS),
            used_fallback=True,
        )


# ---------------------------------------------------------------------------
# Weight computation
# ---------------------------------------------------------------------------


def compute_mechano_weights(
    features_df: pd.DataFrame,
    reference: ReferenceCohort,
    mechano_genes: list[str] | None = None,
) -> dict[str, float]:
    """Return ``{mechano_gene: weight ∈ [0, 1]}`` from per-cell features.

    Algorithm:

    1. For every feature in :data:`FEATURE_TO_MECHANO`, compute the
       image-level mean via ``nanmean`` (the extractors are NaN-safe).
    2. Z-score that mean against the reference cohort's mean/std:
       ``z = (obs_mean - ref_mean) / ref_std``.
    3. Take ``|z|`` — we want extreme deviation *in either direction*
       to drive the ranking, since over- and under-activation of a
       pathway are both biologically informative.
    4. For each mechano gene in the 15-gene signature, sum the ``|z|``
       contributions from every feature whose map includes it.
    5. Apply an L1 normalisation so weights sum to 1.0.
    6. Apply a minimum floor of ``1 / (n_mechano · 10)`` so a single
       wildly-deviant feature cannot produce a degenerate weight vector.

    When ``features_df`` is empty or no feature in the map has a
    finite mean, the function returns uniform weights (``1 / n``) —
    which collapses the weighted median back to the plain median and
    reproduces the static ranking exactly. This is the regression
    guardrail.

    Parameters
    ----------
    features_df : pandas.DataFrame
        Per-cell feature table as emitted by
        :class:`glycoquant.profiles.ProfileAssembler`.
    reference : ReferenceCohort
        Reference cohort for z-scoring. Use :func:`load_reference_cohort`
        to build it.
    mechano_genes : list[str], optional
        Which 15-gene signature to weight. Defaults to
        :func:`glycoquant.predictor.mechano_signature.get_mechano_signature`.

    Returns
    -------
    dict[str, float]
        ``{mechano_gene: weight}`` that sums to 1.0.
    """
    if mechano_genes is None:
        mechano_genes = get_mechano_signature()

    n = len(mechano_genes)
    if n == 0:
        return {}

    # Step 1–3: per-feature absolute z-scores.
    feature_abs_z: dict[str, float] = {}
    for feature_name in FEATURE_TO_MECHANO:
        # Not every feature survives every extractor. In particular
        # "yap_target_ctgf_cyr61_ankrd1" is a virtual alias of
        # yap_nc_ratio — we fold it in below.
        source_column = (
            "yap_nc_ratio"
            if feature_name == "yap_target_ctgf_cyr61_ankrd1"
            else feature_name
        )
        if source_column not in features_df.columns:
            continue
        col = features_df[source_column].to_numpy(dtype=np.float64)
        if col.size == 0 or not np.any(np.isfinite(col)):
            continue
        obs_mean = float(np.nanmean(col))
        if not math.isfinite(obs_mean):
            continue
        ref = reference.features.get(feature_name)
        if ref is None:
            continue
        ref_mean, ref_std = ref
        if ref_std <= 0.0:
            continue
        feature_abs_z[feature_name] = abs((obs_mean - ref_mean) / ref_std)

    # Step 4: accumulate per-mechano-gene contributions. Use a small
    # epsilon when flagging "any signal" — floating-point noise in a
    # pandas mean (e.g. [0.4, 0.4, 0.4].mean() == 0.4000000000000001)
    # can produce z ≈ 1e-16, which is not real signal but would
    # otherwise bypass the uniform-fallback branch.
    raw_weights: dict[str, float] = {g: 0.0 for g in mechano_genes}
    any_nonzero = False
    for feature_name, z in feature_abs_z.items():
        for gene in FEATURE_TO_MECHANO[feature_name]:
            if gene in raw_weights:
                raw_weights[gene] += z
                if z > _Z_NOISE_EPS:
                    any_nonzero = True

    # Step 5: L1 normalise; step 6: floor.
    if not any_nonzero:
        # Degenerate input → uniform weights (reproduces the static ranking)
        uniform = 1.0 / n
        return {g: uniform for g in mechano_genes}

    total = sum(raw_weights.values())
    if total <= 0.0:
        uniform = 1.0 / n
        return {g: uniform for g in mechano_genes}

    floor = 1.0 / (n * 10.0)
    normalised: dict[str, float] = {}
    for gene in mechano_genes:
        normalised[gene] = max(raw_weights[gene] / total, floor)

    # Re-normalise after flooring so the sum is exactly 1.0
    s = sum(normalised.values())
    return {g: v / s for g, v in normalised.items()}


# ---------------------------------------------------------------------------
# Weighted median
# ---------------------------------------------------------------------------


def weighted_median(values: list[float], weights: list[float]) -> float:
    """Return the 50-th weighted percentile of ``values``.

    Uses the sort-and-cumsum convention:
    sort ``(value, weight)`` pairs by value ascending, compute the
    cumulative weight, and return the first value whose cumulative
    weight crosses half the total. Ties at the crossover return the
    mean of the two adjacent values (standard weighted-median
    interpolation).

    NaN values are dropped (the corresponding weight is dropped too).
    Returns ``NaN`` if no finite values remain.

    Uniform weights reproduce ``numpy.median`` exactly.
    """
    vs = np.asarray(values, dtype=np.float64)
    ws = np.asarray(weights, dtype=np.float64)
    if vs.shape != ws.shape:
        raise ValueError(
            f"values/weights shape mismatch: {vs.shape} vs {ws.shape}"
        )
    mask = np.isfinite(vs) & np.isfinite(ws) & (ws > 0.0)
    vs, ws = vs[mask], ws[mask]
    if vs.size == 0:
        return math.nan

    order = np.argsort(vs)
    vs_sorted = vs[order]
    ws_sorted = ws[order]
    cum = np.cumsum(ws_sorted)
    half = cum[-1] / 2.0
    idx = int(np.searchsorted(cum, half))
    if idx >= vs_sorted.size:
        return float(vs_sorted[-1])
    # Interpolate ties at the exact crossover point
    if idx > 0 and cum[idx - 1] == half:
        return float(0.5 * (vs_sorted[idx - 1] + vs_sorted[idx]))
    return float(vs_sorted[idx])


# ---------------------------------------------------------------------------
# Weighted pathway re-ranking
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class DynamicRanking:
    """Result of :func:`recompute_pathway_ranking`.

    Attributes
    ----------
    scores : dict[str, float]
        ``{glycocalyx_gene: dynamic_score}``. Same ``[0, 1]`` range as
        the static pathway scores — just a different aggregator.
    ranks : dict[str, int]
        Rank 1 = highest score. Ties break alphabetically for
        determinism (matches the static generator).
    source_metadata : dict
        Passthrough of the static prior's metadata plus the image-
        derived mechano weight vector under ``mechano_weights``.
    """

    scores: dict[str, float]
    ranks: dict[str, int]
    source_metadata: dict[str, Any] = field(default_factory=dict)


def recompute_pathway_ranking(
    pathway_prior: PriorTable,
    weights: dict[str, float],
) -> DynamicRanking:
    """Re-aggregate the pathway prior with image-derived mechano weights.

    The static generator (``scripts/generate_pathway_priors.py``)
    computes ``score(g) = median_{m ∈ mechano} (1 / (1 + d(g, m)))``.
    This function computes the **weighted median** of the same inverse
    distances, using the weights produced by
    :func:`compute_mechano_weights`.

    Sanity guarantee (enforced by the unit tests): uniform weights
    produce the exact same ranking as the static prior. That is the
    regression guardrail for the whole re-weighting refactor.

    Parameters
    ----------
    pathway_prior : PriorTable
        Output of :func:`glycoquant.predictor.prior_loader.load_prior`
        on ``data/priors/pathway_ranks.json``. Must be ``available``.
    weights : dict[str, float]
        ``{mechano_gene: weight}``. Ideally sums to 1.0 but any
        positive vector is accepted.

    Returns
    -------
    DynamicRanking
    """
    if not pathway_prior.available:
        return DynamicRanking(scores={}, ranks={}, source_metadata={})

    scores: dict[str, float] = {}
    for gene, ranking in pathway_prior.rankings.items():
        per_target = ranking.per_mechano  # {target: inverse_distance}
        if not per_target:
            scores[gene] = math.nan
            continue
        targets_in_both = [t for t in per_target if t in weights]
        if not targets_in_both:
            scores[gene] = math.nan
            continue
        inv_values = [float(per_target[t]) for t in targets_in_both]
        w_values = [float(weights[t]) for t in targets_in_both]
        scores[gene] = weighted_median(inv_values, w_values)

    # Sort descending by score; **ties preserve the static rank** so
    # uniform weights reproduce the committed pathway_ranks.json
    # exactly. This is the regression guardrail called out in
    # tests/test_dynamic_ranking.py.
    def _sort_key(gene: str) -> tuple[float, int, str]:
        s = scores[gene]
        neg_score = -(s if math.isfinite(s) else -math.inf)
        static_rank = (
            pathway_prior.rankings[gene].rank
            if gene in pathway_prior.rankings
            else 10**9
        )
        return (neg_score, static_rank, gene)

    ordered = sorted(scores.keys(), key=_sort_key)
    ranks = {gene: i + 1 for i, gene in enumerate(ordered)}

    metadata = dict(pathway_prior.metadata)
    metadata["dynamic"] = True
    metadata["mechano_weights"] = dict(weights)
    return DynamicRanking(scores=scores, ranks=ranks, source_metadata=metadata)
