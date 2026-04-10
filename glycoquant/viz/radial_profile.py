"""Plotly radial profile visualization for Tab 1."""
from __future__ import annotations

import numpy as np
import plotly.graph_objects as go


def plot_radial_profile(
    profiles: np.ndarray,
    title: str = "Glycocalyx radial profile",
) -> go.Figure:
    """Mean ± std radial intensity across cells.

    Parameters
    ----------
    profiles : np.ndarray
        2D array of shape ``(n_cells, n_bins)``; each row is one cell's
        ``glycocalyx_radial_profile`` from the feature extractor.
    title : str
        Plot title.

    Returns
    -------
    go.Figure
        Plotly figure with three traces: upper std band, lower std band
        (fills to upper), and the mean line.
    """
    if profiles.ndim != 2:
        raise ValueError(f"expected 2D array (n_cells, n_bins), got shape {profiles.shape}")
    if profiles.shape[0] == 0:
        raise ValueError("profiles must contain at least one cell")

    n_cells, n_bins = profiles.shape
    x = np.arange(n_bins)
    mean = profiles.mean(axis=0)
    std = profiles.std(axis=0)

    fig = go.Figure()
    fig.add_trace(
        go.Scatter(
            x=x,
            y=mean + std,
            mode="lines",
            line={"width": 0},
            showlegend=False,
            hoverinfo="skip",
            name="upper",
        )
    )
    fig.add_trace(
        go.Scatter(
            x=x,
            y=mean - std,
            mode="lines",
            line={"width": 0},
            fill="tonexty",
            fillcolor="rgba(46, 117, 182, 0.2)",
            showlegend=False,
            hoverinfo="skip",
            name="lower",
        )
    )
    fig.add_trace(
        go.Scatter(
            x=x,
            y=mean,
            mode="lines+markers",
            line={"color": "#2E75B6", "width": 2},
            marker={"size": 6},
            name=f"Mean (n={n_cells})",
        )
    )
    fig.update_layout(
        title=title,
        xaxis_title="Radial bin (center → pericellular edge)",
        yaxis_title="Intensity",
        template="plotly_white",
        showlegend=True,
    )
    return fig
