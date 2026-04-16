"""Tests for glycoquant.profiles.mechano_score.

Verifies the two population-level post-processing operations:

1. Jones-2024 size correction for YAP N/C ratio.
2. PCA-based composite mechanotransduction score with weighted-sum
   fallback when the cell count is too small for stable covariance.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from glycoquant.profiles.mechano_score import (
    apply_population_post_processing,
    apply_yap_size_correction,
    compute_mechano_score,
)

# ---------------------------------------------------------------------------
# YAP size correction
# ---------------------------------------------------------------------------


def test_size_correction_recovers_engineered_slope() -> None:
    """yap_nc_ratio = 2 + 0.001 * cell_area + noise → slope ≈ 0.001."""
    rng = np.random.default_rng(42)
    n = 200
    area = rng.uniform(500.0, 5000.0, size=n)
    raw = 2.0 + 0.001 * area + rng.normal(0.0, 0.05, size=n)
    df = pd.DataFrame({"yap_nc_ratio": raw, "cell_area": area})

    out = apply_yap_size_correction(df)

    slope = float(out["yap_size_correction_slope"].iloc[0])
    assert pytest.approx(0.001, rel=0.15) == slope, slope
    assert float(out["yap_size_correction_r2"].iloc[0]) > 0.95


def test_size_corrected_residuals_uncorrelated_with_area() -> None:
    """After correction, the size dependence should be removed."""
    rng = np.random.default_rng(7)
    n = 300
    area = rng.uniform(500.0, 5000.0, size=n)
    raw = 2.0 + 0.001 * area + rng.normal(0.0, 0.05, size=n)
    df = pd.DataFrame({"yap_nc_ratio": raw, "cell_area": area})

    out = apply_yap_size_correction(df)
    corrected = out["yap_nc_ratio_size_corrected"].to_numpy()
    r = float(np.corrcoef(corrected, area)[0, 1])
    assert abs(r) < 0.05, f"residual r vs area = {r:.3f}"


def test_size_correction_falls_back_when_too_few_cells() -> None:
    """Below the 30-cell floor, the raw column is copied unchanged."""
    df = pd.DataFrame(
        {"yap_nc_ratio": [1.0, 1.5, 2.0], "cell_area": [100, 500, 1000]}
    )
    out = apply_yap_size_correction(df)
    np.testing.assert_array_equal(
        out["yap_nc_ratio"].to_numpy(),
        out["yap_nc_ratio_size_corrected"].to_numpy(),
    )
    assert pd.isna(out["yap_size_correction_slope"].iloc[0])


def test_size_correction_handles_missing_columns_gracefully() -> None:
    """Missing inputs → corrected column is just NaN, no exception."""
    df = pd.DataFrame({"unrelated": [1.0, 2.0, 3.0]})
    out = apply_yap_size_correction(df)
    assert "yap_nc_ratio_size_corrected" in out.columns
    assert out["yap_nc_ratio_size_corrected"].isna().all()


# ---------------------------------------------------------------------------
# Composite mechano score
# ---------------------------------------------------------------------------


def _build_mechano_dataframe(n: int, seed: int = 0) -> pd.DataFrame:
    """Synthetic feature DataFrame with engineered cross-feature correlation.

    A latent factor drives 6 of the 12 mechano features so PC1 captures
    most of the variance.
    """
    rng = np.random.default_rng(seed)
    latent = rng.normal(0.0, 1.0, size=n)
    noise = lambda: rng.normal(0.0, 0.3, size=n)  # noqa: E731
    return pd.DataFrame(
        {
            "yap_nc_ratio_size_corrected": 1.5 + 0.5 * latent + noise(),
            "yap_nuclear_intensity": 100.0 + 20.0 * latent + 5.0 * noise(),
            "fa_density_per_um2": 0.1 + 0.03 * latent + noise(),
            "fa_mature_fraction": 0.4 + 0.15 * latent + noise(),
            "fa_total_area": 50.0 + 15.0 * latent + 5.0 * noise(),
            "fa_mean_orientation_alignment": 0.5 + 0.2 * latent + noise(),
            "actin_stress_fiber_coherence": 0.4 + 0.15 * latent + noise(),
            "actin_cortical_ratio": rng.normal(1.0, 0.3, size=n),
            "nuclear_aspect_ratio": rng.normal(1.5, 0.3, size=n),
            "nuclear_solidity": rng.normal(0.95, 0.05, size=n),
            "nuclear_to_cell_area_ratio": rng.normal(0.15, 0.05, size=n),
            "cell_spread_area": 1500.0 + 400.0 * latent + 100.0 * noise(),
        }
    )


def test_pca_score_explains_majority_variance_on_engineered_data() -> None:
    df = _build_mechano_dataframe(n=200, seed=1)
    out, summary = compute_mechano_score(df, mode="pca")
    assert summary.mode == "pca"
    assert summary.n_cells_used == 200
    # 6 features driven by the latent factor (post cell_spread_area
    # removal) → PC1 should still soak up well over 30% of total
    # variance. If this threshold becomes marginal in a future refactor,
    # the right fix is to tighten the engineered latent correlation in
    # ``_build_mechano_dataframe``, *not* to lower this bar.
    assert summary.pc1_variance_explained > 0.30, summary.pc1_variance_explained
    assert "mechano_score" in out.columns
    assert out["mechano_score"].notna().sum() == 200
    # Regression guardrail: cell_spread_area was removed from the panel
    # because the Jones-2024 YAP size correction already handles the
    # size axis. It must not silently reappear.
    assert "cell_spread_area" not in summary.loadings


def test_pca_score_correlates_with_size_corrected_yap() -> None:
    """PC1 is sign-aligned so the score correlates positively with YAP."""
    df = _build_mechano_dataframe(n=200, seed=2)
    out, _summary = compute_mechano_score(df, mode="pca")
    r = float(
        np.corrcoef(
            out["mechano_score"].to_numpy(),
            out["yap_nc_ratio_size_corrected"].to_numpy(),
        )[0, 1]
    )
    assert r > 0.4, f"score vs yap r = {r:.3f}"


def test_weighted_sum_fallback_when_cell_count_below_threshold() -> None:
    df = _build_mechano_dataframe(n=10, seed=3)
    _out, summary = compute_mechano_score(df, mode="pca")
    assert summary.mode == "weighted_sum"


def test_apply_population_post_processing_runs_both_steps() -> None:
    """End-to-end: size correction first, then PCA score."""
    df = _build_mechano_dataframe(n=100, seed=4)
    df["yap_nc_ratio"] = df["yap_nc_ratio_size_corrected"]
    df["cell_area"] = np.linspace(500, 4000, len(df))
    df = df.drop(columns=["yap_nc_ratio_size_corrected"])
    out, summary = apply_population_post_processing(df, mode="pca")
    assert "yap_nc_ratio_size_corrected" in out.columns
    assert "mechano_score" in out.columns
    assert summary is not None
    assert summary.mode == "pca"


def test_population_post_processing_returns_none_summary_on_empty_df() -> None:
    out, summary = apply_population_post_processing(pd.DataFrame())
    assert out.empty
    assert summary is None


# ---------------------------------------------------------------------------
# Fix 7 — adaptive floors and R² gate
# ---------------------------------------------------------------------------


def test_size_correction_skipped_when_r2_below_gate() -> None:
    """If cell_area barely predicts yap_nc_ratio the correction is noise-adding.

    The R² gate (``_MIN_R2_FOR_SIZE_CORRECTION = 0.05``) must trigger:
    the corrected column is a byte-exact copy of the raw column, and
    the ``yap_size_correction_applied`` flag is False so the UI can
    surface the fallback reason.
    """
    rng = np.random.default_rng(1)
    n = 100
    area = rng.uniform(500.0, 5000.0, size=n)
    noise = rng.normal(2.0, 0.3, size=n)  # independent of area
    df = pd.DataFrame({"yap_nc_ratio": noise, "cell_area": area})

    out = apply_yap_size_correction(df)
    assert bool(out["yap_size_correction_applied"].iloc[0]) is False
    np.testing.assert_array_equal(
        out["yap_nc_ratio"].to_numpy(),
        out["yap_nc_ratio_size_corrected"].to_numpy(),
    )


def test_size_correction_applied_when_r2_above_gate() -> None:
    """Strong area→ratio dependence triggers correction and records the CI."""
    rng = np.random.default_rng(2)
    n = 100
    area = rng.uniform(500.0, 5000.0, size=n)
    strong = 2.0 + 0.001 * area + rng.normal(0.0, 0.05, size=n)
    df = pd.DataFrame({"yap_nc_ratio": strong, "cell_area": area})

    out = apply_yap_size_correction(df)
    assert bool(out["yap_size_correction_applied"].iloc[0]) is True
    ci_lo = float(out["yap_size_correction_slope_ci_lo"].iloc[0])
    ci_hi = float(out["yap_size_correction_slope_ci_hi"].iloc[0])
    # CI must contain the engineered slope 0.001 and not cross zero
    assert ci_lo < 0.001 < ci_hi
    assert ci_lo > 0.0


def test_adaptive_pca_floor_scales_with_feature_count() -> None:
    """The Gorsuch 5×features rule kicks in for large panels."""
    from glycoquant.profiles.mechano_score import _adaptive_pca_floor

    # Below 5× rule: absolute floor dominates
    assert _adaptive_pca_floor(3) == 30
    assert _adaptive_pca_floor(5) == 30
    # At 7+ features, the 5×features rule dominates
    assert _adaptive_pca_floor(7) == 35
    assert _adaptive_pca_floor(11) == 55


def test_pca_fallback_triggers_below_adaptive_floor() -> None:
    """50 cells with the full 11-feature panel falls back to weighted_sum.

    The adaptive floor at 11 features is 55; with 50 complete-row
    cells PCA is not statistically defensible. The score column is
    still populated — the fallback is transparent, not a failure.
    """
    df = _build_mechano_dataframe(n=50, seed=11)
    out, summary = compute_mechano_score(df, mode="pca")
    assert summary.mode == "weighted_sum"
    assert "mechano_score" in out.columns
    # 100 cells — above 55 — the PCA branch runs
    df_big = _build_mechano_dataframe(n=100, seed=12)
    _out_big, summary_big = compute_mechano_score(df_big, mode="pca")
    assert summary_big.mode == "pca"


def test_mechano_score_summary_exposes_yap_diagnostic_when_applied() -> None:
    """apply_population_post_processing threads yap_size_correction_* into summary.

    The four yap_size_correction_* fields live on the per-cell DataFrame
    by construction (apply_yap_size_correction broadcasts them across
    rows). The UI needs them at image level; apply_population_post_-
    processing must pull them onto MechanoScoreSummary so the frontend
    can badge the diagnostic without scraping every row.
    """
    rng = np.random.default_rng(2)
    n = 100
    area = rng.uniform(500.0, 5000.0, size=n)
    strong = 2.0 + 0.001 * area + rng.normal(0.0, 0.05, size=n)
    df = _build_mechano_dataframe(n=n, seed=2)
    df["yap_nc_ratio"] = strong
    df["cell_area"] = area
    # Drop the existing yap_nc_ratio_size_corrected column so the
    # population post-processing re-runs the correction from scratch.
    df = df.drop(columns=["yap_nc_ratio_size_corrected"])

    _out, summary = apply_population_post_processing(df, mode="pca")
    assert summary is not None
    assert summary.yap_size_correction_applied is True
    assert summary.yap_size_correction_r2 is not None
    assert summary.yap_size_correction_r2 > 0.5
    assert summary.yap_size_correction_slope_ci_lo is not None
    assert summary.yap_size_correction_slope_ci_hi is not None
    # Engineered slope 0.001 must sit inside the CI
    assert summary.yap_size_correction_slope_ci_lo < 0.001 < summary.yap_size_correction_slope_ci_hi


def test_mechano_score_summary_exposes_yap_diagnostic_when_skipped() -> None:
    """R² gate below 0.05 → applied=False surfaces on the summary."""
    rng = np.random.default_rng(3)
    n = 100
    df = _build_mechano_dataframe(n=n, seed=3)
    df["yap_nc_ratio"] = rng.normal(2.0, 0.3, size=n)  # independent of area
    df["cell_area"] = rng.uniform(500.0, 5000.0, size=n)
    df = df.drop(columns=["yap_nc_ratio_size_corrected"])

    _out, summary = apply_population_post_processing(df, mode="pca")
    assert summary is not None
    assert summary.yap_size_correction_applied is False
    # R² is defined even on the skipped path
    assert summary.yap_size_correction_r2 is not None
