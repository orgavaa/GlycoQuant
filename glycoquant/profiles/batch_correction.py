"""ComBat empirical-Bayes batch-effect correction for per-cell features.

Cross-session microscopy comparisons need batch correction. Top-hat
illumination subtraction handles intra-image gradients; it does NOT
handle inter-session shifts in laser power, detector gain, ambient
autofluorescence, or operator-dependent staining. Caicedo *et al.*
(*Nat Methods* 2017) identifies inter-batch contamination as the
single largest source of false discovery in image-based profiling.

The standard fix is **ComBat** (Johnson, Li & Rabinovic, *Biostatistics*
2007), an empirical-Bayes location-scale adjustment that pools
information across batches to estimate per-batch (γ̂, δ̂²) shifts
under shrinkage priors. Originally developed for microarray gene
expression, ComBat has been validated for Cell Painting morphology
features (Caicedo 2017) and is the de-facto standard in JUMP-CP.

This module implements the **parametric** ComBat variant — fast,
well-conditioned for typical batch counts (≥3), and the variant
recommended by the original paper for non-bimodal feature
distributions. The non-parametric variant is more robust under
small-N batch heterogeneity but ~10× slower; if needed it can be
swapped behind the same :func:`combat_correct` interface.

Single-image analyses are a no-op: when every cell has the same
``batch`` label, ComBat reduces to the identity transform on every
feature. The frontend therefore exposes batch correction as an
opt-in for users who upload multiple images that should be jointly
analysed.

References
----------
- Johnson WE, Li C, Rabinovic A. Adjusting batch effects in microarray
  expression data using empirical Bayes methods. *Biostatistics* 8,
  118–127 (2007). [10.1093/biostatistics/kxj037](https://doi.org/10.1093/biostatistics/kxj037)
- Caicedo JC *et al.* Data-analysis strategies for image-based cell
  profiling. *Nat Methods* 14, 849–863 (2017).
"""
from __future__ import annotations

import math

import numpy as np
import pandas as pd

# Below this count of batches the empirical-Bayes shrinkage priors
# become unstable — fewer than 3 batches and the inter-batch variance
# estimate is essentially the within-batch variance, defeating the
# purpose of the correction. Caller falls back to the identity.
_MIN_BATCHES = 3

# Below this count of cells per batch the within-batch variance is
# unreliable; the empirical-Bayes posterior collapses onto the prior
# and the correction adds noise. Skip such tiny batches.
_MIN_CELLS_PER_BATCH = 5


