"""Tests for glycoquant.predictor.pathway_score."""
from __future__ import annotations

import networkx as nx
import numpy as np
import pytest

from glycoquant.predictor import median_inverse_shortest_path


def _build_simple_graph() -> nx.Graph:
    """Tiny synthetic STRING-like graph with known distances.

    Topology (all weights = 1 for easy hand-computation):

        SDC1 — ITGB1 — PTK2 — YAP1
                 |
               RHOA

    So SDC1 to YAP1 has path length 3, SDC1 to RHOA has path length 2.
    """
    g = nx.Graph()
    g.add_edge("SDC1", "ITGB1", weight=1.0, confidence=0.9)
    g.add_edge("ITGB1", "PTK2", weight=1.0, confidence=0.9)
    g.add_edge("PTK2", "YAP1", weight=1.0, confidence=0.9)
    g.add_edge("ITGB1", "RHOA", weight=1.0, confidence=0.8)
    return g


def test_returns_tuple_of_score_and_details() -> None:
    g = _build_simple_graph()
    score, details = median_inverse_shortest_path(g, "SDC1", ["YAP1", "RHOA"])
    assert isinstance(score, float)
    assert isinstance(details, dict)
    assert set(details.keys()) == {"YAP1", "RHOA"}


def test_distances_match_expected_topology() -> None:
    g = _build_simple_graph()
    _, details = median_inverse_shortest_path(g, "SDC1", ["YAP1", "RHOA"])
    assert details["YAP1"]["distance"] == pytest.approx(3.0)
    assert details["RHOA"]["distance"] == pytest.approx(2.0)
    assert details["YAP1"]["path"] == ["SDC1", "ITGB1", "PTK2", "YAP1"]
    assert details["RHOA"]["path"] == ["SDC1", "ITGB1", "RHOA"]


def test_median_score_matches_manual_computation() -> None:
    g = _build_simple_graph()
    score, _ = median_inverse_shortest_path(g, "SDC1", ["YAP1", "RHOA"])
    # inverses: 1/(1+3) = 0.25, 1/(1+2) ≈ 0.333
    # median = (0.25 + 0.333) / 2 ≈ 0.2917
    expected = float(np.median([0.25, 1.0 / 3.0]))
    assert score == pytest.approx(expected, rel=1e-6)


def test_unreachable_target_has_inverse_zero() -> None:
    g = _build_simple_graph()
    # Add an isolated node
    g.add_node("B4GALT1")
    _, details = median_inverse_shortest_path(g, "SDC1", ["B4GALT1"])
    assert details["B4GALT1"]["distance"] is None
    assert details["B4GALT1"]["inverse"] == 0.0
    assert details["B4GALT1"]["path"] == []


def test_missing_source_node_returns_zero_inverses() -> None:
    g = _build_simple_graph()
    score, details = median_inverse_shortest_path(g, "NONEXISTENT", ["YAP1"])
    assert score == 0.0
    assert details["YAP1"]["inverse"] == 0.0


def test_source_equals_target_gives_full_score() -> None:
    g = _build_simple_graph()
    _, details = median_inverse_shortest_path(g, "SDC1", ["SDC1"])
    assert details["SDC1"]["distance"] == 0.0
    assert details["SDC1"]["inverse"] == 1.0


def test_empty_target_list() -> None:
    g = _build_simple_graph()
    score, details = median_inverse_shortest_path(g, "SDC1", [])
    assert score == 0.0
    assert details == {}


def test_median_over_mixed_finite_and_infinite() -> None:
    """When some targets are unreachable, the median is still well-defined."""
    g = _build_simple_graph()
    g.add_node("ISOLATED")
    score, _ = median_inverse_shortest_path(
        g, "SDC1", ["YAP1", "RHOA", "ISOLATED"]
    )
    # inverses: 0.25, 0.333, 0.0 → median = 0.25
    assert score == pytest.approx(0.25, rel=1e-6)


def test_weighted_edges_influence_distance() -> None:
    """Dijkstra should respect non-uniform edge weights."""
    g = nx.Graph()
    g.add_edge("A", "B", weight=0.1, confidence=0.95)
    g.add_edge("A", "C", weight=5.0, confidence=0.5)
    g.add_edge("B", "C", weight=0.1, confidence=0.95)
    _, details = median_inverse_shortest_path(g, "A", ["C"])
    # Short path via B: 0.1 + 0.1 = 0.2; direct: 5.0. Dijkstra picks 0.2.
    assert details["C"]["distance"] == pytest.approx(0.2)
    assert details["C"]["path"] == ["A", "B", "C"]
