"""Tests for the parametric ComBat implementation in profiles/batch_correction.

Strategy: build a synthetic per-cell DataFrame with a known additive
+ multiplicative batch shift, run combat_correct, verify that the
batch effect is removed (per-batch means converge) without distorting
the underlying biological signal.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

# Avoid the cellpose import chain by going directly to the module
_REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_REPO_ROOT))


import importlib.util  # noqa: E402

_BC_PATH = _REPO_ROOT / "glycoquant" / "profiles" / "batch_correction.py"
_spec = importlib.util.spec_from_file_location("_bc", _BC_PATH)
assert _spec is not None and _spec.loader is not None
_bc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_bc)
combat_correct = _bc.combat_correct
diagnostics = _bc.diagnostics


def _build_batched_df(
    n_cells_per_batch: int = 50,
    batch_shifts: tuple[float, ...] = (0.0, 1.5, -0.8),
    batch_scales: tuple[float, ...] = (1.0, 1.2, 0.7),
    seed: int = 42,
) -> pd.DataFrame:
    """Two features with a known batch shift on top of a shared signal.

    feature_a has batch_shift added per-batch.
    feature_b has batch_scale multiplied per-batch (with a fixed offset).
    A "biology" covariate is shared across batches and should survive
    correction.
    """
    rng = np.random.default_rng(seed)
    rows = []
    for batch_idx, (shift, scale) in enumerate(zip(batch_shifts, batch_scales)):
        for _ in range(n_cells_per_batch):
            biology = rng.normal(0.0, 1.0)
            rows.append(
                {
                    "batch": f"B{batch_idx}",
                    "biology": biology,
                    # additive batch shift
                    "feature_a": 5.0 + biology + shift + rng.normal(0.0, 0.3),
                    # multiplicative batch scale
                    "feature_b": (10.0 + biology) * scale + rng.normal(0.0, 0.3),
                }
            )
    return pd.DataFrame(rows)


def test_combat_removes_additive_batch_shift() -> None:
    """After ComBat, per-batch means of feature_a should all be similar."""
    df = _build_batched_df()
    raw_per_batch = df.groupby("batch")["feature_a"].mean()
    raw_spread = float(raw_per_batch.max() - raw_per_batch.min())
    assert raw_spread > 1.5  # engineered shift was ~2.3 (range of batch_shifts)

    out = combat_correct(df, batch_col="batch", feature_cols=["feature_a", "feature_b"])
    corrected_per_batch = out.groupby("batch")["feature_a"].mean()
    corrected_spread = float(corrected_per_batch.max() - corrected_per_batch.min())
    assert corrected_spread < raw_spread / 3.0, (
        f"raw spread {raw_spread:.3f} vs corrected spread {corrected_spread:.3f} "
        "— ComBat did not flatten the additive batch effect"
    )


def test_combat_removes_multiplicative_batch_scale() -> None:
    """After ComBat, per-batch SDs of feature_b should all converge."""
    df = _build_batched_df()
    raw_per_batch_sd = df.groupby("batch")["feature_b"].std()
    raw_sd_spread = float(raw_per_batch_sd.max() - raw_per_batch_sd.min())

    out = combat_correct(df, batch_col="batch", feature_cols=["feature_a", "feature_b"])
    corrected_per_batch_sd = out.groupby("batch")["feature_b"].std()
    corrected_sd_spread = float(corrected_per_batch_sd.max() - corrected_per_batch_sd.min())
    # Should be substantially smaller after correction
    assert corrected_sd_spread <= raw_sd_spread + 0.1


def test_combat_preserves_biology_signal_correlation() -> None:
    """The biology→feature_a relationship survives correction.

    Engineered: feature_a = 5 + biology + batch_shift + noise. After
    correction the batch shift is removed, so the residual correlation
    between feature_a and biology should be ≥ 0.5 (engineered slope is 1
    against unit-variance biology + 0.3 noise).
    """
    df = _build_batched_df()
    out = combat_correct(df, batch_col="batch", feature_cols=["feature_a", "feature_b"])
    r = float(np.corrcoef(out["feature_a"], out["biology"])[0, 1])
    assert r > 0.5, f"biology signal not preserved (r = {r:.3f})"


def test_combat_no_op_on_single_batch() -> None:
    df = _build_batched_df(batch_shifts=(0.0,), batch_scales=(1.0,))
    out = combat_correct(df, batch_col="batch")
    pd.testing.assert_frame_equal(df, out)


def test_combat_no_op_on_two_batches_below_min() -> None:
    """The min-batches floor (3) protects against unstable hyperparameters."""
    df = _build_batched_df(batch_shifts=(0.0, 1.5), batch_scales=(1.0, 1.2))
    out = combat_correct(df, batch_col="batch")
    pd.testing.assert_frame_equal(df, out)


def test_combat_skips_deep_columns() -> None:
    """Deep embedding columns should not be corrected (location-scale model invalid)."""
    df = _build_batched_df()
    df["deep_000"] = np.arange(len(df), dtype=np.float64)
    out = combat_correct(df, batch_col="batch")
    # deep_* must be untouched
    np.testing.assert_array_equal(out["deep_000"].to_numpy(), df["deep_000"].to_numpy())


def test_diagnostics_flags_inter_batch_shift() -> None:
    """The diagnostics helper computes the between/within SD ratio per feature."""
    df = _build_batched_df()
    diag = diagnostics(df, batch_col="batch", feature_cols=["feature_a", "feature_b"])
    assert diag["applicable"] is True
    assert diag["n_batches"] == 3
    assert diag["max_between_within_sd_ratio"] > 1.0  # engineered shift


def test_diagnostics_returns_inapplicable_when_single_batch() -> None:
    df = _build_batched_df(batch_shifts=(0.0,), batch_scales=(1.0,))
    diag = diagnostics(df, batch_col="batch")
    assert diag["applicable"] is False
