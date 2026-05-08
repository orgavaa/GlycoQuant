"""Plotly radial profile visualization for Tab 1."""
from __future__ import annotations

import numpy as np
import plotly.graph_objects as go

from glycoquant.theme import PALETTE, get_plotly_layout_template


def plot_radial_profile(
    profiles: np.ndarray,
    title: str = "WGA pericellular radial profile",
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
            fillcolor="rgba(0, 224, 184, 0.15)",
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
            line={"color": PALETTE.accent_brand, "width": 2.5},
            marker={"size": 7, "color": PALETTE.accent_brand, "line": {"color": PALETTE.bg_base, "width": 1}},
            name=f"Mean (n={n_cells})",
        )
    )
    layout = get_plotly_layout_template()
    layout.update(
        {
            "title": title,
            "xaxis_title": "Radial bin (center → pericellular edge)",
            "yaxis_title": "Intensity",
            "showlegend": True,
            "height": 400,
        }
    )
    fig.update_layout(**layout)
    return fig
