"""Tests for glycoquant.features.yap."""
from __future__ import annotations

import math

import numpy as np
import pytest
from skimage.draw import disk

from glycoquant.features import extract_yap_features

IMAGE_SIZE = (512, 512)


@pytest.fixture(scope="module")
def cell_mask(cell_specs: list) -> np.ndarray:
    """Labeled cell mask from cell_specs."""
    mask = np.zeros(IMAGE_SIZE, dtype=np.int32)
    for i, spec in enumerate(cell_specs, start=1):
        rr, cc = disk(spec.center, spec.cell_radius, shape=IMAGE_SIZE)
        mask[rr, cc] = i
    return mask


@pytest.fixture(scope="module")
def nuclear_mask(cell_specs: list) -> np.ndarray:
    """Labeled nuclear mask with IDs matching cell_mask."""
    mask = np.zeros(IMAGE_SIZE, dtype=np.int32)
    for i, spec in enumerate(cell_specs, start=1):
        rr, cc = disk(spec.center, spec.nuclear_radius, shape=IMAGE_SIZE)
        mask[rr, cc] = i
    return mask


def test_returns_expected_keys(
    synthetic_yap_image: np.ndarray,
    cell_mask: np.ndarray,
    nuclear_mask: np.ndarray,
) -> None:
    features = extract_yap_features(synthetic_yap_image, cell_mask, nuclear_mask, cell_id=1)
    assert set(features.keys()) == {
        "yap_nuclear_intensity",
        "yap_cytoplasmic_intensity",
        "yap_nc_ratio",
        "yap_nuclear_fraction",
    }


def test_nc_ratio_matches_ground_truth(
    synthetic_yap_image: np.ndarray,
    cell_mask: np.ndarray,
    nuclear_mask: np.ndarray,
    cell_specs: list,
) -> None:
    """Synthetic fixture has nuclear=2.0 and cytoplasmic=1.0, so ratio should be 2.0."""
    for cell_id in range(1, len(cell_specs) + 1):
        features = extract_yap_features(
            synthetic_yap_image, cell_mask, nuclear_mask, cell_id=cell_id
        )
        assert features["yap_nuclear_intensity"] == pytest.approx(2.0, abs=1e-6)
        assert features["yap_cytoplasmic_intensity"] == pytest.approx(1.0, abs=1e-6)
        assert features["yap_nc_ratio"] == pytest.approx(2.0, abs=1e-6)


def test_nuclear_fraction_is_in_unit_interval(
    synthetic_yap_image: np.ndarray,
    cell_mask: np.ndarray,
    nuclear_mask: np.ndarray,
) -> None:
    features = extract_yap_features(synthetic_yap_image, cell_mask, nuclear_mask, cell_id=1)
    assert 0.0 <= features["yap_nuclear_fraction"] <= 1.0


def test_zero_cytoplasm_returns_nan(
    cell_mask: np.ndarray,
    nuclear_mask: np.ndarray,
) -> None:
    """Dark cytoplasm + bright nucleus → NaN ratio (division undefined).

    Earlier versions returned a finite sentinel (1000.0) here, which
    silently biased per-condition means. NaN is the scientifically
    honest signal; downstream aggregations must use ``nanmean``.
    """
    image = np.zeros(IMAGE_SIZE, dtype=np.float32)
    image[nuclear_mask == 1] = 5.0  # bright nucleus, dark cytoplasm

    features = extract_yap_features(image, cell_mask, nuclear_mask, cell_id=1)
    assert math.isnan(features["yap_nc_ratio"])


def test_dark_image_returns_nan(
    cell_mask: np.ndarray,
    nuclear_mask: np.ndarray,
) -> None:
    """Uniformly-dark image → every intensity feature is NaN."""
    image = np.zeros(IMAGE_SIZE, dtype=np.float32)
    features = extract_yap_features(image, cell_mask, nuclear_mask, cell_id=1)
    # Mean intensity inside the cell is a real zero → 0.0 is defensible,
    # but the NC ratio and nuclear fraction are both undefined → NaN.
    assert features["yap_nuclear_intensity"] == 0.0
    assert features["yap_cytoplasmic_intensity"] == 0.0
    assert math.isnan(features["yap_nc_ratio"])
    assert math.isnan(features["yap_nuclear_fraction"])


def test_missing_cell_id_returns_nan(
    synthetic_yap_image: np.ndarray,
    cell_mask: np.ndarray,
    nuclear_mask: np.ndarray,
) -> None:
    features = extract_yap_features(synthetic_yap_image, cell_mask, nuclear_mask, cell_id=999)
    assert all(math.isnan(v) for v in features.values())


def test_rejects_shape_mismatch(
    cell_mask: np.ndarray,
    nuclear_mask: np.ndarray,
) -> None:
    wrong = np.zeros((256, 256), dtype=np.float32)
    with pytest.raises(ValueError, match="shape"):
        extract_yap_features(wrong, cell_mask, nuclear_mask, cell_id=1)


def test_rejects_non_2d(
    synthetic_yap_image: np.ndarray,
    nuclear_mask: np.ndarray,
) -> None:
    bad = np.zeros((3, 512, 512), dtype=np.int32)
    with pytest.raises(ValueError, match="2D"):
        extract_yap_features(synthetic_yap_image, bad, nuclear_mask, cell_id=1)
