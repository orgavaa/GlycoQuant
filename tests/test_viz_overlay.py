"""Tests for glycoquant.viz.overlay shape builders."""
from __future__ import annotations

import numpy as np
import pytest
from skimage.draw import disk

from glycoquant.viz.overlay import (
    MAX_CELLS_FOR_OVERLAY,
    actin_orientation_segment,
    cell_outline_polygons,
    focal_adhesion_polygons,
    glycocalyx_ring_polygons,
    nuclear_outline_polygons,
)

IMAGE_SIZE = (512, 512)


@pytest.fixture(scope="module")
def cell_mask(cell_specs: list) -> np.ndarray:
    mask = np.zeros(IMAGE_SIZE, dtype=np.int32)
    for i, spec in enumerate(cell_specs, start=1):
        rr, cc = disk(spec.center, spec.cell_radius, shape=IMAGE_SIZE)
        mask[rr, cc] = i
    return mask


@pytest.fixture(scope="module")
def nuclear_mask(cell_specs: list) -> np.ndarray:
    mask = np.zeros(IMAGE_SIZE, dtype=np.int32)
    for i, spec in enumerate(cell_specs, start=1):
        rr, cc = disk(spec.center, spec.nuclear_radius, shape=IMAGE_SIZE)
        mask[rr, cc] = i
    return mask


# ---------------------------------------------------------------------------
# cell_outline_polygons / nuclear_outline_polygons
# ---------------------------------------------------------------------------


def test_cell_outlines_one_per_cell(
    cell_mask: np.ndarray, cell_specs: list
) -> None:
    polygons = cell_outline_polygons(cell_mask)
    assert set(polygons.keys()) == set(range(1, len(cell_specs) + 1))
    for contour in polygons.values():
        assert contour.ndim == 2
        assert contour.shape[1] == 2
        assert len(contour) > 10  # real contour, not a single point


def test_cell_outline_contours_are_inside_image(
    cell_mask: np.ndarray,
) -> None:
    polygons = cell_outline_polygons(cell_mask)
    h, w = cell_mask.shape
    for contour in polygons.values():
        assert (contour[:, 0] >= 0).all()
        assert (contour[:, 0] <= h).all()
        assert (contour[:, 1] >= 0).all()
        assert (contour[:, 1] <= w).all()


def test_cell_outlines_empty_mask_returns_empty_dict() -> None:
    empty = np.zeros(IMAGE_SIZE, dtype=np.int32)
    assert cell_outline_polygons(empty) == {}


def test_cell_outlines_rejects_non_2d() -> None:
    bad = np.zeros((3, 512, 512), dtype=np.int32)
    with pytest.raises(ValueError, match="2D"):
        cell_outline_polygons(bad)


def test_nuclear_outlines_match_cell_outlines_contract(
    nuclear_mask: np.ndarray, cell_specs: list
) -> None:
    polygons = nuclear_outline_polygons(nuclear_mask)
    assert set(polygons.keys()) == set(range(1, len(cell_specs) + 1))


def test_cell_outlines_fallback_to_centroids_above_threshold() -> None:
    """When the number of cells exceeds MAX_CELLS_FOR_OVERLAY, the builder
    returns (1, 2) centroid arrays instead of full contours.
    """
    # Construct a mask with MAX_CELLS_FOR_OVERLAY + 10 cells, each a single pixel
    n_cells = MAX_CELLS_FOR_OVERLAY + 10
    mask = np.zeros((1024, 1024), dtype=np.int32)
    for i in range(1, n_cells + 1):
        row = (i - 1) // 40
        col = (i - 1) % 40
        mask[row * 20 + 5, col * 20 + 5] = i

    polygons = cell_outline_polygons(mask)
    assert len(polygons) == n_cells
    # Every value should be a single centroid point
    for contour in polygons.values():
        assert contour.shape == (1, 2)


# ---------------------------------------------------------------------------
# glycocalyx_ring_polygons
# ---------------------------------------------------------------------------


def test_glycocalyx_ring_has_outer_larger_than_inner(
    cell_mask: np.ndarray,
) -> None:
    outer, inner = glycocalyx_ring_polygons(cell_mask, cell_id=1, ring_width_px=10)
    assert outer is not None
    assert inner is not None
    # Compare bounding boxes: outer must strictly enclose inner
    outer_bbox = (
        outer[:, 0].min(),
        outer[:, 1].min(),
        outer[:, 0].max(),
        outer[:, 1].max(),
    )
    inner_bbox = (
        inner[:, 0].min(),
        inner[:, 1].min(),
        inner[:, 0].max(),
        inner[:, 1].max(),
    )
    assert outer_bbox[0] <= inner_bbox[0]
    assert outer_bbox[1] <= inner_bbox[1]
    assert outer_bbox[2] >= inner_bbox[2]
    assert outer_bbox[3] >= inner_bbox[3]


