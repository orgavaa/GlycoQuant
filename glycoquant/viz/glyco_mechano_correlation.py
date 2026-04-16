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

Multiple-comparison correction
------------------------------
Raw p-values from ``scipy.stats.spearmanr`` are corrected with the
Benjamini–Hochberg step-up FDR procedure (Benjamini & Hochberg,
*JRSS-B* 1995) via :func:`scipy.stats.false_discovery_control`
(scipy ≥ 1.11). BH is preferred over Bonferroni for this dense
rectangular screen because many real biological pairs are
expected — Bonferroni's family-wise error control is too
conservative and suppresses genuine effects. Correction is applied
over the flat vector of finite p-values (skipping pairs with <5
cells or constant columns, which remain NaN throughout) and the
resulting q-values are scattered back into a matrix of the same
shape as ``r_matrix``.

Significance markers are rendered as a single (*), double (**), or
triple (***) star annotation at the centre of each heatmap tile,
corresponding to q<0.05, q<0.01, q<0.001 respectively. The subtitle
reports the total count of tiles significant at the FDR α=0.05
threshold so a user can judge at a glance whether the coupling is
sparse (few tiles lit) or broad (many tiles lit).
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
import pandas as pd
import plotly.graph_objects as go
from scipy.stats import false_discovery_control, spearmanr

from glycoquant.theme import get_plotly_layout_template

