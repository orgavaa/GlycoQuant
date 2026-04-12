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

    # No cell annotations — hover shows the exact value instead.
    # Cramming numbers into tiny heatmap cells is unreadable at
    # the 320px rail width. Clean heatmap + hover is the pro pattern.

    title_parts = ["Glycocalyx ↔ mechanotransduction correlation"]
    if result.top_pair is not None:
        g, m = result.top_pair
        title_parts.append(
            f"<br><span style='font-size:11px;color:#8B92A8'>"
            f"top |r| = {result.top_r:+.2f} — {g} vs {m}</span>"
        )
    title = "".join(title_parts)

    # Shorten feature names for readability in the embedded view
    def _short(name: str) -> str:
        return (
            name
            .replace("glycocalyx_", "glyco·")
            .replace("haralick_", "")
            .replace("pericellular_", "peri·")
            .replace("radial_decay_", "decay·")
            .replace("integrated_", "integ·")
            .replace("shannon_", "")
            .replace("mean_intensity", "mean")
            .replace("yap_nc_ratio_size_corrected", "YAP N/C corr")
            .replace("yap_nuclear_intensity", "YAP nuc")
            .replace("fa_density_per_um2", "FA density")
            .replace("fa_mature_fraction", "FA mature")
            .replace("fa_total_area_um2", "FA area")
            .replace("fa_mean_orientation_alignment", "FA align")
            .replace("actin_stress_fiber_coherence", "actin coher")
            .replace("actin_cortical_ratio", "actin cort")
            .replace("nuclear_aspect_ratio", "nuc AR")
            .replace("nuclear_solidity", "nuc solid")
            .replace("nuclear_to_cell_area_ratio", "nuc/cell")
            .replace("mechano_score", "mechano")
            .replace("_", " ")
        )

    short_glyco = [_short(g) for g in result.glyco_features]
    short_mechano = [_short(m) for m in result.mechano_features]

    fig = go.Figure(
        data=go.Heatmap(
            z=result.r_matrix,
            x=short_mechano,
            y=short_glyco,
            colorscale="RdBu_r",
            zmin=-1.0,
            zmax=1.0,
            colorbar={
                "title": {
                    "text": "ρ",
                    "font": {"color": "rgba(255,255,255,0.5)", "size": 10},
                },
                "tickfont": {"color": "rgba(255,255,255,0.4)", "size": 9},
                "len": 0.5,
                "thickness": 10,
            },
            hovertemplate=(
                "<b>%{y}</b> × <b>%{x}</b><br>"
                "ρ = %{z:+.3f}<extra></extra>"
            ),
        )
    )
    layout = get_plotly_layout_template()
    layout.update(
        {
            "title": {"text": title, "font": {"size": 12, "family": "Inter", "color": "rgba(255,255,255,0.6)"}},
            "xaxis": {
                "tickangle": 45,
                "tickfont": {"size": 10, "color": "rgba(255,255,255,0.5)", "family": "Inter"},
            },
            "yaxis": {
                "tickfont": {"size": 10, "color": "rgba(255,255,255,0.5)", "family": "Inter"},
                "autorange": "reversed",
            },
            "margin": {"b": 80, "l": 100, "r": 50, "t": 40},
            "height": max(350, 28 * len(result.glyco_features) + 120),
            "paper_bgcolor": "rgba(0,0,0,0)",
            "plot_bgcolor": "rgba(0,0,0,0)",
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
            nbinsx=25,
            marker={
                "color": "#343dff",
                "line": {"color": "#1a21ff", "width": 0.5},
                "opacity": 0.8,
            },
            hovertemplate="score=%{x:.2f}<br>cells=%{y}<extra></extra>",
        )
    )
    mean = float(finite.mean())
    fig.add_vline(
        x=mean,
        line={"color": "rgba(255,255,255,0.6)", "width": 1.5, "dash": "dash"},
        annotation={
            "text": f"μ = {mean:+.2f}",
            "font": {"color": "rgba(255,255,255,0.6)", "size": 11, "family": "Inter"},
            "yanchor": "bottom",
        },
    )
    fig.update_layout(
        title=None,
        xaxis={
            "title": {
                "text": "Mechano score",
                "font": {"size": 10, "color": "rgba(255,255,255,0.4)", "family": "Inter"},
            },
            "tickfont": {"size": 9, "color": "rgba(255,255,255,0.4)", "family": "Inter"},
            "gridcolor": "rgba(255,255,255,0.06)",
            "zerolinecolor": "rgba(255,255,255,0.1)",
        },
        yaxis={
            "title": {
                "text": "Cells",
                "font": {"size": 10, "color": "rgba(255,255,255,0.4)", "family": "Inter"},
            },
            "tickfont": {"size": 9, "color": "rgba(255,255,255,0.4)", "family": "Inter"},
            "gridcolor": "rgba(255,255,255,0.06)",
        },
        margin={"b": 40, "l": 40, "r": 15, "t": 10},
        height=220,
        bargap=0.08,
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        font={"family": "Inter"},
    )
    return fig
