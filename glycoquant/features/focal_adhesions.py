"""Focal adhesion morphometrics from paxillin fluorescence staining.

Focal adhesions (FAs) are integrin-based anchors linking the actin
cytoskeleton to the extracellular matrix. Their number, size, shape,
and distribution report on mechanotransduction state — mature,
elongated, peripheral FAs indicate an adhering, force-transmitting
cell; nascent, small, uniform FAs indicate a non-adherent state.

Paxillin is the standard IF marker for FAs. Bright puncta inside the
cytoplasm are thresholded, labeled as connected components, filtered
by area, and summarized per cell via ``skimage.measure.regionprops``.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy.ndimage import distance_transform_edt
from skimage.filters import threshold_otsu
from skimage.measure import label, regionprops


@dataclass(frozen=True)
class FocalAdhesionParams:
    """Parameters controlling focal adhesion detection and filtering.

    Defaults mirror ``configs/default.yaml → features.focal_adhesions``.
    """

    threshold_method: str = "otsu"  # "otsu" | "fixed"
    threshold_fixed: float = 0.5
    min_area_px: int = 5
    max_area_px: int = 500
    peripheral_distance_px: int = 20


def detect_focal_adhesions(
    paxillin_channel: np.ndarray,
    cell_mask: np.ndarray,
    cell_id: int,
    params: FocalAdhesionParams | None = None,
) -> list:
    """Detect focal adhesions inside a single cell and return per-FA regionprops.

    Thresholds the paxillin signal restricted to ``cell_mask == cell_id``,
    runs 8-connectivity ``label``, wraps into ``regionprops``, and filters
    by ``params.min_area_px..max_area_px``. The returned list is the
    single source of truth for FA detection in GlycoQuant — it is
    consumed both by ``extract_fa_features`` (which aggregates scalars)
    and by ``glycoquant.viz.overlay`` (which rasterises per-FA contours
    for the Tab 1 overlay).

    Parameters
    ----------
    paxillin_channel : np.ndarray
        2D fluorescence image of the paxillin channel.
    cell_mask : np.ndarray
        Labeled integer mask, 0 = background, 1..N = cell IDs.
    cell_id : int
        Which cell to profile.
    params : FocalAdhesionParams, optional

    Returns
    -------
    list
        List of ``skimage.measure._regionprops.RegionProperties`` instances,
        one per detected focal adhesion surviving the area filter. Empty
        list if no cell, no signal above threshold, or no components
        survive filtering.

    Raises
    ------
    ValueError
        On non-2D input or shape mismatch.
    """
    if paxillin_channel.ndim != 2:
        raise ValueError(
            f"paxillin_channel must be 2D, got shape {paxillin_channel.shape}"
        )
    if cell_mask.ndim != 2:
        raise ValueError(f"cell_mask must be 2D, got shape {cell_mask.shape}")
    if paxillin_channel.shape != cell_mask.shape:
        raise ValueError(
            f"shape mismatch: paxillin {paxillin_channel.shape}, cell {cell_mask.shape}"
        )

    p = params or FocalAdhesionParams()
    this_cell = cell_mask == cell_id
    if not this_cell.any():
        return []

    # Threshold paxillin signal, restricted to the cell mask
    cell_values = paxillin_channel[this_cell]
    threshold = _compute_threshold(cell_values, p)
    bright = (paxillin_channel > threshold) & this_cell

    if not bright.any():
        return []

    labeled = label(bright, connectivity=2)
    regions = [
        r for r in regionprops(labeled) if p.min_area_px <= r.area <= p.max_area_px
    ]
    return regions


def extract_fa_features(
    paxillin_channel: np.ndarray,
    cell_mask: np.ndarray,
    cell_id: int,
    params: FocalAdhesionParams | None = None,
) -> dict[str, float]:
    """Aggregate focal-adhesion morphometrics into scalar features for a cell.

    Thin wrapper over :func:`detect_focal_adhesions` that computes the
    summary statistics consumed by the per-cell feature table.

    Returns
    -------
    dict[str, float]
        Keys:
        - fa_count                  : number of focal adhesions
        - fa_mean_area              : mean FA area (px)
        - fa_total_area             : total FA area (px)
        - fa_mean_elongation        : mean axis_major / axis_minor
        - fa_mean_distance_to_edge  : mean distance of FA centroids to cell edge (px)
        - fa_peripheral_fraction    : fraction of FAs within ``peripheral_distance_px`` of edge
    """
    regions = detect_focal_adhesions(paxillin_channel, cell_mask, cell_id, params)
    if not regions:
        return _zero_features()

    p = params or FocalAdhesionParams()
    this_cell = cell_mask == cell_id
    # Distance transform: each pixel inside the cell → distance to nearest
    # non-cell pixel (i.e., distance to the cell edge)
    distance_to_edge = distance_transform_edt(this_cell)

    areas = np.array([r.area for r in regions], dtype=np.float64)
    elongations = np.array([_elongation(r) for r in regions], dtype=np.float64)
    distances = np.array([_centroid_distance(r, distance_to_edge) for r in regions])

    peripheral_count = int(np.sum(distances <= p.peripheral_distance_px))

    return {
        "fa_count": float(len(regions)),
        "fa_mean_area": float(areas.mean()),
        "fa_total_area": float(areas.sum()),
        "fa_mean_elongation": float(elongations.mean()),
        "fa_mean_distance_to_edge": float(distances.mean()),
        "fa_peripheral_fraction": peripheral_count / len(regions),
    }


def _compute_threshold(values: np.ndarray, params: FocalAdhesionParams) -> float:
    """Otsu or fixed threshold for FA detection inside the cell."""
    if values.size == 0:
        return float("inf")
    if params.threshold_method == "fixed":
        return float(params.threshold_fixed)
    if params.threshold_method == "otsu":
        unique = np.unique(values)
        if unique.size < 2:
            return float("inf")  # uniform signal → nothing passes
        return float(threshold_otsu(values))
    raise ValueError(f"unknown threshold_method: {params.threshold_method}")


def _elongation(region) -> float:  # noqa: ANN001 - skimage region object
    """major_axis / minor_axis; returns 1.0 if minor axis is zero."""
    major = region.axis_major_length
    minor = region.axis_minor_length
    if minor <= 0.0:
        return 1.0
    return float(major / minor)


def _centroid_distance(region, distance_to_edge: np.ndarray) -> float:  # noqa: ANN001
    """Distance from the FA centroid to the cell boundary, in pixels."""
    cy, cx = (int(round(c)) for c in region.centroid)
    cy = int(np.clip(cy, 0, distance_to_edge.shape[0] - 1))
    cx = int(np.clip(cx, 0, distance_to_edge.shape[1] - 1))
    return float(distance_to_edge[cy, cx])


def _zero_features() -> dict[str, float]:
    return {
        "fa_count": 0.0,
        "fa_mean_area": 0.0,
        "fa_total_area": 0.0,
        "fa_mean_elongation": 0.0,
        "fa_mean_distance_to_edge": 0.0,
        "fa_peripheral_fraction": 0.0,
    }
