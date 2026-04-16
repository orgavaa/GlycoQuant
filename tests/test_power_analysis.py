"""Smoke tests for scripts/power_analysis.py.

The full power scan is slow (~30s at default settings) so we test the
helpers and a short scan only. Marker ``slow`` for the integration
test so CI can skip it by default.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pytest

# Make scripts/ importable
_REPO_ROOT = Path(__file__).resolve().parents[1]
_SCRIPTS = _REPO_ROOT / "scripts"
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

from power_analysis import (  # noqa: E402
    EFFECT_SIZES,
    TARGET_FEATURES,
    _build_cell_population,
    _per_cell_features,
    run_power_analysis,
)


def test_synthetic_population_renders_expected_cell_count() -> None:
    """The grid layout produces exactly n_cells masks (or fewer if grid full)."""
    rng = np.random.default_rng(0)
    image, mask = _build_cell_population(20, ring_intensity=1.0, rng=rng)
    cell_ids = sorted(int(v) for v in np.unique(mask) if v != 0)
    assert len(cell_ids) == 20
    # WGA ring is bright vs cytoplasm
    assert image.max() > 0
    assert image[mask > 0].mean() > 0


def test_per_cell_features_returns_all_target_columns() -> None:
    rng = np.random.default_rng(0)
    image, mask = _build_cell_population(10, ring_intensity=1.0, rng=rng)
    cell_ids = sorted(int(v) for v in np.unique(mask) if v != 0)
    cols = _per_cell_features(image, mask, cell_ids)
    assert set(cols) == set(TARGET_FEATURES)
    for f, vals in cols.items():
        assert len(vals) == len(cell_ids), f


def test_intensity_scaling_is_recovered_by_mean_intensity_feature() -> None:
    """A 1.5× WGA ring scaling must shift glycocalyx_mean_intensity 1.5×."""
    rng = np.random.default_rng(0)
    img1, mask1 = _build_cell_population(10, ring_intensity=1.0, rng=rng)
    rng2 = np.random.default_rng(0)  # same seed → same geometry
    img15, mask15 = _build_cell_population(10, ring_intensity=1.5, rng=rng2)

    f1 = _per_cell_features(
        img1, mask1, sorted(int(v) for v in np.unique(mask1) if v != 0)
    )
    f15 = _per_cell_features(
        img15, mask15, sorted(int(v) for v in np.unique(mask15) if v != 0)
    )

    mean1 = float(np.nanmean(f1["glycocalyx_mean_intensity"]))
    mean15 = float(np.nanmean(f15["glycocalyx_mean_intensity"]))
    # Within 15% of the engineered 1.5× scaling (noise + ring discretisation slack)
    ratio = mean15 / mean1
    assert 1.3 < ratio < 1.7, f"ratio {ratio:.3f} out of expected band [1.3, 1.7]"


@pytest.mark.slow
def test_run_power_analysis_short_scan_completes() -> None:
    """End-to-end: a short scan returns a FeaturePower per target."""
    out, diag = run_power_analysis(
        cells_per_arm=10,
        n_replicates=3,
        alpha=0.05,
        target_power=0.80,
        seed=0,
    )
    assert len(out) == len(TARGET_FEATURES)
    assert diag["effect_sizes"] == list(EFFECT_SIZES)
    # Every feature has a per_effect_power dict covering all sizes
    for fp in out:
        assert set(fp.per_effect_power.keys()) == set(EFFECT_SIZES)