def test_glycocalyx_ring_missing_cell_returns_none(cell_mask: np.ndarray) -> None:
    outer, inner = glycocalyx_ring_polygons(cell_mask, cell_id=999)
    assert outer is None
    assert inner is None


def test_glycocalyx_ring_rejects_invalid_width(cell_mask: np.ndarray) -> None:
    with pytest.raises(ValueError, match="positive"):
        glycocalyx_ring_polygons(cell_mask, cell_id=1, ring_width_px=0)


# ---------------------------------------------------------------------------
# focal_adhesion_polygons
# ---------------------------------------------------------------------------


def test_focal_adhesion_polygons_detects_fixture_puncta(
    synthetic_paxillin_image: np.ndarray,
    cell_mask: np.ndarray,
) -> None:
    """The fixture places 8 puncta per cell — detection via the overlay
    helper should find close to that number.
    """
    from glycoquant.features import FocalAdhesionParams

    params = FocalAdhesionParams(
        threshold_method="fixed",
        threshold_fixed=0.5,
        min_area_px=3,
        max_area_px=50,
    )
    polygons = focal_adhesion_polygons(
        synthetic_paxillin_image, cell_mask, cell_id=1, params=params
    )
    assert 6 <= len(polygons) <= 9
    for contour in polygons:
        assert contour.ndim == 2
        assert contour.shape[1] == 2


def test_focal_adhesion_polygons_dark_image_returns_empty(
    cell_mask: np.ndarray,
) -> None:
    dark = np.zeros(IMAGE_SIZE, dtype=np.float32)
    polygons = focal_adhesion_polygons(dark, cell_mask, cell_id=1)
    assert polygons == []


# ---------------------------------------------------------------------------
# actin_orientation_segment
# ---------------------------------------------------------------------------


def test_actin_orientation_segment_has_correct_angle(
    cell_mask: np.ndarray,
) -> None:
    """A horizontal fiber (orientation=0) produces a segment along the x-axis."""
    segment = actin_orientation_segment(
        cell_mask, cell_id=1, orientation_deg=0.0, length_px=40.0
    )
    assert segment is not None
    (y0, x0), (y1, x1) = segment
    # Horizontal fiber → small dy, large dx
    assert abs(y1 - y0) < 1e-6
    assert abs(abs(x1 - x0) - 40.0) < 1e-6


def test_actin_orientation_segment_vertical_fiber(cell_mask: np.ndarray) -> None:
    """Orientation=90° produces a segment along the y-axis."""
    segment = actin_orientation_segment(
        cell_mask, cell_id=1, orientation_deg=90.0, length_px=20.0
    )
    assert segment is not None
    (y0, x0), (y1, x1) = segment
    # Vertical fiber → large dy, small dx
    assert abs(abs(y1 - y0) - 20.0) < 1e-6
    assert abs(x1 - x0) < 1e-6


def test_actin_orientation_segment_diagonal(cell_mask: np.ndarray) -> None:
    """Orientation=45° produces a segment with equal dy and dx magnitudes."""
    segment = actin_orientation_segment(
        cell_mask, cell_id=1, orientation_deg=45.0, length_px=20.0
    )
    assert segment is not None
    (y0, x0), (y1, x1) = segment
    dy, dx = abs(y1 - y0), abs(x1 - x0)
    assert abs(dy - dx) < 0.1


def test_actin_orientation_segment_missing_cell_returns_none(
    cell_mask: np.ndarray,
) -> None:
    assert (
        actin_orientation_segment(
            cell_mask, cell_id=999, orientation_deg=0.0
        )
        is None
    )


def test_actin_orientation_segment_centered_on_centroid(
    cell_mask: np.ndarray, cell_specs: list
) -> None:
    """The segment midpoint should be at the cell centroid."""
    spec = cell_specs[0]
    segment = actin_orientation_segment(
        cell_mask, cell_id=1, orientation_deg=30.0, length_px=16.0
    )
    assert segment is not None
    (y0, x0), (y1, x1) = segment
    mid_y = (y0 + y1) / 2
    mid_x = (x0 + x1) / 2
    # Rasterised disk centroid should match the spec within 1 pixel
    assert abs(mid_y - spec.center[0]) < 1.0
    assert abs(mid_x - spec.center[1]) < 1.0
