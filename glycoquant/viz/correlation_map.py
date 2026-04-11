"""Plotly feature correlation heatmap for Tab 1."""
from __future__ import annotations

import numpy as np
import pandas as pd
import plotly.graph_objects as go

from glycoquant.theme import get_plotly_layout_template


def plot_correlation_map(
    df: pd.DataFrame,
    title: str = "Feature correlation (Pearson)",
    method: str = "pearson",
) -> go.Figure:
    """Correlation heatmap across numeric feature columns.

    Parameters
    ----------
    df : pd.DataFrame
        Per-cell feature table (e.g. the output of ``ProfileAssembler``).
        Non-numeric columns are ignored.
    title : str
    method : str
        Correlation method, passed through to ``pandas.DataFrame.corr``.
        One of ``"pearson"``, ``"spearman"``, ``"kendall"``.

    Returns
    -------
    go.Figure
        Plotly heatmap with ``zmin=-1``, ``zmax=1``, diverging RdBu_r
        colorscale.

    Raises
    ------
    ValueError
        If fewer than two numeric columns remain after filtering.
    """
    numeric_df = df.select_dtypes(include=[np.number])
    if numeric_df.shape[1] < 2:
        raise ValueError("need at least 2 numeric columns for a correlation heatmap")

    corr = numeric_df.corr(method=method).values
    labels = numeric_df.columns.tolist()

    fig = go.Figure(
        data=go.Heatmap(
            z=corr,
            x=labels,
            y=labels,
            colorscale=[
                [0.0, "#FF6B6B"],  # error red (strong negative)
                [0.5, "#141829"],  # bg surface (zero)
                [1.0, "#00E0B8"],  # brand teal (strong positive)
            ],
            zmin=-1.0,
            zmax=1.0,
            colorbar={
                "title": {
                    "text": method.capitalize()[:1] + " corr",
                    "font": {"color": "#8B92A8", "size": 10},
                },
                "tickfont": {"color": "#8B92A8", "size": 9},
                "outlinecolor": "#1F2437",
                "outlinewidth": 1,
            },
        )
    )
    layout = get_plotly_layout_template()
    layout.update(
        {
            "title": title,
            "xaxis": {"tickangle": 45, "tickfont": {"size": 9, "color": "#8B92A8"}},
            "yaxis": {"tickfont": {"size": 9, "color": "#8B92A8"}},
            "margin": {"b": 120, "l": 120, "r": 40, "t": 50},
            "height": 500,
        }
    )
    fig.update_layout(**layout)
    return fig
