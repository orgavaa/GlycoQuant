"""Plotly figure factories for cross-modal prediction results."""
from __future__ import annotations

import numpy as np
import plotly.graph_objects as go


def _display_feature_name(name: str) -> str:
    return (
        name
        .replace("glycocalyx_pericellular_ratio", "WGA proxy pericellular ratio")
        .replace("glycocalyx_", "WGA proxy ")
        .replace("mechano_score", "mechanophenotype prototype score")
        .replace("mechano_", "mechanophenotype ")
        .replace("yap_", "YAP ")
        .replace("fa_", "FA ")
        .replace("actin_", "actin ")
        .replace("nuclear_", "nuclear ")
        .replace("cell_", "cell ")
        .replace("_", " ")
    )


def plot_cross_modal_r2(
    per_target_r2: dict[str, float],
    direction: str,
) -> go.Figure:
    """Horizontal bar chart of per-target R² values."""
    sorted_items = sorted(per_target_r2.items(), key=lambda x: x[1], reverse=True)
    names = [_display_feature_name(k) for k, _ in sorted_items]
    values = [v for _, v in sorted_items]

    colors = ["#059669" if v > 0.3 else "#d97706" if v > 0.1 else "#dc2626" for v in values]

    fig = go.Figure(go.Bar(
        x=values, y=names, orientation="h",
        marker=dict(color=colors),
        text=[f"{v:.3f}" for v in values],
        textposition="outside",
        textfont=dict(size=10),
    ))

    arrow = "\u2192"
    label = f"WGA/glycan {arrow} mechanophenotype prototype" if "glyco_to" in direction else f"mechanophenotype prototype {arrow} WGA/glycan"

    fig.update_layout(
        title=dict(text=label, font=dict(size=12)),
        xaxis=dict(title="R\u00b2 (5-fold CV)", range=[min(0, min(values) - 0.05), max(values) + 0.15]),
        yaxis=dict(autorange="reversed"),
        plot_bgcolor="#fff", paper_bgcolor="#fff",
        font=dict(family="Inter, sans-serif", size=10),
        margin=dict(l=160, r=60, t=30, b=40),
        height=max(200, 28 * len(names)),
    )
    return fig


def plot_predicted_vs_actual(
    actual: list[float],
    predicted: list[float],
    feature_name: str,
    r2: float,
) -> go.Figure:
    """Scatter: predicted vs actual for one target feature."""
    a = np.array(actual)
    p = np.array(predicted)
    display_name = _display_feature_name(feature_name)

    fig = go.Figure()
    fig.add_trace(go.Scatter(
        x=a, y=p, mode="markers",
        marker=dict(size=5, color="#6baed6", opacity=0.6, line=dict(width=0)),
        hovertemplate="Actual: %{x:.3f}<br>Predicted: %{y:.3f}<extra></extra>",
    ))
    # Identity line
    lo = min(a.min(), p.min())
    hi = max(a.max(), p.max())
    fig.add_trace(go.Scatter(
        x=[lo, hi], y=[lo, hi], mode="lines",
        line=dict(dash="dash", color="#9ca3af", width=1),
        hoverinfo="skip", showlegend=False,
    ))

    fig.update_layout(
        xaxis=dict(title=f"Actual {display_name}"),
        yaxis=dict(title=f"Predicted {display_name}"),
        plot_bgcolor="#fff", paper_bgcolor="#fff",
        font=dict(family="Inter, sans-serif", size=11),
        margin=dict(l=60, r=20, t=30, b=50),
        height=300,
        annotations=[dict(
            x=0.05, y=0.95, xref="paper", yref="paper",
            text=f"R\u00b2 = {r2:.3f}", showarrow=False,
            font=dict(size=13, color="#111827"),
            bgcolor="rgba(255,255,255,0.8)", borderpad=4,
        )],
    )
    return fig


def plot_feature_importance(
    importance: dict[str, float],
) -> go.Figure:
    """Horizontal bar of input feature importance (gradient-based)."""
    sorted_items = sorted(importance.items(), key=lambda x: x[1], reverse=True)
    names = [_display_feature_name(k) for k, _ in sorted_items]
    values = [v for _, v in sorted_items]

    fig = go.Figure(go.Bar(
        x=values, y=names, orientation="h",
        marker=dict(color="#6baed6"),
        text=[f"{v:.3f}" for v in values],
        textposition="outside",
        textfont=dict(size=9),
    ))
    fig.update_layout(
        xaxis=dict(title="Gradient importance"),
        yaxis=dict(autorange="reversed"),
        plot_bgcolor="#fff", paper_bgcolor="#fff",
        font=dict(family="Inter, sans-serif", size=10),
        margin=dict(l=160, r=50, t=20, b=40),
        height=max(200, 24 * len(names)),
    )
    return fig
