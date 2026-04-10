"""Plotly dual-prior ranking table for Tab 2 (Phase 6 target).

This module provides the **factory stubs** that Phase 6 fills in: the
signatures and placeholder figures are defined now so Tab 2's shell can
import from a stable location and the layout skeleton is fixed before
the Geneformer + STRING priors land.
"""
from __future__ import annotations

import pandas as pd
import plotly.graph_objects as go


def plot_prior_ranking_table(
    ranking_df: pd.DataFrame | None = None,
    title: str = "Perturbation prioritization",
) -> go.Figure:
    """Dual-prior ranking table with a divergence column.

    Parameters
    ----------
    ranking_df : pd.DataFrame, optional
        Expected columns (Phase 6): ``gene``, ``geneformer_rank``,
        ``geneformer_score``, ``pathway_rank``, ``pathway_score``,
        ``abs_rank_divergence``. If ``None``, returns a placeholder
        figure annotated with "Phase 6".
    title : str

    Returns
    -------
    go.Figure
        Plotly ``Table`` figure.
    """
    if ranking_df is None:
        return _placeholder("Dual-prior ranking — Phase 6")

    required = {
        "gene",
        "geneformer_rank",
        "geneformer_score",
        "pathway_rank",
        "pathway_score",
        "abs_rank_divergence",
    }
    missing = required - set(ranking_df.columns)
    if missing:
        raise ValueError(f"ranking_df missing required columns: {sorted(missing)}")

    fig = go.Figure(
        data=[
            go.Table(
                header={
                    "values": [
                        "Gene",
                        "Geneformer rank",
                        "Geneformer score",
                        "Pathway rank",
                        "Pathway score",
                        "|ΔRank|",
                    ],
                    "align": "left",
                    "fill_color": "#f0f0f0",
                },
                cells={
                    "values": [
                        ranking_df["gene"],
                        ranking_df["geneformer_rank"],
                        ranking_df["geneformer_score"].round(3),
                        ranking_df["pathway_rank"],
                        ranking_df["pathway_score"].round(3),
                        ranking_df["abs_rank_divergence"],
                    ],
                    "align": "left",
                },
            )
        ]
    )
    fig.update_layout(title=title, template="plotly_white")
    return fig


def plot_drill_down_heatmap(
    geneformer_row: dict[str, float] | None = None,
    pathway_row: dict[str, float] | None = None,
    mechano_genes: list[str] | None = None,
    title: str = "Per-mechano-gene scores",
) -> go.Figure:
    """Side-by-side 1×N heatmap of Geneformer vs pathway scores for one gene.

    Returns a placeholder figure until Phase 6 wires in real data.
    """
    if geneformer_row is None or pathway_row is None or mechano_genes is None:
        return _placeholder("Drill-down heatmap — Phase 6")

    z = [
        [geneformer_row.get(g, 0.0) for g in mechano_genes],
        [pathway_row.get(g, 0.0) for g in mechano_genes],
    ]
    fig = go.Figure(
        data=go.Heatmap(
            z=z,
            x=mechano_genes,
            y=["Geneformer", "Pathway"],
            colorscale="Viridis",
            colorbar={"title": "Score"},
        )
    )
    fig.update_layout(title=title, template="plotly_white")
    return fig


def _placeholder(text: str) -> go.Figure:
    fig = go.Figure()
    fig.add_annotation(
        text=text,
        x=0.5,
        y=0.5,
        xref="paper",
        yref="paper",
        showarrow=False,
        font={"size": 16, "color": "#888"},
    )
    fig.update_layout(
        template="plotly_white",
        xaxis={"visible": False},
        yaxis={"visible": False},
    )
    return fig
