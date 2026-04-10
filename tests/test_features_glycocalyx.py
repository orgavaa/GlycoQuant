"""Tests for glycoquant.features.glycocalyx.

Pure Python, no Cellpose — a deterministic labeled cell mask is
constructed from ``cell_specs`` so the tests run in <1 s on any
machine without GPU or network.
"""
from __future__ import annotations

import numpy as np
import pytest
from skimage.draw import disk

from glycoquant.features import GlycocalyxParams, extract_glycocalyx_features


@pytest.fixture(scope="module")
def cell_mask(cell_specs: list) -> np.ndarray:
    """Labeled integer mask: 0 = background, 1..N = cell IDs, from cell_specs."""
    image_size = (512, 512)
    mask = np.zeros(image_size, dtype=np.int32)
    for i, spec in enumerate(cell_specs, start=1):
        rr, cc = disk(spec.center, spec.cell_radius, shape=image_size)
        mask[rr, cc] = i
    return mask


def test_returns_expected_keys(
    synthetic_glycocalyx_image: np.ndarray,
    cell_mask: np.ndarray,
) -> None:
    """Output dict has the six documented feature keys, no extras."""
    features = extract_glycocalyx_features(synthetic_glycocalyx_image, cell_mask, cell_id=1)

    expected = {
        "glycocalyx_mean_intensity",
        "glycocalyx_heterogeneity",
        "glycocalyx_coverage",
        "glycocalyx_pericellular_ratio",
        "glycocalyx_radial_profile",
        "glycocalyx_radial_decay_rate",
    }
    assert set(features.keys()) == expected


def test_radial_profile_has_configured_length(
    synthetic_glycocalyx_image: np.ndarray,
    cell_mask: np.ndarray,
) -> None:
    """Radial profile length matches ``params.n_radial_bins``."""
    params = GlycocalyxParams(n_radial_bins=25)
    features = extract_glycocalyx_features(
        synthetic_glycocalyx_image, cell_mask, cell_id=1, params=params
    )
    profile = features["glycocalyx_radial_profile"]
    assert isinstance(profile, list)
    assert len(profile) == 25


def test_ring_fixture_has_bright_pericellular_signal(
    synthetic_glycocalyx_image: np.ndarray,
    cell_mask: np.ndarray,
    cell_specs: list,
) -> None:
    """On the ring fixture, the pericellular ratio is high for every cell.

    The ring intensity is ~1.0 and the cell interior is 0 by construction,
    so the ratio hits the finite sentinel for each cell.
    """
    for cell_id in range(1, len(cell_specs) + 1):
        features = extract_glycocalyx_features(
            synthetic_glycocalyx_image, cell_mask, cell_id=cell_id
        )
        assert features["glycocalyx_mean_intensity"] > 0.3, (
            f"cell {cell_id}: ring intensity {features['glycocalyx_mean_intensity']}"
        )
        assert features["glycocalyx_pericellular_ratio"] > 1.0, (
            f"cell {cell_id}: ratio {features['glycocalyx_pericellular_ratio']}"
        )


def test_uniform_image_has_near_zero_heterogeneity(cell_mask: np.ndarray) -> None:
    """Uniform intensity across the ring yields CV ≈ 0 and coverage = 1.0."""
    uniform = np.ones((512, 512), dtype=np.float32)
    features = extract_glycocalyx_features(uniform, cell_mask, cell_id=1)

    assert features["glycocalyx_heterogeneity"] == pytest.approx(0.0, abs=1e-6)
    assert features["glycocalyx_coverage"] == pytest.approx(1.0, abs=1e-6)
    assert features["glycocalyx_mean_intensity"] == pytest.approx(1.0, abs=1e-6)


def test_dark_image_has_zero_features(cell_mask: np.ndarray) -> None:
    """All-zero glycocalyx channel yields zero intensity-based features."""
    dark = np.zeros((512, 512), dtype=np.float32)
    features = extract_glycocalyx_features(dark, cell_mask, cell_id=1)

    assert features["glycocalyx_mean_intensity"] == 0.0
    assert features["glycocalyx_heterogeneity"] == 0.0
    assert features["glycocalyx_pericellular_ratio"] == 0.0
    assert all(v == 0.0 for v in features["glycocalyx_radial_profile"])


def test_missing_cell_id_returns_zero_features(
    synthetic_glycocalyx_image: np.ndarray,
    cell_mask: np.ndarray,
) -> None:
    """A cell_id not present in the mask yields an all-zero feature dict."""
    features = extract_glycocalyx_features(
        synthetic_glycocalyx_image, cell_mask, cell_id=999
    )
    assert features["glycocalyx_mean_intensity"] == 0.0
    assert features["glycocalyx_pericellular_ratio"] == 0.0
    assert features["glycocalyx_coverage"] == 0.0


