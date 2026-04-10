"""Tests for glycoquant.viz figure factories.

The viz layer returns plain ``plotly.graph_objects.Figure`` instances,
so tests assert on figure structure (trace count, shape, layout title)
rather than on rendered output. No browser, no Streamlit.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import plotly.graph_objects as go
import pytest

from glycoquant.viz import (
    plot_correlation_map,
    plot_drill_down_heatmap,
    plot_prior_ranking_table,
    plot_radial_profile,
    plot_recommendation_bar,
)

# ---------------------------------------------------------------------------
# radial_profile
# ---------------------------------------------------------------------------


def test_radial_profile_returns_plotly_figure() -> None:
    profiles = np.linspace(0, 1, 100).reshape(5, 20).astype(np.float32)
    fig = plot_radial_profile(profiles)
    assert isinstance(fig, go.Figure)
    # upper band, lower band (filled), mean line = 3 traces
    assert len(fig.data) == 3
    assert "Glycocalyx" in fig.layout.title.text


def test_radial_profile_rejects_non_2d() -> None:
    with pytest.raises(ValueError, match="2D"):
        plot_radial_profile(np.zeros(20, dtype=np.float32))


def test_radial_profile_rejects_empty_cells() -> None:
    with pytest.raises(ValueError, match="at least one cell"):
        plot_radial_profile(np.zeros((0, 20), dtype=np.float32))


# ---------------------------------------------------------------------------
# correlation_map
# ---------------------------------------------------------------------------


def test_correlation_map_returns_plotly_figure() -> None:
    df = pd.DataFrame(
        {
            "a": [1.0, 2.0, 3.0, 4.0, 5.0],
            "b": [5.0, 4.0, 3.0, 2.0, 1.0],
            "c": [1.0, 1.0, 2.0, 2.0, 3.0],
        }
    )
    fig = plot_correlation_map(df)
    assert isinstance(fig, go.Figure)
    assert len(fig.data) == 1
    heatmap = fig.data[0]
    assert heatmap.type == "heatmap"
    # 3x3 correlation matrix
    assert np.asarray(heatmap.z).shape == (3, 3)


def test_correlation_map_ignores_non_numeric_columns() -> None:
    df = pd.DataFrame(
        {
            "a": [1.0, 2.0, 3.0],
            "b": [3.0, 2.0, 1.0],
            "label": ["x", "y", "z"],
        }
    )
    fig = plot_correlation_map(df)
    labels = list(fig.data[0].x)
    assert "label" not in labels
    assert set(labels) == {"a", "b"}


def test_correlation_map_rejects_single_column() -> None:
    df = pd.DataFrame({"only": [1.0, 2.0, 3.0]})
    with pytest.raises(ValueError, match="2 numeric columns"):
        plot_correlation_map(df)


# ---------------------------------------------------------------------------
# prior_table (Phase 6 stub)
# ---------------------------------------------------------------------------


def test_prior_ranking_table_placeholder_without_data() -> None:
    fig = plot_prior_ranking_table(None)
    assert isinstance(fig, go.Figure)
    # placeholder uses an annotation, not a real trace
    assert len(fig.layout.annotations) >= 1
    assert "Phase 6" in fig.layout.annotations[0].text


def test_prior_ranking_table_with_data_renders_table() -> None:
    df = pd.DataFrame(
        {
            "gene": ["SDC1", "SDC4", "EXT1"],
            "geneformer_rank": [1, 2, 3],
            "geneformer_score": [0.95, 0.88, 0.72],
            "pathway_rank": [2, 1, 5],
            "pathway_score": [0.83, 0.91, 0.41],
            "abs_rank_divergence": [1, 1, 2],
        }
    )
    fig = plot_prior_ranking_table(df)
    assert isinstance(fig, go.Figure)
    assert fig.data[0].type == "table"


def test_prior_ranking_table_missing_column_raises() -> None:
    df = pd.DataFrame({"gene": ["SDC1"], "geneformer_rank": [1]})
    with pytest.raises(ValueError, match="missing required"):
        plot_prior_ranking_table(df)


def test_drill_down_heatmap_placeholder_without_data() -> None:
    fig = plot_drill_down_heatmap(None, None, None)
    assert isinstance(fig, go.Figure)
    assert "Phase 6" in fig.layout.annotations[0].text


def test_drill_down_heatmap_with_data_renders() -> None:
    fig = plot_drill_down_heatmap(
        {"YAP1": 0.3, "RHOA": 0.5},
        {"YAP1": 0.4, "RHOA": 0.2},
        ["YAP1", "RHOA"],
    )
    assert fig.data[0].type == "heatmap"
    assert list(fig.data[0].y) == ["Geneformer", "Pathway"]


# ---------------------------------------------------------------------------
# recommendation (Phase 7 stub)
# ---------------------------------------------------------------------------


def test_recommendation_placeholder_without_data() -> None:
    fig = plot_recommendation_bar()
    assert isinstance(fig, go.Figure)
    assert "Phase 7" in fig.layout.annotations[0].text


def test_recommendation_bar_renders_with_data() -> None:
    fig = plot_recommendation_bar(
        perturbations=["SDC1", "SDC4", "EXT1"],
        scores=[0.82, 0.64, 0.41],
        uncertainties=[0.1, 0.15, 0.2],
        mode="exploration",
    )
    assert fig.data[0].type == "bar"
    assert list(fig.data[0].x) == ["SDC1", "SDC4", "EXT1"]
    assert "exploration" in fig.layout.title.text


def test_recommendation_bar_length_mismatch_raises() -> None:
    with pytest.raises(ValueError, match="length mismatch"):
        plot_recommendation_bar(
            perturbations=["a", "b"],
            scores=[1.0, 2.0, 3.0],
        )
