"""Cross-modal prediction: glycocalyx features ↔ mechanotransduction features.

Trains a lightweight MLP to predict one modality from the other within
a single image. Uses 5-fold cross-validation to report per-target R²
and computes feature importance via input gradient magnitudes.

The scientific question: *"How much of a cell's mechanical state can
you infer from its surface glycocalyx alone?"* A high R² implies
tight biomechanical coupling between the pericellular coat and
downstream mechanotransduction — the central hypothesis of the
GlycoQuant platform.

References
----------
- Paszek et al. (2014). The cancer glycocalyx mechanically primes
  integrin-mediated growth and survival. Nature 511, 319–325.
- Hamrangsekachaee et al. (2025). Glycocalyx remodeling in
  mechanotransduction. Trends Cell Biol.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import numpy as np
import pandas as pd


# Column groups — imported from viz at call time to avoid circular imports
GLYCO_COLS = (
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

MECHANO_COLS = (
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
class CrossModalParams:
    hidden_dims: tuple[int, ...] = (64, 32)
    epochs: int = 100
    lr: float = 0.001
    dropout: float = 0.1
    n_folds: int = 5
    random_state: int = 42


@dataclass
class CrossModalResult:
    direction: str  # "glyco_to_mechano" | "mechano_to_glyco"
    input_features: list[str]
    target_features: list[str]
    overall_r2: float
    per_target_r2: dict[str, float]
    feature_importance: dict[str, float]
    # Per-cell predictions for the best fold
    cell_ids: list[int]
    predictions: dict[str, list[float]]
    actuals: dict[str, list[float]]


def train_cross_modal(
    features_df: pd.DataFrame,
    direction: Literal["glyco_to_mechano", "mechano_to_glyco"] = "glyco_to_mechano",
    params: CrossModalParams | None = None,
) -> CrossModalResult:
    """Train an MLP predicting one modality from the other.

    Parameters
    ----------
    features_df : pd.DataFrame
        Per-cell features indexed by ``cell_id``.
    direction : str
        ``"glyco_to_mechano"``: predict mechano from glyco features.
        ``"mechano_to_glyco"``: predict glyco from mechano features.

    Returns
    -------
    CrossModalResult
    """
    import torch
    import torch.nn as nn

    if params is None:
        params = CrossModalParams()

    rng = np.random.RandomState(params.random_state)

    # Select columns
    if direction == "glyco_to_mechano":
        input_cols = [c for c in GLYCO_COLS if c in features_df.columns]
        target_cols = [c for c in MECHANO_COLS if c in features_df.columns]
    else:
        input_cols = [c for c in MECHANO_COLS if c in features_df.columns]
        target_cols = [c for c in GLYCO_COLS if c in features_df.columns]

    if len(input_cols) < 2:
        raise ValueError(f"Too few input features ({len(input_cols)}). Need >= 2.")
    if len(target_cols) < 1:
        raise ValueError(f"No target features found.")

    # Prepare data — drop rows with any NaN in input or target
    sub = features_df[input_cols + target_cols].dropna()
    if len(sub) < 10:
        raise ValueError(f"Only {len(sub)} cells with complete data — need >= 10.")

    X_raw = sub[input_cols].values.astype(np.float32)
    Y_raw = sub[target_cols].values.astype(np.float32)
    cell_ids = [int(c) for c in sub.index.tolist()]

    # Standardize
    x_mean, x_std = X_raw.mean(0), X_raw.std(0)
    x_std[x_std < 1e-8] = 1.0
    X = (X_raw - x_mean) / x_std

    y_mean, y_std = Y_raw.mean(0), Y_raw.std(0)
    y_std[y_std < 1e-8] = 1.0
    Y = (Y_raw - y_mean) / y_std

    n_samples = X.shape[0]
    in_dim = X.shape[1]
    out_dim = Y.shape[1]

    # Build MLP
    def make_mlp() -> nn.Sequential:
        layers: list[nn.Module] = []
        prev = in_dim
        for h in params.hidden_dims:
            layers.append(nn.Linear(prev, h))
            layers.append(nn.ReLU())
            if params.dropout > 0:
                layers.append(nn.Dropout(params.dropout))
            prev = h
        layers.append(nn.Linear(prev, out_dim))
        return nn.Sequential(*layers)

    # 5-fold cross-validation
    indices = rng.permutation(n_samples)
    fold_size = n_samples // params.n_folds
    all_preds = np.zeros_like(Y)
    fold_r2s: list[dict[str, float]] = []

    for fold in range(params.n_folds):
        val_start = fold * fold_size
        val_end = val_start + fold_size if fold < params.n_folds - 1 else n_samples
        val_idx = indices[val_start:val_end]
        train_idx = np.concatenate([indices[:val_start], indices[val_end:]])

        X_tr = torch.tensor(X[train_idx], dtype=torch.float32)
        Y_tr = torch.tensor(Y[train_idx], dtype=torch.float32)
        X_val = torch.tensor(X[val_idx], dtype=torch.float32)

        model = make_mlp()
        optimizer = torch.optim.Adam(model.parameters(), lr=params.lr)

        model.train()
        for _ in range(params.epochs):
            pred = model(X_tr)
            loss = nn.functional.mse_loss(pred, Y_tr)
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()

        model.eval()
        with torch.no_grad():
            val_pred = model(X_val).numpy()
        all_preds[val_idx] = val_pred

    # Compute per-target R² (on standardized data, then report)
    per_target_r2: dict[str, float] = {}
    for j, col in enumerate(target_cols):
        y_true = Y[:, j]
        y_pred = all_preds[:, j]
        ss_res = np.sum((y_true - y_pred) ** 2)
        ss_tot = np.sum((y_true - y_true.mean()) ** 2)
        r2 = 1.0 - ss_res / (ss_tot + 1e-10)
        per_target_r2[col] = float(np.clip(r2, -1.0, 1.0))

    overall_r2 = float(np.mean(list(per_target_r2.values())))

    # Feature importance via gradient magnitude on full dataset
    full_model = make_mlp()
    optimizer = torch.optim.Adam(full_model.parameters(), lr=params.lr)
    X_full = torch.tensor(X, dtype=torch.float32)
    Y_full = torch.tensor(Y, dtype=torch.float32)

    full_model.train()
    for _ in range(params.epochs):
        pred = full_model(X_full)
        loss = nn.functional.mse_loss(pred, Y_full)
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()

    full_model.eval()
    X_grad = torch.tensor(X, dtype=torch.float32, requires_grad=True)
    pred = full_model(X_grad)
    pred.sum().backward()
    grad_mag = X_grad.grad.abs().mean(dim=0).numpy()
    grad_normed = grad_mag / (grad_mag.sum() + 1e-10)
    feature_importance = {col: float(grad_normed[i]) for i, col in enumerate(input_cols)}

    # Un-standardize predictions for reporting
    preds_raw = all_preds * y_std + y_mean
    predictions = {col: preds_raw[:, j].tolist() for j, col in enumerate(target_cols)}
    actuals = {col: Y_raw[:, j].tolist() for j, col in enumerate(target_cols)}

    return CrossModalResult(
        direction=direction,
        input_features=input_cols,
        target_features=target_cols,
        overall_r2=overall_r2,
        per_target_r2=per_target_r2,
        feature_importance=feature_importance,
        cell_ids=cell_ids,
        predictions=predictions,
        actuals=actuals,
    )
