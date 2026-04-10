"""Overlay shape builders for Tab 1.

Pure Python, Streamlit-free. Each builder takes masks / per-cell
measurements and returns numpy arrays of (row, col) contour points or
line-segment endpoints. The Tab 1 Streamlit layer converts these to
Plotly ``go.Scatter`` traces; tests exercise the builders directly
without any Streamlit dependency.

Conventions
-----------
- All returned coordinates are in (row, col) pixel space, matching
  numpy indexing. The Streamlit layer flips to (x=col, y=row) when
  it hands arrays to Plotly.
- Functions that build per-cell structures return ``dict[int, ...]``
  keyed by ``cell_id`` (matching the ``cell_mask`` label values).
- Empty inputs return empty dicts / lists; never raise.
"""
from __future__ import annotations

import numpy as np
from scipy.ndimage import binary_dilation
from skimage.measure import find_contours, regionprops

from glycoquant.features.focal_adhesions import (
    FocalAdhesionParams,
    detect_focal_adhesions,
)

# Above this many cells, outline rendering becomes a Plotly performance
# bottleneck; the UI falls back to centroid scatter. Exported so Tab 1
# can surface a "rendering N of M cells as points" banner.
MAX_CELLS_FOR_OVERLAY = 500


# ---------------------------------------------------------------------------
# Cell and nucleus outlines
# ---------------------------------------------------------------------------


def cell_outline_polygons(cell_mask: np.ndarray) -> dict[int, np.ndarray]:
    """Per-cell contour polygons from a labeled mask.

    Parameters
    ----------
    cell_mask : np.ndarray
        Labeled integer mask, 0 = background, 1..N = cell IDs.

    Returns
    -------
    dict[int, np.ndarray]
        ``{cell_id: (M, 2) float array}``. Each array is a closed contour
        (first point repeated as last) in (row, col) coordinates. Cells
        with no detected contour are omitted.

    Notes
    -----
    When ``len(cell_ids) > MAX_CELLS_FOR_OVERLAY``, this function
    returns centroid *points* instead of full contours to keep the
    Plotly layer responsive. Each value is then a ``(1, 2)`` array.
    """
    if cell_mask.ndim != 2:
        raise ValueError(f"cell_mask must be 2D, got shape {cell_mask.shape}")
    if not cell_mask.any():
        return {}

    cell_ids = sorted(int(v) for v in np.unique(cell_mask).tolist() if v != 0)
    if len(cell_ids) > MAX_CELLS_FOR_OVERLAY:
        return _centroid_fallback(cell_mask, cell_ids)

    out: dict[int, np.ndarray] = {}
    for cell_id in cell_ids:
        contour = _largest_contour(cell_mask == cell_id)
        if contour is not None:
            out[cell_id] = contour
    return out


def nuclear_outline_polygons(nuclear_mask: np.ndarray) -> dict[int, np.ndarray]:
    """Per-nucleus contour polygons. Same contract as :func:`cell_outline_polygons`."""
    return cell_outline_polygons(nuclear_mask)


# ---------------------------------------------------------------------------
# Focal adhesion polygons
# ---------------------------------------------------------------------------


def focal_adhesion_polygons(
    paxillin_channel: np.ndarray,
    cell_mask: np.ndarray,
    cell_id: int,
    params: FocalAdhesionParams | None = None,
) -> list[np.ndarray]:
    """Per-FA contour polygons for a single cell.

    Delegates detection to :func:`glycoquant.features.focal_adhesions.detect_focal_adhesions`
    — the same function used by the scalar feature extractor — so FA
    geometry rendered in the UI matches FA counts in the feature table
    exactly.

    Parameters
    ----------
    paxillin_channel, cell_mask, cell_id, params
        Passed through to ``detect_focal_adhesions``.

    Returns
    -------
    list[np.ndarray]
        List of ``(M, 2)`` contour arrays, one per detected focal adhesion.
    """
    regions = detect_focal_adhesions(paxillin_channel, cell_mask, cell_id, params)
    polygons: list[np.ndarray] = []
    for region in regions:
        minr, minc, _, _ = region.bbox
        # Pad the local mask with a 1-pixel zero border so find_contours
        # always sees a closed 0 → 1 → 0 transition around the region
        # (essential for tiny regions that fill their own bounding box).
        local = region.image.astype(np.uint8)
        padded = np.pad(local, pad_width=1, mode="constant", constant_values=0)
        contours = find_contours(padded, level=0.5)
        if not contours:
            continue
        # Shift coordinates back to the full image frame, accounting for
        # both the bbox origin and the 1-pixel pad offset.
        shifted = contours[0] + np.array([minr - 1, minc - 1])
        polygons.append(shifted)
    return polygons


