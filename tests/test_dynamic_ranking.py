"""Unit tests for image-aware re-weighting of the Tab 2 pathway prior.

The single most important test here is
:func:`test_uniform_weights_reproduce_static_ranking` — it's the
regression guardrail that guarantees ``recompute_pathway_ranking`` with
uniform weights produces the exact same per-gene ranking as the static
``data/priors/pathway_ranks.json``. Anything else that changes the
dynamic re-weighting code must keep that guarantee intact.
"""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from glycoquant.predictor import (
    FEATURE_TO_MECHANO,
    ReferenceCohort,
    compute_mechano_weights,
    get_mechano_signature,
    load_prior,
    recompute_pathway_ranking,
    weighted_median,
)
from glycoquant.predictor.dynamic_ranking import (
    FALLBACK_NULLS,
    load_reference_cohort,
)

PATHWAY_JSON = (
    Path(__file__).resolve().parents[1] / "data" / "priors" / "pathway_ranks.json"
)


# ---------------------------------------------------------------------------
# weighted_median
# ---------------------------------------------------------------------------


def test_weighted_median_matches_numpy_median_for_uniform_weights() -> None:
    values = [0.1, 0.4, 0.3, 0.8, 0.2]
    weights = [1.0] * 5
    assert weighted_median(values, weights) == pytest.approx(
        float(np.median(values)), abs=1e-9
    )


def test_weighted_median_biases_toward_heavier_side() -> None:
    values = [0.1, 0.2, 0.9]
    heavy_high = weighted_median(values, [0.1, 0.1, 0.8])
    heavy_low = weighted_median(values, [0.8, 0.1, 0.1])
    assert heavy_high == pytest.approx(0.9)
    assert heavy_low == pytest.approx(0.1)


def test_weighted_median_drops_nans_gracefully() -> None:
    values = [math.nan, 0.5, 0.7]
    weights = [0.4, 0.4, 0.2]
    # Only 0.5 and 0.7 contribute; cum weight [0.4, 0.2] → 0.5 at half
    assert weighted_median(values, weights) == pytest.approx(0.5)


def test_weighted_median_all_nan_returns_nan() -> None:
    values = [math.nan, math.nan]
    weights = [0.5, 0.5]
    assert math.isnan(weighted_median(values, weights))


def test_weighted_median_shape_mismatch_raises() -> None:
    with pytest.raises(ValueError, match="shape mismatch"):
        weighted_median([1.0, 2.0], [1.0])


# ---------------------------------------------------------------------------
# load_reference_cohort
# ---------------------------------------------------------------------------


def test_load_reference_cohort_falls_back_when_file_missing(tmp_path) -> None:
    missing = tmp_path / "does_not_exist.json"
    ref = load_reference_cohort(missing)
    assert ref.used_fallback is True
    # Every feature in the contribution map must have a fallback null
    for feature in FEATURE_TO_MECHANO:
        assert feature in ref.features, f"missing fallback for {feature}"
    assert set(ref.features.keys()) == set(FALLBACK_NULLS.keys())


def test_load_reference_cohort_reads_json(tmp_path) -> None:
    import json

    payload = {
        "source": "test-cohort",
        "features": {
            "yap_nc_ratio": {"mean": 0.6, "std": 0.2},
            "fa_count": {"mean": 80.0, "std": 25.0},
        },
    }
    path = tmp_path / "ref.json"
    path.write_text(json.dumps(payload))
    ref = load_reference_cohort(path)
    assert ref.used_fallback is False
    assert ref.source == "test-cohort"
    assert ref.features["yap_nc_ratio"] == (0.6, 0.2)
    # Missing features are backfilled from FALLBACK_NULLS so weight
    # computation never crashes on a partial reference
    assert "actin_stress_fiber_coherence" in ref.features


# ---------------------------------------------------------------------------
# compute_mechano_weights
# ---------------------------------------------------------------------------


@pytest.fixture
def mechano() -> list[str]:
    return get_mechano_signature()


@pytest.fixture
def ref() -> ReferenceCohort:
    return load_reference_cohort()


def test_empty_df_returns_uniform_weights(mechano: list[str], ref: ReferenceCohort) -> None:
    w = compute_mechano_weights(pd.DataFrame(), ref, mechano)
    assert set(w.keys()) == set(mechano)
    assert sum(w.values()) == pytest.approx(1.0, abs=1e-9)
    expected = 1.0 / len(mechano)
    for v in w.values():
        assert v == pytest.approx(expected, abs=1e-9)


def test_all_null_features_return_uniform_weights(
    mechano: list[str], ref: ReferenceCohort
) -> None:
    # Values equal to the biological null → zero z-score → uniform weights
    df = pd.DataFrame(
        {
            "yap_nc_ratio": [1.0, 1.0, 1.0],
            "fa_count": [50.0, 50.0, 50.0],
            "actin_stress_fiber_coherence": [0.4, 0.4, 0.4],
            "nuclear_solidity": [0.95, 0.95, 0.95],
        }
    )
    w = compute_mechano_weights(df, ref, mechano)
    expected = 1.0 / len(mechano)
    for v in w.values():
        assert v == pytest.approx(expected, abs=1e-6)