def test_pericellular_ratio_capped_at_sentinel(cell_mask: np.ndarray) -> None:
    """When the interior is dark but the ring is bright, ratio hits the finite sentinel.

    Guards downstream clustering / correlation code against ``inf``.
    """
    from glycoquant.features.glycocalyx import _PERICELLULAR_RATIO_MAX

    image = np.zeros((512, 512), dtype=np.float32)
    # Ring: dilate cell 1 and set pericellular band to 1.0
    from scipy.ndimage import binary_dilation

    this_cell = cell_mask == 1
    dilated = binary_dilation(this_cell, iterations=10)
    image[dilated & ~this_cell] = 1.0

    features = extract_glycocalyx_features(image, cell_mask, cell_id=1)
    assert features["glycocalyx_pericellular_ratio"] == _PERICELLULAR_RATIO_MAX
    assert np.isfinite(features["glycocalyx_pericellular_ratio"])


def test_coverage_percentile_method(cell_mask: np.ndarray) -> None:
    """Percentile thresholding behaves deterministically on a uniform ring."""
    # Construct a ring around cell 1 with a gradient: half bright, half dim
    image = np.zeros((512, 512), dtype=np.float32)
    from scipy.ndimage import binary_dilation

    this_cell = cell_mask == 1
    ring = binary_dilation(this_cell, iterations=10) & ~this_cell
    ring_coords = np.argwhere(ring)
    # Top half bright, bottom half dim
    center_y = ring_coords[:, 0].mean()
    for y, x in ring_coords:
        image[y, x] = 1.0 if y < center_y else 0.1

    params = GlycocalyxParams(
        coverage_threshold_method="percentile",
        coverage_threshold_percentile=50.0,
    )
    features = extract_glycocalyx_features(image, cell_mask, cell_id=1, params=params)
    # ~50% of ring pixels should be above the 50th percentile
    assert 0.3 < features["glycocalyx_coverage"] < 0.7


def test_coverage_fixed_method(cell_mask: np.ndarray) -> None:
    """Fixed-threshold coverage counts pixels above a literal value."""
    uniform = np.full((512, 512), 0.8, dtype=np.float32)
    params = GlycocalyxParams(
        coverage_threshold_method="fixed",
        coverage_threshold_fixed=0.5,
    )
    features = extract_glycocalyx_features(uniform, cell_mask, cell_id=1, params=params)
    assert features["glycocalyx_coverage"] == pytest.approx(1.0, abs=1e-6)

    params = GlycocalyxParams(
        coverage_threshold_method="fixed",
        coverage_threshold_fixed=0.9,
    )
    features = extract_glycocalyx_features(uniform, cell_mask, cell_id=1, params=params)
    assert features["glycocalyx_coverage"] == pytest.approx(0.0, abs=1e-6)


def test_rejects_shape_mismatch(cell_mask: np.ndarray) -> None:
    """Channel and mask must share the same shape."""
    wrong_shape = np.zeros((256, 256), dtype=np.float32)
    with pytest.raises(ValueError, match="shape"):
        extract_glycocalyx_features(wrong_shape, cell_mask, cell_id=1)


def test_rejects_non_2d(cell_mask: np.ndarray) -> None:
    """Non-2D input raises ValueError."""
    bad = np.zeros((3, 512, 512), dtype=np.float32)
    with pytest.raises(ValueError, match="2D"):
        extract_glycocalyx_features(bad, cell_mask, cell_id=1)


def test_heterogeneity_is_positive_on_noisy_ring(cell_mask: np.ndarray) -> None:
    """A noisy (non-uniform) ring yields a positive coefficient of variation."""
    from scipy.ndimage import binary_dilation

    image = np.zeros((512, 512), dtype=np.float32)
    this_cell = cell_mask == 1
    ring = binary_dilation(this_cell, iterations=10) & ~this_cell
    rng = np.random.default_rng(0)
    image[ring] = rng.uniform(0.2, 1.0, size=int(ring.sum())).astype(np.float32)

    features = extract_glycocalyx_features(image, cell_mask, cell_id=1)
    assert features["glycocalyx_heterogeneity"] > 0.1


def test_radial_profile_peaks_at_ring_radius(
    synthetic_glycocalyx_image: np.ndarray,
    cell_mask: np.ndarray,
) -> None:
    """On the ring fixture, the radial profile's maximum bin is near the cell edge.

    The profile spans the cell body (dark) plus the pericellular ring (bright),
    so the brightest bin should sit in the outer half of the profile.
    """
    features = extract_glycocalyx_features(synthetic_glycocalyx_image, cell_mask, cell_id=1)
    profile = np.array(features["glycocalyx_radial_profile"])
    n = len(profile)
    peak_bin = int(np.argmax(profile))
    assert peak_bin >= n // 2, (
        f"expected peak in outer half of profile, got bin {peak_bin} of {n}"
    )
    assert profile[peak_bin] > profile[0], (
        "outer ring intensity should exceed cell-center intensity"
    )
