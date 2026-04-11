"""Tests for glycoquant.features.actin."""
from __future__ import annotations

import numpy as np
import pytest
from skimage.draw import disk

from glycoquant.features import extract_actin_features

IMAGE_SIZE = (512, 512)


@pytest.fixture(scope="module")
def cell_mask(cell_specs: list) -> np.ndarray:
    mask = np.zeros(IMAGE_SIZE, dtype=np.int32)
    for i, spec in enumerate(cell_specs, start=1):
        rr, cc = disk(spec.center, spec.cell_radius, shape=IMAGE_SIZE)
        mask[rr, cc] = i
    return mask


def _aligned_fibers_image(cell_mask: np.ndarray, cell_id: int) -> np.ndarray:
    """Construct an image with horizontal "fibers" inside the given cell.

    Alternating bright/dark rows at fiber spacing produce a strong
    gradient in the row direction and no gradient in the column
    direction, which the structure tensor should recognize as a
    highly coherent horizontal texture.
    """
    image = np.zeros(IMAGE_SIZE, dtype=np.float32)
    this_cell = cell_mask == cell_id
    ys, _ = np.indices(IMAGE_SIZE)
    # Horizontal fibers: bright every 4 rows
    pattern = (ys % 4 == 0).astype(np.float32)
    image[this_cell] = pattern[this_cell]
    return image


def _isotropic_noise_image(cell_mask: np.ndarray, cell_id: int, seed: int = 0) -> np.ndarray:
    """Construct an image with isotropic random noise inside the given cell."""
    rng = np.random.default_rng(seed)
    image = np.zeros(IMAGE_SIZE, dtype=np.float32)
    this_cell = cell_mask == cell_id
    image[this_cell] = rng.uniform(0.0, 1.0, size=int(this_cell.sum())).astype(np.float32)
    return image


def test_returns_expected_keys(
    synthetic_cell_image: np.ndarray,
    cell_mask: np.ndarray,
) -> None:
    features = extract_actin_features(synthetic_cell_image, cell_mask, cell_id=1)
    assert set(features.keys()) == {
        "actin_mean_intensity",
        "actin_stress_fiber_coherence",
        "actin_dominant_orientation",
        "actin_cortical_ratio",
    }


def test_aligned_fibers_have_high_coherence(cell_mask: np.ndarray) -> None:
    """Horizontal fibers give coherence close to 1.0."""
    image = _aligned_fibers_image(cell_mask, cell_id=1)
    features = extract_actin_features(image, cell_mask, cell_id=1)
    assert features["actin_stress_fiber_coherence"] > 0.6, (
        f"expected coherence > 0.6 on aligned fibers, got "
        f"{features['actin_stress_fiber_coherence']:.3f}"
    )


def test_isotropic_noise_has_lower_coherence(cell_mask: np.ndarray) -> None:
    """Random noise gives lower coherence than aligned fibers."""
    image = _isotropic_noise_image(cell_mask, cell_id=1)
    features = extract_actin_features(image, cell_mask, cell_id=1)
    assert features["actin_stress_fiber_coherence"] < 0.6


def test_coherence_is_bounded(
    synthetic_cell_image: np.ndarray,
    cell_mask: np.ndarray,
) -> None:
    features = extract_actin_features(synthetic_cell_image, cell_mask, cell_id=1)
    c = features["actin_stress_fiber_coherence"]
    assert 0.0 <= c <= 1.0


def test_orientation_in_valid_range(
    synthetic_cell_image: np.ndarray,
    cell_mask: np.ndarray,
) -> None:
    features = extract_actin_features(synthetic_cell_image, cell_mask, cell_id=1)
    angle = features["actin_dominant_orientation"]
    assert -90.0 <= angle <= 90.0


def test_dark_image_returns_zero_intensity(cell_mask: np.ndarray) -> None:
    image = np.zeros(IMAGE_SIZE, dtype=np.float32)
    features = extract_actin_features(image, cell_mask, cell_id=1)
    assert features["actin_mean_intensity"] == 0.0


def test_missing_cell_id_returns_nan(
    synthetic_cell_image: np.ndarray,
    cell_mask: np.ndarray,
) -> None:
    import math

    features = extract_actin_features(synthetic_cell_image, cell_mask, cell_id=999)
    assert all(math.isnan(v) for v in features.values())


def test_rejects_shape_mismatch(cell_mask: np.ndarray) -> None:
    wrong = np.zeros((256, 256), dtype=np.float32)
    with pytest.raises(ValueError, match="shape"):
        extract_actin_features(wrong, cell_mask, cell_id=1)


def test_rejects_non_2d(cell_mask: np.ndarray) -> None:
    bad = np.zeros((3, 512, 512), dtype=np.float32)
    with pytest.raises(ValueError, match="2D"):
        extract_actin_features(bad, cell_mask, cell_id=1)