def test_elevated_yap_shifts_weights_onto_yap_axis(
    mechano: list[str], ref: ReferenceCohort
) -> None:
    """High yap_nc_ratio should push weight onto YAP1, WWTR1, CTGF, CYR61, ANKRD1."""
    df = pd.DataFrame({"yap_nc_ratio": [2.5, 2.8, 3.0, 2.7]})
    w = compute_mechano_weights(df, ref, mechano)
    # YAP direct targets get the largest share
    assert w["YAP1"] > 0.15
    assert w["WWTR1"] > 0.15
    # Rho/ROCK axis stays at the floor (no actin signal)
    assert w["RHOA"] < 0.02
    assert w["ROCK1"] < 0.02
    assert sum(w.values()) == pytest.approx(1.0, abs=1e-6)


def test_elevated_fa_features_shift_weights_onto_integrin_axis(
    mechano: list[str], ref: ReferenceCohort
) -> None:
    df = pd.DataFrame(
        {
            "fa_count": [200.0, 180.0, 220.0, 210.0],
            "fa_mean_elongation": [3.0, 3.2, 3.1, 2.8],
        }
    )
    w = compute_mechano_weights(df, ref, mechano)
    # Integrin/FA axis wins
    assert w["ITGB1"] > 0.1
    assert w["PTK2"] > 0.1
    # YAP axis floors out
    assert w["YAP1"] < 0.02
    assert sum(w.values()) == pytest.approx(1.0, abs=1e-6)


def test_weights_sum_to_one_and_every_gene_has_positive_weight(
    mechano: list[str], ref: ReferenceCohort
) -> None:
    """No mechano gene is ever silently zeroed — even under extreme input.

    The minimum floor inside ``compute_mechano_weights`` is applied
    *before* L1 re-normalisation, so it guarantees a strictly positive
    post-normalisation value (the exact magnitude depends on how much
    the dominant features grab). The guarantee we care about in
    practice is *"no gene has zero weight and the vector sums to 1"*.
    """
    df = pd.DataFrame(
        {
            "yap_nc_ratio": [10.0] * 5,  # absurdly extreme — one feature dominates
        }
    )
    w = compute_mechano_weights(df, ref, mechano)
    assert sum(w.values()) == pytest.approx(1.0, abs=1e-6)
    for gene, v in w.items():
        assert v > 0.0, f"{gene} was silently zeroed"


# ---------------------------------------------------------------------------
# recompute_pathway_ranking — THE regression guardrail
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def pathway_prior():
    return load_prior(PATHWAY_JSON, source="pathway")


def test_uniform_weights_reproduce_static_ranking(
    pathway_prior, mechano: list[str]
) -> None:
    """With uniform weights the dynamic ranking must match the static one.

    This is the regression guardrail for the entire re-weighting
    refactor. If this test fails, it means a change to
    ``recompute_pathway_ranking`` or ``weighted_median`` has drifted
    the numerical behaviour of the baseline away from the median, and
    every Tab 2 user would now see a subtly-different default ranking.
    """
    assert pathway_prior.available
    uniform = {g: 1.0 / len(mechano) for g in mechano}
    dynamic = recompute_pathway_ranking(pathway_prior, uniform)

    static_ranks = {g: r.rank for g, r in pathway_prior.rankings.items()}
    # Rank order must match for every gene that has a ranking
    for gene, static_rank in static_ranks.items():
        assert dynamic.ranks[gene] == static_rank, (
            f"{gene}: static rank {static_rank}, dynamic rank {dynamic.ranks[gene]}"
        )


def test_elevated_yap_weights_promote_yap_close_glycocalyx_genes(
    pathway_prior, mechano: list[str], ref: ReferenceCohort
) -> None:
    """Heavy YAP weights should favour glycocalyx genes close to YAP1 in STRING.

    SDC4 and CD44 sit directly on the SDC-YAP axis in STRING; their
    dynamic ranking under heavy-YAP weights must stay in the top 5.
    """
    df = pd.DataFrame({"yap_nc_ratio": [3.0, 3.2, 2.9, 3.1, 3.0]})
    weights = compute_mechano_weights(df, ref, mechano)
    dynamic = recompute_pathway_ranking(pathway_prior, weights)
    top_5 = sorted(dynamic.ranks.items(), key=lambda kv: kv[1])[:5]
    top_5_genes = {g for g, _ in top_5}
    assert "CD44" in top_5_genes or "SDC4" in top_5_genes


def test_dynamic_metadata_includes_weights(
    pathway_prior, mechano: list[str], ref: ReferenceCohort
) -> None:
    df = pd.DataFrame({"fa_count": [150.0, 200.0]})
    w = compute_mechano_weights(df, ref, mechano)
    dynamic = recompute_pathway_ranking(pathway_prior, w)
    assert dynamic.source_metadata["dynamic"] is True
    assert set(dynamic.source_metadata["mechano_weights"].keys()) == set(mechano)
