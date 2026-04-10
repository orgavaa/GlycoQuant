"""Plotly experiment recommendation bar chart for Tab 3 (Phase 7 target)."""
from __future__ import annotations

import plotly.graph_objects as go


def plot_recommendation_bar(
    perturbations: list[str] | None = None,
    scores: list[float] | None = None,
    uncertainties: list[float] | None = None,
    mode: str = "exploration",
    title: str = "Recommended next experiments",
) -> go.Figure:
    """Ranked bar chart of GP active-learning recommendations.

    Parameters
    ----------
    perturbations : list[str], optional
        Candidate perturbation names, ordered by descending score.
    scores : list[float], optional
        GP posterior values: uncertainty (exploration mode) or
        predicted effect (exploitation mode).
    uncertainties : list[float], optional
        Error bars (posterior std).
    mode : str
        ``"exploration"`` or ``"exploitation"``.
    title : str

    Returns
    -------
    go.Figure
    """
    if perturbations is None or scores is None:
        return _placeholder("Experiment recommendation — Phase 7")

    if len(perturbations) != len(scores):
        raise ValueError(
            f"perturbations and scores length mismatch: "
            f"{len(perturbations)} vs {len(scores)}"
        )

    color = "#2E75B6" if mode == "exploration" else "#B63D2E"
    error_y = (
        {"type": "data", "array": uncertainties, "visible": True}
        if uncertainties is not None
        else None
    )

    fig = go.Figure(
        data=go.Bar(
            x=perturbations,
            y=scores,
            marker={"color": color},
            error_y=error_y,
        )
    )
    fig.update_layout(
        title=f"{title} ({mode})",
        xaxis_title="Perturbation",
        yaxis_title="GP posterior" if mode == "exploration" else "Predicted effect",
        template="plotly_white",
    )
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
