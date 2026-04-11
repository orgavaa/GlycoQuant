"""Tests for glycoquant.features.focal_adhesions."""
from __future__ import annotations

import numpy as np
import pytest
from skimage.draw import disk

from glycoquant.features import FocalAdhesionParams, extract_fa_features

IMAGE_SIZE = (512, 512)


@pytest.fixture(scope="module")
def cell_mask(cell_specs: list) -> np.ndarray:
    mask = np.zeros(IMAGE_SIZE, dtype=np.int32)
    for i, spec in enumerate(cell_specs, start=1):
        rr, cc = disk(spec.center, spec.cell_radius, shape=IMAGE_SIZE)
        mask[rr, cc] = i
    return mask


def test_returns_expected_keys(
    synthetic_paxillin_image: np.ndarray,
    cell_mask: np.ndarray,
) -> None:
    features = extract_fa_features(synthetic_paxillin_image, cell_mask, cell_id=1)
    assert set(features.keys()) == {
        "fa_count",
        "fa_density_per_um2",
        "fa_mean_area",
        "fa_total_area",
        "fa_mean_area_um2",
        "fa_total_area_um2",
        "fa_mean_elongation",
        "fa_mean_distance_to_edge",
        "fa_mean_distance_to_edge_um",
        "fa_peripheral_fraction",
        "fa_mean_orientation_alignment",
        "fa_nascent_count",
        "fa_focal_complex_count",
        "fa_mature_count",
        "fa_fibrillar_count",
        "fa_mature_fraction",
    }


def test_finds_expected_number_of_puncta(
    synthetic_paxillin_image: np.ndarray,
    cell_mask: np.ndarray,
    cell_specs: list,
) -> None:
    """The fixture places 8 puncta per cell (radius=2, area ≈ 12 px each).

    With Otsu thresholding inside the cell and the default area filter,
    every cell should yield close to 8 detected FAs. Allow ±1 for edge
    cases where puncta straddle the cell boundary after rounding.
    """
    params = FocalAdhesionParams(
        threshold_method="fixed",
        threshold_fixed=0.5,
        min_area_px=3,
        max_area_px=50,
    )
    for cell_id in range(1, len(cell_specs) + 1):
        features = extract_fa_features(
            synthetic_paxillin_image, cell_mask, cell_id=cell_id, params=params
        )
        count = int(features["fa_count"])
        assert 6 <= count <= 9, f"cell {cell_id}: got {count} FAs"


def test_area_stats_are_positive(
    synthetic_paxillin_image: np.ndarray,
    cell_mask: np.ndarray,
) -> None:
    params = FocalAdhesionParams(
        threshold_method="fixed", threshold_fixed=0.5, min_area_px=3, max_area_px=50
    )
    features = extract_fa_features(
        synthetic_paxillin_image, cell_mask, cell_id=1, params=params
    )
    assert features["fa_mean_area"] > 0.0
    assert features["fa_total_area"] >= features["fa_mean_area"]


def test_puncta_are_peripheral_on_fixture(
    synthetic_paxillin_image: np.ndarray,
    cell_mask: np.ndarray,
) -> None:
    """The fixture places puncta between 75% and 95% of the cell radius —
    all puncta should fall within a generous peripheral band.
    """
    params = FocalAdhesionParams(
        threshold_method="fixed",
        threshold_fixed=0.5,
        min_area_px=3,
        max_area_px=50,
        peripheral_distance_px=15,
    )
    features = extract_fa_features(
        synthetic_paxillin_image, cell_mask, cell_id=1, params=params
    )
    assert features["fa_peripheral_fraction"] >= 0.8


def test_dark_image_returns_zero_count_nan_shape(cell_mask: np.ndarray) -> None:
    """No FA detected → count=0 (honest), per-FA shape stats = NaN (undefined)."""
    import math

    image = np.zeros(IMAGE_SIZE, dtype=np.float32)
    features = extract_fa_features(image, cell_mask, cell_id=1)
    assert features["fa_count"] == 0.0
    assert features["fa_total_area"] == 0.0
    assert math.isnan(features["fa_mean_area"])
    assert math.isnan(features["fa_peripheral_fraction"])


def test_missing_cell_id_returns_zero_count_nan_shape(
    synthetic_paxillin_image: np.ndarray,
    cell_mask: np.ndarray,
) -> None:
    import math

    features = extract_fa_features(
        synthetic_paxillin_image, cell_mask, cell_id=999
    )
    assert features["fa_count"] == 0.0
    assert math.isnan(features["fa_mean_elongation"])


def test_area_filter_drops_tiny_components(
    cell_mask: np.ndarray,
) -> None:
    """Setting min_area very high should exclude all synthetic puncta."""
    params = FocalAdhesionParams(
        threshold_method="fixed",
        threshold_fixed=0.5,
        min_area_px=1000,
        max_area_px=5000,
    )
    # Construct a small-puncta image inline
    image = np.zeros(IMAGE_SIZE, dtype=np.float32)
    rr, cc = disk((130, 120), 2, shape=IMAGE_SIZE)
    image[rr, cc] = 1.0
    features = extract_fa_features(image, cell_mask, cell_id=1, params=params)
    assert features["fa_count"] == 0.0


def test_rejects_shape_mismatch(cell_mask: np.ndarray) -> None:
    wrong = np.zeros((256, 256), dtype=np.float32)
    with pytest.raises(ValueError, match="shape"):
        extract_fa_features(wrong, cell_mask, cell_id=1)


def test_rejects_non_2d(cell_mask: np.ndarray) -> None:
    bad = np.zeros((3, 512, 512), dtype=np.float32)
    with pytest.raises(ValueError, match="2D"):
        extract_fa_features(bad, cell_mask, cell_id=1)