# FDR α for the cell-level significance tiers in the heatmap. Counted
# tiles in ``n_significant_pairs`` use this threshold; the three-star
# visual tiers use strictly smaller thresholds for stronger evidence.
ALPHA: float = 0.05
# Tiers (threshold, glyph) in descending order of evidence strength.
# The renderer picks the first tier whose threshold is *larger* than
# the tile's q-value, so q=0.0005 → "***", q=0.02 → "*", q=0.1 → no annotation.
_STAR_TIERS: tuple[tuple[float, str], ...] = (
    (0.001, "***"),
    (0.01, "**"),
    (0.05, "*"),
)

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

    Attributes
    ----------
    r_matrix, p_matrix : np.ndarray
        Shape ``(n_glyco, n_mechano)``. NaN entries mark pairs that
        could not be scored (fewer than 5 finite cells, constant
        column, or a scipy exception).
    q_matrix : np.ndarray
        Same shape as ``p_matrix``. Benjamini–Hochberg FDR-adjusted
        q-values over the finite subset of ``p_matrix``. Positions
        corresponding to NaN p-values stay NaN in ``q_matrix``.
    n_significant_pairs : int
        Number of (i, j) tiles with a finite q-value strictly below
        :data:`ALPHA`. Zero when all p-values are NaN.
    top_r, top_pair : float, tuple[str, str] | None
        Strongest absolute correlation and its (glyco, mechano)
        feature names. Kept as a magnitude-based hero metric (not
        q-based) so it is comparable across images with different
        cell counts and hence different FDR cutoffs.
    """

    glyco_features: list[str]
    mechano_features: list[str]
    r_matrix: np.ndarray  # shape (n_glyco, n_mechano)
    p_matrix: np.ndarray  # shape (n_glyco, n_mechano)
    q_matrix: np.ndarray  # shape (n_glyco, n_mechano); BH-FDR adjusted
    n_significant_pairs: int  # count of finite q < ALPHA
    top_r: float
    top_pair: tuple[str, str] | None
    # Provenance of the p-values in ``p_matrix``. ``"parametric"`` uses
    # scipy.stats.spearmanr's analytical null (Fisher-z on the tanh of
    # the sample correlation, valid under the normality-of-ranks
    # approximation); ``"permutation"`` replaces it with an empirical
    # null from :func:`compute_glyco_mechano_correlation`'s
    # ``n_permutations`` shuffles of the mechano column — makes no
    # distributional assumption and is preferred for heavy-tailed
    # fluorescence data.
    null_method: str = "parametric"
    n_permutations: int = 0


def compute_glyco_mechano_correlation(
    df: pd.DataFrame,
    method: str = "spearman",
    n_permutations: int = 0,
    random_state: int = 42,
) -> GlycoMechanoCorrelation:
    """Compute the rectangular cross-block correlation matrix.

    Pairs with fewer than 5 finite cells in either column are set
    to NaN — too few to estimate correlation reliably even at the
    Spearman rank level.

    Parameters
    ----------
    df : pd.DataFrame
        Per-cell features.
    method : str
        ``"spearman"`` (default, robust to heavy tails) or ``"pearson"``.
    n_permutations : int
        When ``> 0`` the parametric p-value from
        :func:`scipy.stats.spearmanr` is replaced with an empirical
        p-value from ``n_permutations`` shuffles of the mechano column.
        The permutation null is preferred for fluorescence intensity
        data whose marginal distributions violate the normality-of-
        ranks assumption behind the analytical Spearman null. The
        adjusted empirical p is ``(k + 1) / (N + 1)`` where ``k`` is
        the count of permuted |ρ| that equal or exceed the observed
        |ρ| — the standard small-sample correction (Phipson & Smyth
        2010) that prevents zero p-values on strong signals.
        Default ``0`` keeps the parametric behaviour for backward
        compatibility.
    random_state : int
        Seed for the permutation RNG. Ignored when
        ``n_permutations == 0``.
    """
    glyco_cols = [c for c in GLYCO_COLUMNS if c in df.columns]
    mechano_cols = [c for c in MECHANO_COLUMNS if c in df.columns]

    n_glyco = len(glyco_cols)
    n_mechano = len(mechano_cols)
    r_matrix = np.full((n_glyco, n_mechano), np.nan, dtype=np.float64)
    p_matrix = np.full((n_glyco, n_mechano), np.nan, dtype=np.float64)

    use_permutation = n_permutations > 0 and method == "spearman"
    rng = np.random.default_rng(random_state) if use_permutation else None

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
                    if use_permutation:
                        p = _permutation_spearman_pvalue(
                            x, y, n_permutations=n_permutations, rng=rng
                        )
                    else:
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

    # Benjamini–Hochberg FDR adjustment on the flat vector of finite
    # p-values. NaN p-values (skipped pairs) stay NaN in q_matrix so
    # downstream consumers can distinguish "not tested" from "tested,
    # not significant". scipy's false_discovery_control does not tolerate
    # NaN, so we run it on the finite subset and scatter back.
    q_matrix = _bh_adjust_matrix(p_matrix)
    with np.errstate(invalid="ignore"):
        n_significant_pairs = int(
            np.sum(np.isfinite(q_matrix) & (q_matrix < ALPHA))
        )

    return GlycoMechanoCorrelation(
        glyco_features=glyco_cols,
        mechano_features=mechano_cols,
        r_matrix=r_matrix,
        p_matrix=p_matrix,
        q_matrix=q_matrix,
        n_significant_pairs=n_significant_pairs,
        top_r=top_r,
        top_pair=top_pair,
        null_method="permutation" if use_permutation else "parametric",
        n_permutations=int(n_permutations) if use_permutation else 0,
    )


def _permutation_spearman_pvalue(
    x: np.ndarray,
    y: np.ndarray,
    n_permutations: int,
    rng: np.random.Generator,
) -> float:
    """Two-sided empirical p-value for Spearman ρ via permutation.

    Rank both ``x`` and ``y`` once (Spearman = Pearson on ranks), then
    generate ``n_permutations`` shuffles of the rank-y vector in a
    single vectorised numpy call and count the fraction whose |ρ|
    meets or exceeds the observed |ρ|. Applies the Phipson–Smyth
    (2010) ``(k + 1) / (N + 1)`` adjustment so strong signals do not
    produce zero p-values — the minimum empirical p is
    ``1 / (N + 1)`` regardless of how extreme the observation is.

    Returns NaN on inputs too small for a meaningful test (<5 pairs),
    on degenerate ranks (zero variance), or on non-finite observed ρ.
    """
    from scipy.stats import rankdata

    if x.size < 5 or y.size != x.size:
        return math.nan
    rx = rankdata(x)
    ry = rankdata(y)
    rx_c = rx - rx.mean()
    ry_c = ry - ry.mean()
    denom_x = np.sqrt((rx_c ** 2).sum())
    denom_y = np.sqrt((ry_c ** 2).sum())
    if denom_x <= 0.0 or denom_y <= 0.0:
        return math.nan
    denom = denom_x * denom_y
    rho_obs = (rx_c * ry_c).sum() / denom
    if not math.isfinite(rho_obs):
        return math.nan
    abs_obs = abs(rho_obs)

    # Vectorised permutations — argsort of uniform randoms is equivalent
    # to a uniform permutation but emits a (N_perm, n) index matrix in
    # a single numpy call. Fancy-indexing ry_c with this matrix produces
    # the permuted rank vectors; the per-permutation ρ is then a single
    # matrix-vector dot product.
    n = ry_c.size
    perm_idx = np.argsort(rng.random((int(n_permutations), n)), axis=1)
    permuted_y = ry_c[perm_idx]  # (n_perm, n)
    rho_perm = (permuted_y @ rx_c) / denom  # (n_perm,)
    n_extreme = int((np.abs(rho_perm) >= abs_obs).sum())
    return (n_extreme + 1) / (int(n_permutations) + 1)


def _bh_adjust_matrix(p_matrix: np.ndarray) -> np.ndarray:
    """Return a BH-FDR-adjusted q-value matrix of the same shape.

    Finite p-values across the whole rectangular matrix are pooled
    into a single family for correction (no row- or column-wise
    stratification — the family of interest is the full glyco×mechano
    screen). NaN entries of ``p_matrix`` pass through as NaN.

    Uses :func:`scipy.stats.false_discovery_control` with the default
    ``method='bh'``. Idempotent on an all-NaN input.
    """
    q_matrix = np.full_like(p_matrix, np.nan, dtype=np.float64)
    flat = p_matrix.ravel()
    finite_mask = np.isfinite(flat)
    if not finite_mask.any():
        return q_matrix
    adjusted = false_discovery_control(flat[finite_mask], method="bh")
    # ``false_discovery_control`` bounds output to [0, 1] by construction,
    # but clamp defensively in case of floating-point drift.
    adjusted = np.clip(adjusted, 0.0, 1.0)
    flat_q = q_matrix.ravel()
    flat_q[finite_mask] = adjusted
    return flat_q.reshape(p_matrix.shape)


def plot_glyco_mechano_correlation(
    df: pd.DataFrame,
    method: str = "spearman",
    n_permutations: int = 0,
    random_state: int = 42,
) -> tuple[go.Figure, GlycoMechanoCorrelation]:
    """Build the headline cross-block correlation heatmap.

    Parameters mirror :func:`compute_glyco_mechano_correlation`.
    Passing ``n_permutations > 0`` switches to an empirical p-value
    via shuffling, which the BH-FDR adjustment then uses instead of
    the parametric Spearman null.

    Returns
    -------
    (go.Figure, GlycoMechanoCorrelation)
        The Plotly figure ready to serialise via ``.to_json()``, and
        the computed correlation bundle (so callers can populate the
        ``mechano_score_summary.top_correlation_*`` fields without
        re-walking the matrix).
    """
    result = compute_glyco_mechano_correlation(
        df,
        method=method,
        n_permutations=n_permutations,
        random_state=random_state,
    )

    # No cell annotations — hover shows the exact value instead.
    # Cramming numbers into tiny heatmap cells is unreadable at
    # the 320px rail width. Clean heatmap + hover is the pro pattern.

    # "WGA pericellular" rather than "Glycocalyx" is the scientifically
    # honest label — wheat-germ agglutinin binds sialic acid and
    # N-acetylglucosamine on the confocal-accessible outer coat but
    # does NOT bind heparan sulfate (the syndecan / glypican / EXT
    # axis that Paszek 2014 targets). At ~0.3 µm/px confocal resolves
    # the pericellular shell but not the 50–500 nm glycopolymer
    # ultrastructure (Möckl 2019). Internally these stay called
    # "glycocalyx_*" columns for backward-compat with committed CSVs.
    title_parts = ["WGA pericellular ↔ mechanotransduction correlation"]
    total_tested = int(np.sum(np.isfinite(result.r_matrix)))
    if result.top_pair is not None:
        g, m = result.top_pair
        subtitle = (
            f"top |ρ| = {result.top_r:+.2f} — {g} vs {m}"
            f" · {result.n_significant_pairs}/{total_tested} pairs "
            f"sig. at FDR<{ALPHA:.2f}"
        )
        title_parts.append(
            f"<br><span style='font-size:11px;color:#8B92A8'>{subtitle}</span>"
        )
    elif total_tested > 0:
        # Matrix was computed but every pair was uninteresting; still
        # surface the FDR-significant count (likely 0) for transparency.
        title_parts.append(
            f"<br><span style='font-size:11px;color:#8B92A8'>"
            f"{result.n_significant_pairs}/{total_tested} pairs "
            f"sig. at FDR<{ALPHA:.2f}</span>"
        )
    title = "".join(title_parts)

    # Shorten feature names for readability in the embedded view
    def _short(name: str) -> str:
        return (
            name
            # "wga·" flags that every "glycocalyx_*" column is
            # measured via a WGA lectin binding sialic acid + GlcNAc
            # — not the heparan-sulfate glycosaminoglycan side of
            # the Labouesse syndecan/glypican biology. Human-facing
            # labels stay honest; internal column names stay stable.
            .replace("glycocalyx_", "wga·")
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
                    "font": {"color": "#566164", "size": 10},
                },
                "tickfont": {"color": "#566164", "size": 9},
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
            "title": {"text": title, "font": {"size": 12, "family": "Inter", "color": "#2a3437"}},
            "xaxis": {
                "tickangle": 45,
                "tickfont": {"size": 10, "color": "#566164", "family": "Inter"},
            },
            "yaxis": {
                "tickfont": {"size": 10, "color": "#566164", "family": "Inter"},
                "autorange": "reversed",
            },
            "margin": {"b": 80, "l": 100, "r": 50, "t": 40},
            "height": max(350, 28 * len(result.glyco_features) + 120),
            "paper_bgcolor": "rgba(0,0,0,0)",
            "plot_bgcolor": "rgba(0,0,0,0)",
        }
    )
    fig.update_layout(**layout)

    # Cell-level significance stars: one annotation per FDR-significant
    # tile. Uses the heatmap's categorical tick labels as xref/yref
    # anchors so the annotation lands at the tile centre regardless of
    # figure size. ``xanchor="center"`` + ``yanchor="middle"`` centres
    # the glyph in the tile; ``showarrow=False`` hides the default
    # connector; a thin white stroke keeps the glyph legible against
    # either end of the RdBu colorscale.
    for i in range(result.q_matrix.shape[0]):
        for j in range(result.q_matrix.shape[1]):
            q = result.q_matrix[i, j]
            glyph = _q_to_star(q)
            if glyph is None:
                continue
            fig.add_annotation(
                x=short_mechano[j],
                y=short_glyco[i],
                xref="x",
                yref="y",
                text=glyph,
                showarrow=False,
                font={"size": 11, "color": "#000000", "family": "Inter"},
                xanchor="center",
                yanchor="middle",
                # Plotly supports a text-stroke via bgcolor+bordercolor
                # workarounds but they distort the tile; a plain black
                # glyph is readable on every cell of RdBu_r at |ρ| ≤ 0.8.
            )

    return fig, result


def _q_to_star(q: float) -> str | None:
    """Return the significance glyph for a q-value, or ``None`` below the cutoff.

    Uses the module-level :data:`_STAR_TIERS` ladder — the strongest
    tier wins. NaN (untested pair) returns ``None``.
    """
    if not math.isfinite(q):
        return None
    for threshold, glyph in _STAR_TIERS:
        if q < threshold:
            return glyph
    return None


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
        line={"color": "#2a3437", "width": 1.5, "dash": "dash"},
        annotation={
            "text": f"μ = {mean:+.2f}",
            "font": {"color": "#2a3437", "size": 11, "family": "Inter"},
            "yanchor": "bottom",
        },
    )
    fig.update_layout(
        title=None,
        xaxis={
            "title": {
                "text": "Mechano score",
                "font": {"size": 10, "color": "#566164", "family": "Inter"},
            },
            "tickfont": {"size": 10, "color": "#566164", "family": "Inter"},
            "gridcolor": "rgba(169,180,183,0.15)",
        },
        yaxis={
            "title": {
                "text": "Cells",
                "font": {"size": 10, "color": "#566164", "family": "Inter"},
            },
            "tickfont": {"size": 10, "color": "#566164", "family": "Inter"},
            "gridcolor": "rgba(169,180,183,0.15)",
        },
        margin={"b": 40, "l": 40, "r": 15, "t": 10},
        height=240,
        bargap=0.08,
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        font={"family": "Inter"},
    )
    return fig
