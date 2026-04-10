"""Plotly feature correlation heatmap for Tab 1."""
from __future__ import annotations

import numpy as np
import pandas as pd
import plotly.graph_objects as go


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
            colorscale="RdBu_r",
            zmin=-1.0,
            zmax=1.0,
            colorbar={"title": method.capitalize()[:1] + " corr"},
        )
    )
    fig.update_layout(
        title=title,
        template="plotly_white",
        xaxis={"tickangle": 45, "tickfont": {"size": 9}},
        yaxis={"tickfont": {"size": 9}},
        margin={"b": 120, "l": 120},
    )
    return fig
