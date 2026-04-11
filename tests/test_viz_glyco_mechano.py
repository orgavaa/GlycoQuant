"""Tests for glycoquant.viz.glyco_mechano_correlation.

The headline Tab 1 figure: a rectangular cross-block correlation
matrix between glycocalyx features and mechanotransduction
features. Verified on a synthetic DataFrame where one specific
glyco/mechano pair is engineered to have a strong correlation —
the figure must surface that pair as the top |r|.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import plotly.graph_objects as go

from glycoquant.viz.glyco_mechano_correlation import (
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