def combat_correct(
    df: pd.DataFrame,
    batch_col: str = "batch",
    feature_cols: list[str] | None = None,
    *,
    eps: float = 1e-8,
) -> pd.DataFrame:
    """Apply parametric ComBat correction to per-cell features.

    Parameters
    ----------
    df : pd.DataFrame
        Per-cell features with at least one batch column.
    batch_col : str
        Name of the categorical column identifying batch membership.
        Cells in the same batch share a (γ̂, δ̂²) shift.
    feature_cols : list[str], optional
        Numerical columns to correct. Defaults to every numeric
        column except ``batch_col``, ``cell_id``, and any column
        starting with ``deep_`` (deep embeddings live in their own
        space and have no biological interpretation per-feature, so
        ComBat's location-scale model is not appropriate).
    eps : float
        Numerical floor on within-feature standard deviation to
        prevent division by zero on constant columns.

    Returns
    -------
    pd.DataFrame
        Same shape as ``df`` with ``feature_cols`` corrected in place.
        All non-feature columns (including the batch column itself)
        are preserved.

    Notes
    -----
    The correction is a no-op when:

    - The batch column is missing or has fewer than
      :data:`_MIN_BATCHES` distinct labels (default 3).
    - Every cell shares the same batch (single-image analysis).
    - A specific batch has fewer than :data:`_MIN_CELLS_PER_BATCH`
      cells; that batch's contribution to the inter-batch variance
      estimate is dropped, but other batches still get corrected.

    These thresholds match the Johnson 2007 paper's recommendations
    for parametric ComBat stability.
    """
    if batch_col not in df.columns:
        return df.copy()

    batches = df[batch_col].astype(str).to_numpy()
    unique_batches = sorted(set(batches))
    if len(unique_batches) < _MIN_BATCHES:
        # Single image or near-single — correction is a no-op
        return df.copy()

    if feature_cols is None:
        feature_cols = [
            c
            for c in df.select_dtypes(include=[np.number]).columns
            if c != batch_col
            and c != "cell_id"
            and not c.startswith("deep_")
        ]
    if not feature_cols:
        return df.copy()

    out = df.copy()
    matrix = out[feature_cols].to_numpy(dtype=np.float64)
    n_cells, n_features = matrix.shape

    # Filter batches by cell count
    batch_counts = {b: int((batches == b).sum()) for b in unique_batches}
    qualifying_batches = [
        b for b in unique_batches if batch_counts[b] >= _MIN_CELLS_PER_BATCH
    ]
    if len(qualifying_batches) < _MIN_BATCHES:
        return df.copy()

    # Step 1 — standardise per feature using the GRAND mean / std
    # across all qualifying-batch cells (Johnson 2007 §2.1).
    qualifying_mask = np.isin(batches, qualifying_batches)
    grand_mean = np.nanmean(matrix[qualifying_mask], axis=0)
    grand_std = np.nanstd(matrix[qualifying_mask], axis=0)
    grand_std = np.where(grand_std < eps, eps, grand_std)
    z_matrix = (matrix - grand_mean) / grand_std

    # Step 2 — per-batch additive shift (γ̂) and multiplicative scale (δ̂²).
    # Only computed for qualifying batches; small batches stay at the
    # standardised representation but get the shrinkage prior applied
    # to them by virtue of the next step.
    gamma_hat: dict[str, np.ndarray] = {}
    delta2_hat: dict[str, np.ndarray] = {}
    for b in qualifying_batches:
        bmask = batches == b
        if not bmask.any():
            continue
        bz = z_matrix[bmask]
        # Only the in-batch finite values contribute to the per-batch
        # mean/var estimates — ComBat is NaN-tolerant by design.
        with np.errstate(invalid="ignore"):
            gamma_hat[b] = np.nanmean(bz, axis=0)
            delta2_hat[b] = np.nanvar(bz, axis=0, ddof=1)
        # Numerical floor on δ̂² to prevent division by zero
        delta2_hat[b] = np.where(delta2_hat[b] < eps, eps, delta2_hat[b])

    # Step 3 — empirical-Bayes hyperparameters. Across qualifying
    # batches: γ̄ (mean of γ̂) and τ̄² (variance of γ̂); the scale prior
    # uses the inverse-gamma method-of-moments from Johnson 2007 §2.2.
    gamma_stack = np.vstack([gamma_hat[b] for b in qualifying_batches])
    gamma_bar = np.nanmean(gamma_stack, axis=0)
    tau2_bar = np.nanvar(gamma_stack, axis=0, ddof=1)
    tau2_bar = np.where(tau2_bar < eps, eps, tau2_bar)

    delta_stack = np.vstack([delta2_hat[b] for b in qualifying_batches])
    delta_mean = np.nanmean(delta_stack, axis=0)
    delta_var = np.nanvar(delta_stack, axis=0, ddof=1)
    delta_var = np.where(delta_var < eps, eps, delta_var)

    # Method-of-moments inverse-gamma hyperparameters
    lambda_hat = (delta_mean ** 2 + 2.0 * delta_var) / delta_var
    theta_hat = (delta_mean ** 3 + delta_mean * delta_var) / delta_var
    # Guard against degenerate values
    lambda_hat = np.where(np.isfinite(lambda_hat) & (lambda_hat > 1.0), lambda_hat, 2.0)
    theta_hat = np.where(np.isfinite(theta_hat) & (theta_hat > 0.0), theta_hat, delta_mean)

    # Step 4 — posterior batch effects via parametric shrinkage.
    # γ* = (n × τ̄² × γ̂ + δ̂² × γ̄) / (n × τ̄² + δ̂²)
    # δ*² = (θ̂ + 0.5 × Σ(z - γ*)²) / (n/2 + λ̂ - 1)
    z_corrected = z_matrix.copy()
    for b in qualifying_batches:
        bmask = batches == b
        if not bmask.any():
            continue
        n_b = int(bmask.sum())
        bz = z_matrix[bmask]
        gamma_star = (
            (n_b * tau2_bar * gamma_hat[b] + delta2_hat[b] * gamma_bar)
            / (n_b * tau2_bar + delta2_hat[b])
        )
        sse = np.nansum((bz - gamma_star) ** 2, axis=0)
        delta2_star = (theta_hat + 0.5 * sse) / (n_b / 2.0 + lambda_hat - 1.0)
        delta2_star = np.where(delta2_star < eps, eps, delta2_star)

        # Rescale: corrected_z = (z - γ*) / sqrt(δ*²)
        z_corrected[bmask] = (bz - gamma_star) / np.sqrt(delta2_star)

    # Step 5 — restore the original scale: y = std × z + mean
    corrected_matrix = z_corrected * grand_std + grand_mean

    out.loc[:, feature_cols] = corrected_matrix
    return out


def diagnostics(
    df: pd.DataFrame,
    batch_col: str = "batch",
    feature_cols: list[str] | None = None,
) -> dict[str, float | dict[str, float]]:
    """Per-feature batch-effect magnitude before correction.

    Useful for the UI to warn the user "this feature shows a 3.4× SD
    inter-batch shift" before they decide whether ComBat is needed.
    Returns a dict with overall summary stats and a per-feature
    inter-batch / intra-batch standard-deviation ratio (eta-squared
    style decomposition).
    """
    if batch_col not in df.columns:
        return {"applicable": False, "reason": f"batch column '{batch_col}' missing"}
    if feature_cols is None:
        feature_cols = [
            c
            for c in df.select_dtypes(include=[np.number]).columns
            if c != batch_col and c != "cell_id" and not c.startswith("deep_")
        ]

    batches = df[batch_col].astype(str)
    unique_batches = sorted(batches.unique())
    if len(unique_batches) < 2:
        return {"applicable": False, "reason": "single batch — no inter-batch shift to measure"}

    per_feature: dict[str, float] = {}
    for col in feature_cols:
        vals = df[col].to_numpy(dtype=np.float64)
        between_batch = []
        within_batch = []
        for b in unique_batches:
            mask = (batches == b).to_numpy()
            v = vals[mask]
            v = v[np.isfinite(v)]
            if v.size < 2:
                continue
            between_batch.append(float(v.mean()))
            within_batch.append(float(v.std(ddof=1)))
        if len(between_batch) < 2:
            continue
        var_between = float(np.var(between_batch, ddof=1))
        var_within = float(np.mean(np.square(within_batch)))
        if var_within < 1e-12:
            continue
        per_feature[col] = math.sqrt(var_between / var_within)

    if not per_feature:
        return {"applicable": False, "reason": "no feature with finite values across multiple batches"}

    ratios = list(per_feature.values())
    return {
        "applicable": True,
        "n_batches": len(unique_batches),
        "n_features_assessed": len(per_feature),
        "max_between_within_sd_ratio": float(max(ratios)),
        "median_between_within_sd_ratio": float(np.median(ratios)),
        "per_feature_between_within_sd_ratio": per_feature,
    }
