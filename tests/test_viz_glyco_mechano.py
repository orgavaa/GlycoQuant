"""Tests for glycoquant.viz.glyco_mechano_correlation.

The headline Tab 1 figure: a rectangular cross-block correlation
matrix between glycocalyx features and mechanotransduction
features. Verified on a synthetic DataFrame where one specific
glyco/mechano pair is engineered to have a strong correlation —
the figure must surface that pair as the top |r|.

Also verifies Benjamini–Hochberg FDR correction over the flat
vector of finite p-values: monotonicity, q ≥ p, all-NaN
handling, and the presence of star annotations on the rendered
figure for strong-signal fixtures.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import plotly.graph_objects as go

from glycoquant.viz.glyco_mechano_correlation import (
    ALPHA,
    GLYCO_COLUMNS,
    MECHANO_COLUMNS,
    compute_glyco_mechano_correlation,
    plot_glyco_mechano_correlation,
    plot_mechano_score_distribution,
)


def _build_dataframe_with_engineered_pair(
    glyco_col: str = "glycocalyx_haralick_contrast",
    mechano_col: str = "fa_mature_fraction",
    n: int = 200,
) -> pd.DataFrame:
    """Synthetic DataFrame where one glyco/mechano pair is correlated."""
    rng = np.random.default_rng(42)
    latent = rng.normal(0.0, 1.0, size=n)
    data: dict[str, np.ndarray] = {}
    for c in GLYCO_COLUMNS:
        if c == glyco_col:
            data[c] = 0.5 + 0.4 * latent + rng.normal(0.0, 0.05, size=n)
        else:
            data[c] = rng.normal(0.0, 1.0, size=n)
    for c in MECHANO_COLUMNS:
        if c == mechano_col:
            data[c] = 0.5 + 0.4 * latent + rng.normal(0.0, 0.05, size=n)
        else:
            data[c] = rng.normal(0.0, 1.0, size=n)
    return pd.DataFrame(data)


def test_top_correlation_matches_engineered_pair() -> None:
    df = _build_dataframe_with_engineered_pair()
    result = compute_glyco_mechano_correlation(df)
    assert result.top_pair == (
        "glycocalyx_haralick_contrast",
        "fa_mature_fraction",
    )
    assert abs(result.top_r) > 0.85


def test_correlation_matrix_shape_matches_available_columns() -> None:
    df = _build_dataframe_with_engineered_pair()
    result = compute_glyco_mechano_correlation(df)
    assert result.r_matrix.shape == (
        len(result.glyco_features),
        len(result.mechano_features),
    )
    # All synthetic columns are present, so we should see every entry.
    assert set(result.glyco_features) == set(GLYCO_COLUMNS)
    assert set(result.mechano_features) == set(MECHANO_COLUMNS)


def test_plot_returns_plotly_figure_and_bundle() -> None:
    df = _build_dataframe_with_engineered_pair()
    fig, bundle = plot_glyco_mechano_correlation(df)
    assert isinstance(fig, go.Figure)
    assert bundle.top_pair is not None
    # Heatmap is the only data trace.
    assert any(trace.type == "heatmap" for trace in fig.data)


def test_handles_missing_columns_gracefully() -> None:
    """Subset DataFrames should still produce a valid (smaller) figure."""
    df = pd.DataFrame(
        {
            "glycocalyx_mean_intensity": np.random.random(50),
            "glycocalyx_shannon_entropy": np.random.random(50),
            "yap_nc_ratio_size_corrected": np.random.random(50),
            "mechano_score": np.random.random(50),
            "cell_area": np.random.random(50),
        }
    )
    result = compute_glyco_mechano_correlation(df)
    assert result.r_matrix.shape == (2, 2)


def test_constant_columns_are_skipped_not_crashing() -> None:
    df = pd.DataFrame(
        {
            "glycocalyx_mean_intensity": np.zeros(100),
            "yap_nc_ratio_size_corrected": np.random.random(100),
        }
    )
    result = compute_glyco_mechano_correlation(df)
    # Constant column → NaN correlation, top_pair stays None.
    assert np.isnan(result.r_matrix[0, 0])
    assert result.top_pair is None


def test_score_distribution_returns_empty_on_missing_column() -> None:
    df = pd.DataFrame({"unrelated": [1.0, 2.0]})
    fig = plot_mechano_score_distribution(df)
    assert isinstance(fig, go.Figure)
    assert len(fig.data) == 0


def test_score_distribution_renders_with_data() -> None:
    df = pd.DataFrame({"mechano_score": np.random.normal(0.0, 1.0, 100)})
    fig = plot_mechano_score_distribution(df)
    assert isinstance(fig, go.Figure)
    assert len(fig.data) == 1


# ---------------------------------------------------------------------------
# BH-FDR correction (Benjamini & Hochberg 1995)
# ---------------------------------------------------------------------------


def test_q_matrix_is_bh_corrected() -> None:
    """q-values respect BH monotonicity and dominate raw p-values.

    The invariants any BH implementation must satisfy on finite values:
      (1) ``q ∈ [0, 1]`` — bounded like a probability.
      (2) ``q[i] >= p[i]`` — adjustment is one-sided (inflates p).
      (3) ``p[a] <= p[b] ⇒ q[a] <= q[b]`` — weak monotonicity on the
          input order. (Strict argsort is NOT preserved because BH
          creates legitimate ties from the min() step-up.)
    """
    df = _build_dataframe_with_engineered_pair()
    result = compute_glyco_mechano_correlation(df)

    finite_mask = np.isfinite(result.p_matrix) & np.isfinite(result.q_matrix)
    assert finite_mask.any(), "expected some finite p/q values on synthetic data"

    q_flat = result.q_matrix[finite_mask]
    p_flat = result.p_matrix[finite_mask]

    # (1) bounded
    assert (q_flat >= 0.0).all() and (q_flat <= 1.0).all()

    # (2) q >= p on every finite entry
    # Tiny floating-point slack for the BH stepdown; must be within 1e-12.
    assert np.all(q_flat >= p_flat - 1e-12)

    # (3) weak monotonicity: sort by p, check q is non-decreasing under
    # that ordering (modulo floating-point slack). Equivalent statement
    # of BH's rank-preservation that tolerates legitimate ties.
    order = np.argsort(p_flat)
    q_in_p_order = q_flat[order]
    diffs = np.diff(q_in_p_order)
    assert np.all(diffs >= -1e-12), "BH monotonicity violated"


def test_n_significant_pairs_on_strong_signal() -> None:
    """An engineered strong correlation survives BH at α=0.05."""
    df = _build_dataframe_with_engineered_pair()
    result = compute_glyco_mechano_correlation(df)
    assert result.n_significant_pairs >= 1
    # The engineered pair is the strongest signal by construction; its
    # tile must be below the FDR cutoff.
    i = result.glyco_features.index("glycocalyx_haralick_contrast")
    j = result.mechano_features.index("fa_mature_fraction")
    assert result.q_matrix[i, j] < ALPHA


def test_all_nan_pvalues_handled_without_crash() -> None:
    """Constant columns produce NaN p-values; q_matrix must mirror NaN."""
    df = pd.DataFrame(
        {
            "glycocalyx_mean_intensity": np.zeros(60),
            "yap_nc_ratio_size_corrected": np.zeros(60),
        }
    )
    result = compute_glyco_mechano_correlation(df)
    assert np.isnan(result.q_matrix).all()
    assert result.n_significant_pairs == 0


def test_figure_contains_significance_annotations() -> None:
    """Strong-signal fixture renders at least one star annotation."""
    df = _build_dataframe_with_engineered_pair()
    fig, bundle = plot_glyco_mechano_correlation(df)
    assert bundle.n_significant_pairs >= 1

    annotations = fig.layout.annotations or ()
    star_annotations = [
        a for a in annotations if a.text and set(a.text).issubset({"*"})
    ]
    assert len(star_annotations) >= 1
    # Subtitle must mention the FDR count
    title_text = fig.layout.title.text if fig.layout.title else ""
    assert "sig. at FDR" in title_text
