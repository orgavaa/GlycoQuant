"""Tests for glycoquant.features.morphology."""
from __future__ import annotations

import math

import numpy as np
import pytest
from skimage.draw import disk

from glycoquant.features import extract_morphology_features

IMAGE_SIZE = (512, 512)


@pytest.fixture(scope="module")
def cell_mask(cell_specs: list) -> np.ndarray:
    mask = np.zeros(IMAGE_SIZE, dtype=np.int32)
    for i, spec in enumerate(cell_specs, start=1):
        rr, cc = disk(spec.center, spec.cell_radius, shape=IMAGE_SIZE)
        mask[rr, cc] = i
    return mask


def test_returns_expected_keys(cell_mask: np.ndarray) -> None:
    features = extract_morphology_features(cell_mask, cell_id=1)
    # Morphology now exposes the centroid — required by the spatial GNN
    # (Delaunay graph construction reads centroid_x / centroid_y from
    # the per-cell DataFrame). Previously only shape descriptors were
    # returned.
    assert set(features.keys()) == {
        "cell_area",
        "cell_perimeter",
        "cell_circularity",
        "cell_aspect_ratio",
        "cell_solidity",
        "cell_spread_area",
        "centroid_x",
        "centroid_y",
    }


def test_circular_cell_has_circularity_near_one(cell_mask: np.ndarray) -> None:
    """Synthetic disks should have circularity ≈ 1.0 and aspect_ratio ≈ 1.0."""
    for cell_id in range(1, 6):
        features = extract_morphology_features(cell_mask, cell_id=cell_id)
        assert features["cell_circularity"] == pytest.approx(1.0, abs=0.2), (
            f"cell {cell_id}: circularity = {features['cell_circularity']:.3f}"
        )
        assert features["cell_aspect_ratio"] == pytest.approx(1.0, abs=0.1)
        assert features["cell_solidity"] == pytest.approx(1.0, abs=0.05)


def test_area_matches_expected_disk_area(
    cell_mask: np.ndarray,
    cell_specs: list,
) -> None:
    """Rasterized disk area should be close to ``π r²``."""
    for i, spec in enumerate(cell_specs, start=1):
        features = extract_morphology_features(cell_mask, cell_id=i)
        expected = math.pi * spec.cell_radius * spec.cell_radius
        assert features["cell_area"] == pytest.approx(expected, rel=0.05)


def test_perimeter_is_positive(cell_mask: np.ndarray) -> None:
    features = extract_morphology_features(cell_mask, cell_id=1)
    assert features["cell_perimeter"] > 0.0


def test_spread_area_at_least_area(cell_mask: np.ndarray) -> None:
    """Convex hull area must be ≥ raw area (convex shapes: equal)."""
    features = extract_morphology_features(cell_mask, cell_id=1)
    assert features["cell_spread_area"] >= features["cell_area"] - 1.0


def test_elongated_shape_has_high_aspect_ratio() -> None:
    """A manually constructed elongated cell should have aspect_ratio >> 1."""
    mask = np.zeros(IMAGE_SIZE, dtype=np.int32)
    # 60x10 horizontal rectangle
    mask[250:260, 200:260] = 1
    features = extract_morphology_features(mask, cell_id=1)
    assert features["cell_aspect_ratio"] > 3.0


def test_missing_cell_id_returns_nan(cell_mask: np.ndarray) -> None:
    import math

    features = extract_morphology_features(cell_mask, cell_id=999)
    assert all(math.isnan(v) for v in features.values())


def test_rejects_non_2d() -> None:
    bad = np.zeros((3, 512, 512), dtype=np.int32)
    with pytest.raises(ValueError, match="2D"):
        extract_morphology_features(bad, cell_id=1)
