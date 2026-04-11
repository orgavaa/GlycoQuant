"""Tests for glycoquant.features.nuclear_morphology."""
from __future__ import annotations

import math

import numpy as np
import pytest
from skimage.draw import disk

from glycoquant.features import extract_nuclear_morphology_features

IMAGE_SIZE = (256, 256)


@pytest.fixture
def round_masks() -> tuple[np.ndarray, np.ndarray]:
    """Cell = radius-50 disk, nucleus = radius-20 disk (both at image center)."""
    cell = np.zeros(IMAGE_SIZE, dtype=np.int32)
    nucleus = np.zeros(IMAGE_SIZE, dtype=np.int32)
    rr, cc = disk((128, 128), 50, shape=IMAGE_SIZE)
    cell[rr, cc] = 1
    rr, cc = disk((128, 128), 20, shape=IMAGE_SIZE)
    nucleus[rr, cc] = 1
    return cell, nucleus


def test_returns_expected_keys(round_masks: tuple[np.ndarray, np.ndarray]) -> None:
    cell, nucleus = round_masks
    feats = extract_nuclear_morphology_features(cell, nucleus, cell_id=1)
    assert set(feats.keys()) == {
        "nuclear_area",
        "nuclear_perimeter",
        "nuclear_circularity",
        "nuclear_aspect_ratio",
        "nuclear_solidity",
        "nuclear_eccentricity",
        "nuclear_to_cell_area_ratio",
    }


def test_round_nucleus_has_near_unit_circularity(
    round_masks: tuple[np.ndarray, np.ndarray],
) -> None:
    cell, nucleus = round_masks
    feats = extract_nuclear_morphology_features(cell, nucleus, cell_id=1)
    assert 0.8 < feats["nuclear_circularity"] <= 1.05
    assert 0.95 <= feats["nuclear_aspect_ratio"] <= 1.15
    assert feats["nuclear_solidity"] > 0.9  # convex disk ≈ solidity 1


def test_nuclear_to_cell_area_ratio_matches_geometry(
    round_masks: tuple[np.ndarray, np.ndarray],
) -> None:
    """Disk areas ≈ π r² so the ratio ≈ (20/50)² = 0.16."""
    cell, nucleus = round_masks
    feats = extract_nuclear_morphology_features(cell, nucleus, cell_id=1)
    assert 0.12 < feats["nuclear_to_cell_area_ratio"] < 0.20


def test_missing_nucleus_returns_nan(round_masks: tuple[np.ndarray, np.ndarray]) -> None:
    cell, nucleus = round_masks
    feats = extract_nuclear_morphology_features(cell, nucleus, cell_id=999)
    assert all(math.isnan(v) for v in feats.values())


def test_shape_mismatch_raises(round_masks: tuple[np.ndarray, np.ndarray]) -> None:
    cell, _ = round_masks
    wrong = np.zeros((128, 128), dtype=np.int32)
    with pytest.raises(ValueError, match="shape"):
        extract_nuclear_morphology_features(cell, wrong, cell_id=1)
