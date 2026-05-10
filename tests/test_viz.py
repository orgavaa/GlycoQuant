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
    plot_panel_summary,
    plot_pathway_network,
    plot_prior_ranking_table,
    plot_radial_profile,
    plot_recommendation_bar,
    plot_signature_matrix,
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
    assert "WGA proxy" in fig.layout.title.text


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
    assert "No ranking data" in fig.layout.annotations[0].text


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
    assert "Select a gene" in fig.layout.annotations[0].text


def test_drill_down_heatmap_with_data_renders() -> None:
    fig = plot_drill_down_heatmap(
        {"YAP1": 0.3, "RHOA": 0.5},
        {"YAP1": 0.4, "RHOA": 0.2},
        ["YAP1", "RHOA"],
    )
    assert fig.data[0].type == "heatmap"
    assert list(fig.data[0].y) == [
        "STRING functional-association prior",
        "Geneformer sensitivity prior",
    ]


def test_panel_summary_uses_reachable_target_count() -> None:
    fig = plot_panel_summary(
        [
            {
                "gene": "CD44",
                "pathway_rank": 1,
                "pathway_score": 0.9,
                "reachable_signature_targets": 2,
                "gene_class": "HA/CD44 axis",
            },
            {
                "gene": "SDC4",
                "pathway_rank": 2,
                "pathway_score": 0.8,
                "reachable_signature_targets": 4,
                "gene_class": "HSPG core proteins",
            },
        ],
        ["YAP1", "WWTR1", "CTGF", "CYR61"],
    )
    marker_traces = [trace for trace in fig.data if trace.mode == "markers"]
    assert marker_traces
    sizes = [size for trace in marker_traces for size in trace.marker.size]
    assert max(sizes) > min(sizes)
    assert "Degree-matched null correction" in fig.layout.annotations[0].text


def test_signature_matrix_marks_unreachable() -> None:
    fig = plot_signature_matrix(
        [
            {
                "gene": "CD44",
                "pathway_rank": 1,
                "pathway_score": 0.9,
                "per_target_scores": {"YAP1": 0.5, "WWTR1": 0.0},
            }
        ],
        ["YAP1", "WWTR1"],
        {"CD44": {"YAP1": {"distance": 0.2, "path": ["CD44", "YAP1"]}}},
    )
    heatmap = fig.data[0]
    assert heatmap.type == "heatmap"
    assert "unreachable" in heatmap.text[0]


def test_pathway_network_uses_no_arrowheads_or_arrow_paths() -> None:
    fig = plot_pathway_network(
        "CD44",
        {
            "YAP1": {
                "path": ["CD44", "ITGB1", "YAP1"],
                "path_edges": [
                    {"from": "CD44", "to": "ITGB1", "confidence": 0.9, "source": "string"},
                    {"from": "ITGB1", "to": "YAP1", "confidence": 0.8, "source": "string"},
                ],
            }
        },
        ["YAP1"],
        selected_target="YAP1",
    )
    assert all(getattr(trace, "mode", "") != "markers+text" or "->" not in "".join(trace.text or []) for trace in fig.data)
    assert "not causal direction" in fig.layout.annotations[0].text


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
