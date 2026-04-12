"""Headline Tab 1 figure: glycocalyx ↔ mechanotransduction correlation matrix.

This is the central PhD-novelty deliverable. The existing
``correlation_map`` shows a square Pearson matrix over *all*
features, which buries the cross-block signal in a sea of within-
block correlations. This module instead computes only the
**rectangular cross-block** correlation between glycocalyx features
(rows) and mechanotransduction features (columns), at the single-
cell level — a measurement that no published study has reported
(Paszek 2014, Möckl 2019, Barai 2024 PNAS Nexus, Hamrangsekachaee
2025 ACS Biomater. Sci. Eng. all stop at population-level
comparisons across conditions).

Spearman is the default correlation method because the underlying
relationships (e.g. WGA texture vs YAP N/C) are not necessarily
linear and rank correlation is robust to the heavy-tailed
distributions typical of fluorescence intensity readouts.

Multiple-comparison correction uses Bonferroni over the total
number of cells in the rectangular matrix; significance markers
are surfaced as a star annotation on each cell.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
import pandas as pd
import plotly.graph_objects as go
from scipy.stats import spearmanr

from glycoquant.theme import get_plotly_layout_template

# Glycocalyx feature columns this figure considers (any subset that
# the input DataFrame actually contains is plotted; missing columns
# are silently dropped). Order matches the conceptual progression:
# bulk intensity → distribution shape → texture → spatial autocorr.
GLYCO_COLUMNS: tuple[str, ...] = (
    "glycocalyx_mean_intensity",
    "glycocalyx_integrated_intensity",
    "glycocalyx_pericellular_ratio",
    "glycocalyx_coverage",
    "glycocalyx_heterogeneity",
    "glycocalyx_shannon_entropy",
    "glycocalyx_radial_decay_rate",
    "glycocalyx_haralick_contrast",
    "glycocalyx_haralick_homogeneity",
    "glycocalyx_haralick_correlation",
    "glycocalyx_haralick_energy",
    "glycocalyx_moran_i",
)

# Mechanotransduction feature columns. Order matches the
# canonical mechano-axis from upstream sensing (FA) to downstream
# transcription (YAP).
MECHANO_COLUMNS: tuple[str, ...] = (
    "mechano_score",
    "yap_nc_ratio_size_corrected",
    "yap_nuclear_intensity",
    "fa_density_per_um2",
    "fa_mature_fraction",
    "fa_total_area_um2",
    "fa_mean_orientation_alignment",
    "actin_stress_fiber_coherence",
    "actin_cortical_ratio",
    "nuclear_aspect_ratio",
    "nuclear_solidity",
    "nuclear_to_cell_area_ratio",
)


@dataclass(frozen=True)
class GlycoMechanoCorrelation:
    """Result bundle returned alongside the figure.

    Carries the matrices the backend exports as part of
    ``mechano_score_summary`` (top correlation surfaced to the UI as
    a hero metric).
    """

    glyco_features: list[str]
    mechano_features: list[str]
    r_matrix: np.ndarray  # shape (n_glyco, n_mechano)
    p_matrix: np.ndarray  # shape (n_glyco, n_mechano)
    top_r: float
    top_pair: tuple[str, str] | None


def compute_glyco_mechano_correlation(
    df: pd.DataFrame,
    method: str = "spearman",
) -> GlycoMechanoCorrelation:
    """Compute the rectangular cross-block correlation matrix.

    Pairs with fewer than 5 finite cells in either column are set
    to NaN — too few to estimate correlation reliably even at the
    Spearman rank level.
    """
    glyco_cols = [c for c in GLYCO_COLUMNS if c in df.columns]
    mechano_cols = [c for c in MECHANO_COLUMNS if c in df.columns]

    n_glyco = len(glyco_cols)
    n_mechano = len(mechano_cols)
    r_matrix = np.full((n_glyco, n_mechano), np.nan, dtype=np.float64)
    p_matrix = np.full((n_glyco, n_mechano), np.nan, dtype=np.float64)

    for i, g in enumerate(glyco_cols):
        for j, m in enumerate(mechano_cols):
            xs = df[g].to_numpy(dtype=np.float64)
            ys = df[m].to_numpy(dtype=np.float64)
            mask = np.isfinite(xs) & np.isfinite(ys)
            if int(mask.sum()) < 5:
                continue
            x = xs[mask]
            y = ys[mask]
            # Skip when either column is constant — correlation is
            # undefined and scipy emits a warning.
            if np.ptp(x) == 0 or np.ptp(y) == 0:
                continue
            try:
                if method == "spearman":
                    res = spearmanr(x, y)
                    r = float(res.correlation)
                    p = float(res.pvalue)
                else:
                    # Pearson fallback. We don't expose Kendall — too
                    # slow at typical cell counts.
                    r = float(np.corrcoef(x, y)[0, 1])
                    p = math.nan
            except (ValueError, ZeroDivisionError):
                continue
            r_matrix[i, j] = r
            p_matrix[i, j] = p

    # Top |r| pair across the rectangular matrix.
    top_r = 0.0
    top_pair: tuple[str, str] | None = None
    for i in range(n_glyco):
        for j in range(n_mechano):
            r = r_matrix[i, j]
            if np.isfinite(r) and abs(r) > abs(top_r):
                top_r = r
                top_pair = (glyco_cols[i], mechano_cols[j])

    return GlycoMechanoCorrelation(
        glyco_features=glyco_cols,
        mechano_features=mechano_cols,
        r_matrix=r_matrix,
        p_matrix=p_matrix,
        top_r=top_r,
        top_pair=top_pair,
    )


def plot_glyco_mechano_correlation(
    df: pd.DataFrame,
    method: str = "spearman",
) -> tuple[go.Figure, GlycoMechanoCorrelation]:
    """Build the headline cross-block correlation heatmap.

    Returns
    -------
    (go.Figure, GlycoMechanoCorrelation)
        The Plotly figure ready to serialise via ``.to_json()``, and
        the computed correlation bundle (so callers can populate the
        ``mechano_score_summary.top_correlation_*`` fields without
        re-walking the matrix).
    """
    result = compute_glyco_mechano_correlation(df, method=method)

    n_pairs = max(
        1,
        int(np.isfinite(result.r_matrix).sum()),
    )
    sig_threshold = 0.05 / n_pairs  # Bonferroni
    annotations: list[dict] = []
    if result.r_matrix.size > 0:
        for i, g in enumerate(result.glyco_features):
            for j, m in enumerate(result.mechano_features):
                r = result.r_matrix[i, j]
                p = result.p_matrix[i, j]
                if not np.isfinite(r):
                    continue
                star = "*" if np.isfinite(p) and p < sig_threshold else ""
                annotations.append(
                    {
                        "x": m,
                        "y": g,
                        "text": f"{r:+.2f}{star}",
                        "showarrow": False,
                        "font": {
                            "size": 9,
                            "color": "#FFFFFF" if abs(r) > 0.5 else "#1F2437",
                        },
                    }
                )

    title_parts = ["Glycocalyx ↔ mechanotransduction correlation"]
    if result.top_pair is not None:
        g, m = result.top_pair
        title_parts.append(
            f"<br><span style='font-size:11px;color:#8B92A8'>"
            f"top |r| = {result.top_r:+.2f} — {g} vs {m}</span>"
        )
    title = "".join(title_parts)

    fig = go.Figure(
        data=go.Heatmap(
            z=result.r_matrix,
            x=list(result.mechano_features),
            y=list(result.glyco_features),
            colorscale="RdBu_r",
            zmin=-1.0,
            zmax=1.0,
            colorbar={
                "title": {
                    "text": f"{method.capitalize()[:1]} ρ",
                    "font": {"color": "#8B92A8", "size": 10},
                },
                "tickfont": {"color": "#8B92A8", "size": 9},
                "outlinecolor": "#1F2437",
                "outlinewidth": 1,
            },
            hovertemplate=(
                "Glyco: %{y}<br>"
                "Mechano: %{x}<br>"
                "ρ = %{z:+.3f}<extra></extra>"
            ),
        )
    )
    layout = get_plotly_layout_template()
    layout.update(
        {
            "title": {"text": title, "font": {"size": 14}},
            "xaxis": {
                "tickangle": 45,
                "tickfont": {"size": 9, "color": "#8B92A8"},
                "title": {
                    "text": "Mechanotransduction features",
                    "font": {"size": 11, "color": "#8B92A8"},
                },
            },
            "yaxis": {
                "tickfont": {"size": 9, "color": "#8B92A8"},
                "title": {
                    "text": "Glycocalyx features",
                    "font": {"size": 11, "color": "#8B92A8"},
                },
                "autorange": "reversed",
            },
            "margin": {"b": 140, "l": 200, "r": 40, "t": 70},
            "height": max(420, 28 * len(result.glyco_features) + 200),
            "annotations": annotations,
        }
    )
    fig.update_layout(**layout)
    return fig, result


def plot_mechano_score_distribution(
    df: pd.DataFrame,
    column: str = "mechano_score",
) -> go.Figure:
    """Histogram of the per-cell composite mechanotransduction score.

    Drawn as a 30-bin histogram with a vertical mean line. Returns
    an empty figure if the column is missing or all-NaN — the
    backend treats both cases as "no score available".
    """
    if column not in df.columns:
        return go.Figure()
    values = df[column].to_numpy(dtype=np.float64)
    finite = values[np.isfinite(values)]
    if finite.size == 0:
        return go.Figure()

    fig = go.Figure(
        data=go.Histogram(
            x=finite,
            nbinsx=30,
            marker={
                "color": "#00E0B8",
                "line": {"color": "#0A8B73", "width": 1},
            },
            hovertemplate="score=%{x:.2f}<br>cells=%{y}<extra></extra>",
        )
    )
    mean = float(finite.mean())
    fig.add_vline(
        x=mean,
        line={"color": "#FFFFFF", "width": 2, "dash": "dash"},
        annotation={
            "text": f"mean = {mean:+.2f}",
            "font": {"color": "#FFFFFF", "size": 11},
            "yanchor": "bottom",
        },
    )
    layout = get_plotly_layout_template()
    layout.update(
        {
            "title": {
                "text": "Per-cell mechanotransduction score distribution",
                "font": {"size": 14},
            },
            "xaxis": {
                "title": {
                    "text": "Composite mechano score (PC1 z-score)",
                    "font": {"size": 11, "color": "#8B92A8"},
                },
                "tickfont": {"size": 9, "color": "#8B92A8"},
            },
            "yaxis": {
                "title": {
                    "text": "Cell count",
                    "font": {"size": 11, "color": "#8B92A8"},
                },
                "tickfont": {"size": 9, "color": "#8B92A8"},
            },
            "margin": {"b": 60, "l": 60, "r": 40, "t": 60},
            "height": 320,
            "bargap": 0.05,
        }
    )
    fig.update_layout(**layout)
    return fig
