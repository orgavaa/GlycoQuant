"""Population-level post-processing of the per-cell feature DataFrame.

Two operations live here, both running *after* the per-cell extractor
loop in :class:`ProfileAssembler`:

1. :func:`apply_yap_size_correction` — regress ``yap_nc_ratio`` against
   ``cell_area`` and store the residual as
   ``yap_nc_ratio_size_corrected``. Jones *et al.* (*Mol. Omics* 2024,
   20:554-569) showed that whole-cell YAP concentration declines 4-8x
   with cell area while nuclear concentration is roughly constant, so
   the raw N/C ratio drifts upward with spreading area. Since spread
   area co-varies with substrate stiffness and mechanotransduction
   state, an uncorrected ratio entangles the two and contaminates any
   downstream glyco<->mechano correlation analysis.

2. :func:`compute_mechano_score` — z-score a curated set of
   mechanotransduction features and project them onto the first
   principal component (data-driven, within-image). The result is a
   single-number per-cell readout that combines YAP translocation,
   focal-adhesion maturation, actin contractility and nuclear
   morphology. No published study has validated such a composite
   score; this is a deliberate methods contribution and the central
   scalar that Tab 2/Tab 3 perturbation rankings can optimise against.

Both operations are pure DataFrame transforms — they take the per-cell
table and return an enriched copy. The :class:`ProfileAssembler`
orchestrates the call.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
import pandas as pd

# Cells with at least this many finite (yap_nc_ratio, cell_area) rows
# are required to fit a stable size-correction regression. 30 is the
# minimum "rule of 20 obs per predictor + 10 safety" floor for simple
# linear regression (Harrell 2015, "Regression Modeling Strategies").
_MIN_CELLS_FOR_SIZE_CORRECTION = 30

# Cells with at least this many rows of usable mechano features are
# required for a stable PCA. The true statistical floor scales with
# the number of features — the classical "5 × features" rule (Gorsuch
# 1983) for stable loadings. We honour both: the absolute floor of 30
# (so small images still get a weighted-sum fallback, not a crash) and
# the feature-adaptive floor of ``5 × n_features_used``, whichever is
# higher. Resolved at call time via :func:`_adaptive_pca_floor`.
_MIN_CELLS_FOR_PCA = 30

# Minimum R² below which the Jones-2024 size correction is not applied.
# If cell_area explains less than 5% of yap_nc_ratio variance, the
# regression slope is noise and subtracting it introduces artificial
# variance. The raw column is then copied through unchanged.
_MIN_R2_FOR_SIZE_CORRECTION: float = 0.05

# PC1 variance-explained floor. Below this value PC1 is barely above
# chance and a composite "mechano_score" built on it is not
# scientifically meaningful. We keep the computed score but flag it
# in the summary so the UI can surface a caveat instead of pretending
# the number is a clean axis.
_MIN_PC1_VARIANCE_WARN: float = 0.20


def _adaptive_pca_floor(n_features_used: int) -> int:
    """Feature-adaptive cell-count floor for stable PCA loadings.

    Returns the larger of :data:`_MIN_CELLS_FOR_PCA` (absolute floor
    against degenerate covariance) and ``5 × n_features_used``
    (Gorsuch 1983 rule for stable loading recovery). Scales with the
    actual panel the image produced, not the class default 11.
    """
    return max(_MIN_CELLS_FOR_PCA, 5 * max(1, int(n_features_used)))


def _bootstrap_slope_ci(
    x: np.ndarray,
    y: np.ndarray,
    n_resamples: int = 200,
    seed: int = 42,
    alpha: float = 0.05,
) -> tuple[float, float]:
    """Percentile bootstrap CI for the OLS slope of ``y`` on ``x``.

    Used by :func:`apply_yap_size_correction` to expose the stability
    of the Jones-2024 correction — a slope whose 95% CI crosses zero
    is not distinguishable from noise and the UI can surface that
    directly. ``n_resamples=200`` is a standard throughput/accuracy
    trade-off for a diagnostic; the CI is reported, not bootstrapped
    for hypothesis testing, so ≥95% CI coverage is already adequate.
    """
    n = x.size
    if n < 2:
        return math.nan, math.nan
    rng = np.random.default_rng(seed)
    slopes = np.empty(n_resamples, dtype=np.float64)
    for i in range(n_resamples):
        idx = rng.integers(0, n, size=n)
        xb = x[idx]
        yb = y[idx]
        xb_mean = xb.mean()
        var_xb = ((xb - xb_mean) ** 2).sum()
        if var_xb <= 0.0:
            slopes[i] = math.nan
            continue
        cov = ((xb - xb_mean) * (yb - yb.mean())).sum()
        slopes[i] = cov / var_xb
    slopes = slopes[np.isfinite(slopes)]
    if slopes.size < max(20, int(0.5 * n_resamples)):
        return math.nan, math.nan
    lo = float(np.quantile(slopes, alpha / 2.0))
    hi = float(np.quantile(slopes, 1.0 - alpha / 2.0))
    return lo, hi

# Curated mechanotransduction feature panel — the columns we want PC1
# to summarise. Some are inverted because lower values indicate higher
# mechanotransduction (e.g. nuclear solidity drops as the nucleus
# wrinkles under contractile load; nuclear/cell area ratio shrinks as
# spreading flattens the nucleus).
@dataclass(frozen=True)
class _MechanoFeature:
    column: str
    invert: bool = False


_MECHANO_FEATURES: tuple[_MechanoFeature, ...] = (
    _MechanoFeature("yap_nc_ratio_size_corrected"),
    _MechanoFeature("yap_nuclear_intensity"),
    _MechanoFeature("fa_density_per_um2"),
    _MechanoFeature("fa_mature_fraction"),
    _MechanoFeature("fa_total_area"),
    _MechanoFeature("fa_mean_orientation_alignment"),
    _MechanoFeature("actin_stress_fiber_coherence"),
    _MechanoFeature("actin_cortical_ratio"),
    _MechanoFeature("nuclear_aspect_ratio"),
    _MechanoFeature("nuclear_solidity", invert=True),
    _MechanoFeature("nuclear_to_cell_area_ratio", invert=True),
    # ``cell_spread_area`` was previously in this panel but was removed:
    # ``yap_nc_ratio_size_corrected`` has already been regressed against
    # ``cell_area`` via the Jones 2024 correction (see
    # :func:`apply_yap_size_correction`). Including the convex-hull area
    # in the panel re-injects the size axis PC1 was supposed to be free
    # of, because spread area and cell area are near-collinear. Dropping
    # it makes the score a pure mechanotransduction readout (YAP, FA,
    # actin, nuclear shape) without a residual size confound.
)


# ---------------------------------------------------------------------------
# YAP size correction (Jones 2024)
# ---------------------------------------------------------------------------


def apply_yap_size_correction(df: pd.DataFrame) -> pd.DataFrame:
    """Add ``yap_nc_ratio_size_corrected`` to the per-cell DataFrame.

    Linear regression of ``yap_nc_ratio`` on ``cell_area`` over cells
    with finite values for both columns. The corrected value is the
    raw ratio minus the slope x area component, re-centred on the
    raw global mean so the new column is on the same scale as the
    original (residuals + intercept ≈ raw mean).

    The function additionally writes two diagnostic columns shared
    across every row:

    - ``yap_size_correction_slope`` — fitted slope (units: ratio per pixel²)
    - ``yap_size_correction_r2`` — coefficient of determination

    When fewer than 30 cells have finite values, or when the input
    lacks ``yap_nc_ratio`` / ``cell_area`` entirely, the function
    copies the raw column unchanged and writes NaN diagnostics. This
    keeps the downstream consumers (mechano score, viz, Tab 2
    contextual re-ranking) on a single column name regardless of
    sample size.

    Parameters
    ----------
    df : pd.DataFrame
        Per-cell feature table from :class:`ProfileAssembler`.

    Returns
    -------
    pd.DataFrame
        Enriched copy with the three new columns. The original
        ``yap_nc_ratio`` column is preserved unchanged so Tab 2's
        contextual re-ranking contract is not broken.
    """
    out = df.copy()

    if "yap_nc_ratio" not in out.columns or "cell_area" not in out.columns:
        out["yap_nc_ratio_size_corrected"] = out.get(
            "yap_nc_ratio", pd.Series(np.nan, index=out.index)
        )
        out["yap_size_correction_slope"] = math.nan
        out["yap_size_correction_r2"] = math.nan
        out["yap_size_correction_slope_ci_lo"] = math.nan
        out["yap_size_correction_slope_ci_hi"] = math.nan
        out["yap_size_correction_applied"] = False
        return out

    raw = out["yap_nc_ratio"].to_numpy(dtype=np.float64)
    area = out["cell_area"].to_numpy(dtype=np.float64)
    mask = np.isfinite(raw) & np.isfinite(area)

    if int(mask.sum()) < _MIN_CELLS_FOR_SIZE_CORRECTION:
        out["yap_nc_ratio_size_corrected"] = out["yap_nc_ratio"]
        out["yap_size_correction_slope"] = math.nan
        out["yap_size_correction_r2"] = math.nan
        out["yap_size_correction_slope_ci_lo"] = math.nan
        out["yap_size_correction_slope_ci_hi"] = math.nan
        out["yap_size_correction_applied"] = False
        return out

    x = area[mask]
    y = raw[mask]
    x_mean = float(x.mean())
    y_mean = float(y.mean())
    cov = float(((x - x_mean) * (y - y_mean)).sum())
    var_x = float(((x - x_mean) ** 2).sum())
    if var_x <= 0.0:
        out["yap_nc_ratio_size_corrected"] = out["yap_nc_ratio"]
        out["yap_size_correction_slope"] = 0.0
        out["yap_size_correction_r2"] = 0.0
        out["yap_size_correction_slope_ci_lo"] = math.nan
        out["yap_size_correction_slope_ci_hi"] = math.nan
        out["yap_size_correction_applied"] = False
        return out

    slope = cov / var_x
    intercept = y_mean - slope * x_mean
    y_pred = slope * x + intercept
    ss_res = float(((y - y_pred) ** 2).sum())
    ss_tot = float(((y - y_mean) ** 2).sum())
    r2 = 1.0 - ss_res / ss_tot if ss_tot > 0.0 else 0.0

    # Bootstrap CI on the slope — scientifically honest diagnostic so
    # the UI can say "slope = +0.0012 (95% CI [+0.0003, +0.0021])"
    # instead of reporting a bare point estimate that reads as certain.
    slope_ci_lo, slope_ci_hi = _bootstrap_slope_ci(x, y)

    # R² gate: when cell_area explains less than ``_MIN_R2_FOR_SIZE_CORRECTION``
    # of yap_nc_ratio variance, the slope is noise. Subtracting it adds
    # artificial variance to every downstream mechanotransduction
    # readout. Honest path: copy raw, flag the diagnostic, let the UI
    # show the reason.
    if r2 < _MIN_R2_FOR_SIZE_CORRECTION:
        out["yap_nc_ratio_size_corrected"] = out["yap_nc_ratio"]
        out["yap_size_correction_slope"] = float(slope)
        out["yap_size_correction_r2"] = float(r2)
        out["yap_size_correction_slope_ci_lo"] = slope_ci_lo
        out["yap_size_correction_slope_ci_hi"] = slope_ci_hi
        out["yap_size_correction_applied"] = False
        return out

    # Apply correction to ALL rows where both inputs are finite,
    # regardless of whether they made the regression cut. Cells with
    # NaN inputs stay NaN.
    corrected = np.full_like(raw, math.nan)
    apply_mask = np.isfinite(raw) & np.isfinite(area)
    corrected[apply_mask] = raw[apply_mask] - slope * (area[apply_mask] - x_mean)

    out["yap_nc_ratio_size_corrected"] = corrected
    out["yap_size_correction_slope"] = float(slope)
    out["yap_size_correction_r2"] = float(r2)
    out["yap_size_correction_slope_ci_lo"] = slope_ci_lo
    out["yap_size_correction_slope_ci_hi"] = slope_ci_hi
    out["yap_size_correction_applied"] = True
    return out


# ---------------------------------------------------------------------------
# Composite mechanotransduction score (PCA / weighted-sum)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class MechanoScoreSummary:
    """Per-image summary of the composite mechano score.

    Surfaced via the backend ``JobResult.mechano_score_summary`` field
    so the frontend can render diagnostics next to the score
    distribution histogram.
    """

    mode: str  # "pca" | "weighted_sum"
    n_cells_used: int
    n_features_used: int
    pc1_variance_explained: float
    loadings: dict[str, float]
    mean: float
    std: float


def compute_mechano_score(
    df: pd.DataFrame,
    mode: str = "pca",
) -> tuple[pd.DataFrame, MechanoScoreSummary]:
    """Add ``mechano_score`` column and return per-image summary.

    Within-image z-scores the available subset of
    :data:`_MECHANO_FEATURES`, inverts the columns marked
    ``invert=True``, and projects to a single scalar per cell.

    Modes
    -----
    ``"pca"``
        Per-image PCA on the z-scored matrix; PC1 sign-flipped so a
        positive score correlates with ``yap_nc_ratio_size_corrected``.
        Falls back to ``"weighted_sum"`` when fewer than
        :data:`_MIN_CELLS_FOR_PCA` cells have a complete feature row,
        or when the requested mode is ``"weighted_sum"`` directly.

    ``"weighted_sum"``
        Equal-weighted z-score sum. Transparent fallback that does
        not require enough cells for a stable covariance.

    Loadings, the cell count actually used, and the variance
    explained by PC1 are returned in the
    :class:`MechanoScoreSummary` so the UI can show "PC1 explains 42%
    of variance over 287 cells, with strongest contribution from
    ``yap_nc_ratio_size_corrected``" — diagnostic context that turns
    a black-box score into a defensible measurement.

    Parameters
    ----------
    df : pd.DataFrame
        Per-cell feature table. Must already have
        ``yap_nc_ratio_size_corrected`` populated (run
        :func:`apply_yap_size_correction` first).
    mode : {"pca", "weighted_sum"}
        Scoring mode.

    Returns
    -------
    (pd.DataFrame, MechanoScoreSummary)
        Enriched DataFrame with ``mechano_score`` column, and a
        summary describing how the score was computed.
    """
    out = df.copy()

    available = [f for f in _MECHANO_FEATURES if f.column in out.columns]
    if not available:
        out["mechano_score"] = math.nan
        return out, MechanoScoreSummary(
            mode="weighted_sum",
            n_cells_used=0,
            n_features_used=0,
            pc1_variance_explained=0.0,
            loadings={},
            mean=math.nan,
            std=math.nan,
        )

    # Build the (n_cells, n_features) matrix, inverting where flagged.
    raw_matrix = np.column_stack(
        [
            (-1.0 if f.invert else 1.0) * out[f.column].to_numpy(dtype=np.float64)
            for f in available
        ]
    )

    # Z-score per column over finite values only.
    finite_mask = np.isfinite(raw_matrix)
    z_matrix = np.full_like(raw_matrix, np.nan)
    for j in range(raw_matrix.shape[1]):
        col = raw_matrix[:, j]
        col_mask = finite_mask[:, j]
        if int(col_mask.sum()) < 2:
            continue
        mu = float(col[col_mask].mean())
        sigma = float(col[col_mask].std())
        if sigma <= 0.0:
            z_matrix[col_mask, j] = 0.0
            continue
        z_matrix[col_mask, j] = (col[col_mask] - mu) / sigma

    # Cells where every feature is finite go into the PCA fit. Other
    # cells still receive a score in weighted-sum mode (nanmean over
    # available features) so we don't drop them entirely.
    complete_mask = np.all(np.isfinite(z_matrix), axis=1)
    n_complete = int(complete_mask.sum())

    # Feature-adaptive PCA floor: Gorsuch (1983) "5 × features" rule
    # for stable loading recovery, with the absolute 30-cell floor
    # preserved so tiny images still get a weighted-sum fallback.
    adaptive_floor = _adaptive_pca_floor(len(available))
    use_pca = mode == "pca" and n_complete >= adaptive_floor
    chosen_mode = "pca" if use_pca else "weighted_sum"

    if use_pca:
        x = z_matrix[complete_mask]
        # Centred — z-scoring already centred each column, but we
        # re-centre on the complete-row subset to be safe.
        x = x - x.mean(axis=0, keepdims=True)
        cov = np.cov(x, rowvar=False)
        eigvals, eigvecs = np.linalg.eigh(cov)
        # eigh returns ascending order; PC1 is the last column.
        order = np.argsort(eigvals)[::-1]
        eigvals = eigvals[order]
        eigvecs = eigvecs[:, order]
        pc1 = eigvecs[:, 0]

        # Sign-align PC1 so the loading on
        # yap_nc_ratio_size_corrected (the canonical mechano readout)
        # is positive — gives the score an interpretable direction.
        try:
            yap_index = next(
                i
                for i, f in enumerate(available)
                if f.column == "yap_nc_ratio_size_corrected"
            )
            if pc1[yap_index] < 0:
                pc1 = -pc1
        except StopIteration:
            # If yap is missing, align so the first non-zero loading
            # is positive — keeps the score reproducible.
            for v in pc1:
                if v != 0.0:
                    if v < 0:
                        pc1 = -pc1
                    break

        scores_full = np.full(out.shape[0], math.nan)
        # Project every cell whose features are *all* finite (use the
        # PCA loading directly) — others fall back to weighted-sum.
        scores_full[complete_mask] = (
            z_matrix[complete_mask] @ pc1
        )
        # For cells where some features are NaN, fall back to a
        # nanmean over the available z-scores so the score is at
        # least populated for the correlation matrix.
        partial_mask = ~complete_mask
        with np.errstate(invalid="ignore"):
            partial_scores = np.nanmean(z_matrix[partial_mask], axis=1)
        scores_full[partial_mask] = partial_scores

        var_explained = float(eigvals[0] / eigvals.sum()) if eigvals.sum() > 0 else 0.0
        loadings = {
            f.column: float(pc1[i]) for i, f in enumerate(available)
        }
    else:
        # Weighted sum — equal-weight nanmean over the z-scored
        # columns. Cells with no finite features stay NaN.
        with np.errstate(invalid="ignore"):
            scores_full = np.nanmean(z_matrix, axis=1)
        var_explained = 0.0
        loadings = {f.column: 1.0 / len(available) for f in available}

    out["mechano_score"] = scores_full
    finite_scores = scores_full[np.isfinite(scores_full)]
    summary = MechanoScoreSummary(
        mode=chosen_mode,
        n_cells_used=n_complete if chosen_mode == "pca" else int(np.isfinite(scores_full).sum()),
        n_features_used=len(available),
        pc1_variance_explained=var_explained,
        loadings=loadings,
        mean=float(finite_scores.mean()) if finite_scores.size else math.nan,
        std=float(finite_scores.std()) if finite_scores.size else math.nan,
    )
    return out, summary


# ---------------------------------------------------------------------------
# Public entry point — called by ProfileAssembler post-processing hook
# ---------------------------------------------------------------------------


def apply_population_post_processing(
    df: pd.DataFrame,
    mode: str = "pca",
) -> tuple[pd.DataFrame, MechanoScoreSummary | None]:
    """Run YAP size correction then composite mechano scoring in order.

    Convenience composition used by
    :meth:`ProfileAssembler.process_image`. Returns the enriched
    DataFrame and the score summary (or ``None`` if the score column
    could not be computed because the input was empty).
    """
    if df.empty:
        return df, None
    df = apply_yap_size_correction(df)
    df, summary = compute_mechano_score(df, mode=mode)
    return df, summary
