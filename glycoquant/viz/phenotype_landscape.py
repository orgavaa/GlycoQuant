"""Plotly figure factories for the phenotype discovery UMAP landscape."""
from __future__ import annotations

import numpy as np
import plotly.graph_objects as go


def plot_phenotype_landscape(
    umap_x: list[float],
    umap_y: list[float],
    cluster_labels: list[int],
    cell_ids: list[int],
    color_feature: list[float] | None = None,
    color_label: str = "Cluster",
) -> go.Figure:
    """UMAP scatter colored by Leiden cluster or a continuous feature."""
    x = np.array(umap_x)
    y = np.array(umap_y)
    labels = np.array(cluster_labels)
    ids = np.array(cell_ids)

    valid = np.isfinite(x) & np.isfinite(y)
    x, y, labels, ids = x[valid], y[valid], labels[valid], ids[valid]

    fig = go.Figure()

    if color_feature is not None:
        feat = np.array(color_feature)[valid]
        fig.add_trace(go.Scatter(
            x=x, y=y, mode="markers",
            marker=dict(
                size=6, color=feat, colorscale="Viridis",
                colorbar=dict(title=color_label, thickness=12, len=0.6),
                line=dict(width=0.3, color="white"),
            ),
            customdata=np.stack([ids, labels, feat], axis=1),
            hovertemplate="Cell %{customdata[0]:.0f}<br>Cluster %{customdata[1]:.0f}<br>" + color_label + ": %{customdata[2]:.3f}<extra></extra>",
        ))
    else:
        unique_clusters = sorted(set(labels.tolist()))
        colors = _cluster_palette(len(unique_clusters))
        for i, cid in enumerate(unique_clusters):
            mask = labels == cid
            fig.add_trace(go.Scatter(
                x=x[mask], y=y[mask], mode="markers",
                name=f"Cluster {cid} ({mask.sum()})",
                marker=dict(size=6, color=colors[i % len(colors)], line=dict(width=0.3, color="white")),
                customdata=ids[mask].reshape(-1, 1),
                hovertemplate="Cell %{customdata[0]:.0f}<extra>Cluster " + str(cid) + "</extra>",
            ))

    fig.update_layout(
        xaxis=dict(title="UMAP 1", showgrid=False, zeroline=False),
        yaxis=dict(title="UMAP 2", showgrid=False, zeroline=False),
        plot_bgcolor="#fff",
        paper_bgcolor="#fff",
        font=dict(family="Inter, sans-serif", size=11),
        margin=dict(l=50, r=20, t=30, b=50),
        legend=dict(font=dict(size=10), bgcolor="rgba(255,255,255,0.8)"),
        height=400,
    )
    return fig


def _cluster_palette(n: int) -> list[str]:
    """Colorblind-safe categorical palette (Tableau-10)."""
    T10 = [
        "#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f",
        "#edc948", "#b07aa1", "#ff9da7", "#9c755f", "#bab0ac",
    ]
    return (T10 * ((n // len(T10)) + 1))[:n]