# ---------------------------------------------------------------------------
# Glycocalyx ring polygons
# ---------------------------------------------------------------------------


def glycocalyx_ring_polygons(
    cell_mask: np.ndarray,
    cell_id: int,
    ring_width_px: int = 10,
) -> tuple[np.ndarray | None, np.ndarray | None]:
    """Outer and inner contour of the pericellular glycocalyx ring.

    The outer contour is ``binary_dilation(cell_body, ring_width_px)``;
    the inner contour is the cell body itself. Together they delimit
    the ring ROI the glycocalyx feature extractor uses internally.

    Returns
    -------
    (outer, inner) : tuple
        Each is an ``(M, 2)`` contour array or ``None`` if the cell is
        absent from the mask. Both are returned so Tab 1 can render a
        filled ring via a single ``go.Scatter`` trace with
        ``fill="toself"``.
    """
    if cell_mask.ndim != 2:
        raise ValueError(f"cell_mask must be 2D, got shape {cell_mask.shape}")
    if ring_width_px <= 0:
        raise ValueError(f"ring_width_px must be positive, got {ring_width_px}")

    this_cell = cell_mask == cell_id
    if not this_cell.any():
        return None, None

    inner = _largest_contour(this_cell)
    dilated = binary_dilation(this_cell, iterations=ring_width_px)
    outer = _largest_contour(dilated)
    return outer, inner


# ---------------------------------------------------------------------------
# Actin orientation line segments
# ---------------------------------------------------------------------------


def actin_orientation_segment(
    cell_mask: np.ndarray,
    cell_id: int,
    orientation_deg: float,
    length_px: float = 40.0,
) -> tuple[tuple[float, float], tuple[float, float]] | None:
    """One line segment per cell centered at the centroid along the fiber axis.

    Parameters
    ----------
    cell_mask : np.ndarray
        Labeled integer mask.
    cell_id : int
        Which cell to build the segment for.
    orientation_deg : float
        Dominant fiber orientation in degrees, ``(−90, 90]``. This is
        the ``actin_dominant_orientation`` feature produced by
        :func:`glycoquant.features.actin.extract_actin_features`.
    length_px : float
        Total length of the segment in pixels (split in half around
        the centroid).

    Returns
    -------
    ((y0, x0), (y1, x1)) : tuple or None
        Two endpoints in (row, col) coordinates, or ``None`` if the
        cell is absent.
    """
    if cell_mask.ndim != 2:
        raise ValueError(f"cell_mask must be 2D, got shape {cell_mask.shape}")

    this_cell = (cell_mask == cell_id).astype(np.uint8)
    if not this_cell.any():
        return None

    props = regionprops(this_cell)
    if not props:
        return None
    cy, cx = props[0].centroid

    theta = np.radians(orientation_deg)
    half = float(length_px) / 2.0
    dy = half * np.sin(theta)
    dx = half * np.cos(theta)
    return (float(cy - dy), float(cx - dx)), (float(cy + dy), float(cx + dx))


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------


def _largest_contour(binary_mask: np.ndarray) -> np.ndarray | None:
    """Return the largest closed contour of a boolean mask, or ``None`` if empty.

    Uses ``skimage.measure.find_contours`` at the 0.5 level, which works
    on either boolean or ``{0, 1}`` integer masks.
    """
    if not binary_mask.any():
        return None
    contours = find_contours(binary_mask.astype(np.uint8), level=0.5)
    if not contours:
        return None
    # Pick the longest contour in case the mask has noise / small components
    longest = max(contours, key=len)
    return longest


def _centroid_fallback(
    cell_mask: np.ndarray, cell_ids: list[int]
) -> dict[int, np.ndarray]:
    """Fallback for large cell counts: return centroid points instead of outlines."""
    out: dict[int, np.ndarray] = {}
    for cell_id in cell_ids:
        this_cell = (cell_mask == cell_id).astype(np.uint8)
        if not this_cell.any():
            continue
        props = regionprops(this_cell)
        if not props:
            continue
        cy, cx = props[0].centroid
        out[cell_id] = np.array([[cy, cx]], dtype=np.float64)
    return out
