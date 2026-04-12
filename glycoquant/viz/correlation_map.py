"""Plotly feature correlation heatmap for Tab 1."""
from __future__ import annotations

import numpy as np
import pandas as pd
import plotly.graph_objects as go


def _short_label(name: str) -> str:
    """Shorten long feature names for readability in the heatmap."""
    return (
        name
        .replace("glycocalyx_", "glyco·")
        .replace("haralick_", "")
        .replace("pericellular_", "peri·")
        .replace("integrated_", "integ·")
        .replace("shannon_", "")
        .replace("mean_intensity", "mean")
        .replace("yap_nc_ratio_size_corrected", "YAP corr")
        .replace("yap_nuclear_intensity", "YAP nuc")
        .replace("yap_cytoplasmic_intensity", "YAP cyto")
        .replace("yap_nc_ratio", "YAP raw")
        .replace("yap_nuclear_fraction", "YAP frac")
        .replace("fa_density_per_um2", "FA dens")
        .replace("fa_mature_fraction", "FA mat")
        .replace("fa_total_area", "FA area")
        .replace("fa_mean_area", "FA μ area")
        .replace("fa_mean_elongation", "FA elong")
        .replace("fa_mean_orientation_alignment", "FA align")
        .replace("fa_mean_distance_to_edge", "FA edge")
        .replace("fa_peripheral_fraction", "FA periph")
        .replace("fa_count", "FA n")
        .replace("fa_nascent_count", "FA nasc")
        .replace("fa_focal_complex_count", "FA FC")
        .replace("fa_mature_count", "FA mat n")
        .replace("fa_fibrillar_count", "FA fib")
        .replace("actin_stress_fiber_coherence", "actin coher")
        .replace("actin_cortical_ratio", "actin cort")
        .replace("actin_dominant_orientation", "actin orient")
        .replace("actin_mean_intensity", "actin mean")
        .replace("nuclear_aspect_ratio", "nuc AR")
        .replace("nuclear_solidity", "nuc solid")
        .replace("nuclear_circularity", "nuc circ")
        .replace("nuclear_eccentricity", "nuc ecc")
        .replace("nuclear_perimeter", "nuc perim")
        .replace("nuclear_area", "nuc area")
        .replace("nuclear_to_cell_area_ratio", "nuc/cell")
        .replace("cell_area", "cell area")
        .replace("cell_perimeter", "cell perim")
        .replace("cell_circularity", "cell circ")
        .replace("cell_aspect_ratio", "cell AR")
        .replace("cell_solidity", "cell solid")
        .replace("cell_spread_area", "cell spread")
        .replace("mechano_score", "mechano")
        .replace("_", " ")
    )


def plot_correlation_map(
    df: pd.DataFrame,
    title: str = "All-feature correlation",
    method: str = "pearson",
) -> go.Figure:
    """Correlation heatmap across numeric feature columns."""
    numeric_df = df.select_dtypes(include=[np.number])
    if numeric_df.shape[1] < 2:
        raise ValueError("need at least 2 numeric columns for a correlation heatmap")

    corr = numeric_df.corr(method=method).values
    labels = [_short_label(c) for c in numeric_df.columns.tolist()]

    fig = go.Figure(
        data=go.Heatmap(
            z=corr,
            x=labels,
            y=labels,
            colorscale="RdBu_r",
            zmin=-1.0,
            zmax=1.0,
            colorbar={
                "title": {
                    "text": "r",
                    "font": {"color": "#566164", "size": 11},
                },
                "tickfont": {"color": "#566164", "size": 10},
                "len": 0.6,
            },
            hovertemplate="<b>%{y}</b> × <b>%{x}</b><br>r = %{z:+.3f}<extra></extra>",
        )
    )
    fig.update_layout(
        title={"text": title, "font": {"size": 13, "family": "Inter"}},
        xaxis={
            "tickangle": 45,
            "tickfont": {"size": 10, "color": "#2a3437", "family": "Inter"},
        },
        yaxis={
            "tickfont": {"size": 10, "color": "#2a3437", "family": "Inter"},
        },
        margin={"b": 100, "l": 100, "r": 40, "t": 50},
        height=max(450, 18 * len(labels) + 200),
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        font={"family": "Inter"},
    )
    return fig
