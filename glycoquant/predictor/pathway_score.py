"""Pathway-based perturbation scoring via STRING shortest paths.

For a glycocalyx gene ``g`` and a list of mechanotransduction target
genes ``{m_i}`` the score is the **median inverse shortest-path
length**:

    score(g) = median_{i} ( 1 / (1 + d(g, m_i)) )

where ``d(g, m_i)`` is the Dijkstra shortest path length in the STRING
v12 weighted graph (edge weight = ``-log(confidence)``). The median
aggregation is robust to a single strong link pulling the score, and
the inverse keeps the value in ``[0, 1]`` so it plays well with the
Geneformer prior at the UI level.

This module is pure and unit-testable — no network calls, no I/O. The
Tab 2 data pipeline lives in ``scripts/generate_pathway_priors.py``
which calls these functions against real STRING data.
"""
from __future__ import annotations

import networkx as nx
import numpy as np


def median_inverse_shortest_path(
    graph: nx.Graph,
    source_gene: str,
    target_genes: list[str],
) -> tuple[float, dict[str, dict]]:
    """Compute the median inverse shortest-path score for one source gene.

    Parameters
    ----------
    graph : networkx.Graph
        Weighted graph where nodes are gene symbols and edge ``weight``
        is ``-log(confidence)``. Disconnected components are handled
        gracefully (infinite distance → inverse 0.0).
    source_gene : str
        The glycocalyx gene to score.
    target_genes : list[str]
        The mechanotransduction readout gene list.

    Returns
    -------
    (score, details) : tuple
        ``score`` is the median inverse path length across
        ``target_genes``; ``details`` is a per-target dict with keys
        ``distance`` (or ``None`` for unreachable), ``inverse``, and
        ``path`` (list of gene symbols, empty if unreachable).
    """
    details: dict[str, dict] = {}
    inverses: list[float] = []

    for target in target_genes:
        try:
            dist = nx.dijkstra_path_length(graph, source_gene, target)
            path = list(nx.dijkstra_path(graph, source_gene, target))
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            dist = float("inf")
            path = []

        if not np.isfinite(dist):
            inverse = 0.0
            distance_out: float | None = None
        elif dist == 0.0:
            # source == target edge case
            inverse = 1.0
            distance_out = 0.0
        else:
            inverse = 1.0 / (1.0 + float(dist))
            distance_out = float(dist)

        details[target] = {
            "distance": distance_out,
            "inverse": float(inverse),
            "path": path,
        }
        inverses.append(inverse)

    if not inverses:
        return 0.0, details
    return float(np.median(inverses)), details
