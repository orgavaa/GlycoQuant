"""Plotly figure factories for the spatial GNN results."""
from __future__ import annotations

import numpy as np
import plotly.graph_objects as go


def plot_spatial_graph(
    centroids: list[list[float]],
    edge_index: list[list[int]],
    node_values: list[float],
    cell_ids: list[int],
    value_label: str = "Mechano (spatial)",
) -> go.Figure:
    """Delaunay graph with nodes colored by predicted mechano score."""
    pts = np.array(centroids)
    vals = np.array(node_values)
    ids = np.array(cell_ids)

    fig = go.Figure()

    # Edges as a single trace with None separators
    edge_x: list[float | None] = []
    edge_y: list[float | None] = []
    for src, tgt in edge_index:
        if src < len(pts) and tgt < len(pts):
            edge_x += [pts[src, 0], pts[tgt, 0], None]
            edge_y += [pts[src, 1], pts[tgt, 1], None]

    fig.add_trace(go.Scatter(
        x=edge_x, y=edge_y, mode="lines",
        line=dict(width=0.5, color="rgba(180,180,180,0.3)"),
        hoverinfo="skip", showlegend=False,
    ))

    # Nodes
    vabs = max(abs(vals.min()), abs(vals.max()), 0.01)
    fig.add_trace(go.Scatter(
        x=pts[:, 0], y=pts[:, 1], mode="markers",
        marker=dict(
            size=8, color=vals, colorscale="RdBu_r",
            cmin=-vabs, cmax=vabs,
            colorbar=dict(title=value_label, thickness=12, len=0.6),
            line=dict(width=0.5, color="white"),
        ),
        customdata=np.stack([ids, vals], axis=1),
        hovertemplate="Cell %{customdata[0]:.0f}<br>" + value_label + ": %{customdata[1]:.3f}<extra></extra>",
    ))

    fig.update_layout(
        xaxis=dict(title="x (px)", showgrid=False),
        yaxis=dict(title="y (px)", showgrid=False, autorange="reversed"),
        plot_bgcolor="#fff", paper_bgcolor="#fff",
        font=dict(family="Inter, sans-serif", size=11),
        margin=dict(l=50, r=20, t=20, b=50),
        height=400,
    )
    return fig


def plot_feature_importance(
    importance: dict[str, float],
    title: str = "GNN feature importance",
) -> go.Figure:
    """Horizontal bar chart of node-feature importance."""
    sorted_items = sorted(importance.items(), key=lambda x: x[1], reverse=True)
    names = [k for k, _ in sorted_items]
    values = [v for _, v in sorted_items]

    fig = go.Figure(go.Bar(
        x=values, y=names, orientation="h",
        marker=dict(color="#6baed6"),
    ))
    fig.update_layout(
        xaxis=dict(title="Relative importance"),
        yaxis=dict(autorange="reversed"),
        plot_bgcolor="#fff", paper_bgcolor="#fff",
        font=dict(family="Inter, sans-serif", size=10),
        margin=dict(l=140, r=20, t=20, b=40),
        height=max(200, 24 * len(names)),
    )
    return fig
