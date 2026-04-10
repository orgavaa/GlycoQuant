"""Cell morphology features from the labeled cell mask.

Pure geometric descriptors computed via
``skimage.measure.regionprops``: area, perimeter, circularity, aspect
ratio, solidity, and spread area (convex hull area). These are the
baseline shape features that feed the mechanotransduction signature
alongside YAP, focal-adhesion, and actin readouts.
"""
from __future__ import annotations

import math

import numpy as np
from skimage.measure import regionprops


def extract_morphology_features(
    cell_mask: np.ndarray,
    cell_id: int,
) -> dict[str, float]:
    """Extract shape features for a single cell.

    Parameters
    ----------
    cell_mask : np.ndarray
        Labeled integer mask, 0 = background, 1..N = cell IDs.
    cell_id : int
        Which cell to profile.

    Returns
    -------
    dict[str, float]
        Keys:
        - cell_area         : area in pixels
        - cell_perimeter    : perimeter in pixels
        - cell_circularity  : ``4π × area / perimeter²`` (1.0 for a perfect circle)
        - cell_aspect_ratio : ``major_axis / minor_axis`` (1.0 for a circle)
        - cell_solidity     : ``area / convex_area``
        - cell_spread_area  : convex hull area in pixels

    Raises
    ------
    ValueError
        On non-2D input.
    """
    if cell_mask.ndim != 2:
        raise ValueError(f"cell_mask must be 2D, got shape {cell_mask.shape}")

    this_cell = (cell_mask == cell_id).astype(np.uint8)
    if not this_cell.any():
        return _zero_features()

    regions = regionprops(this_cell)
    if not regions:
        return _zero_features()
    region = regions[0]

    area = float(region.area)
    perimeter = float(region.perimeter)
    circularity = (
        float(4.0 * math.pi * area / (perimeter * perimeter))
        if perimeter > 0.0
        else 0.0
    )

    minor = float(region.axis_minor_length)
    major = float(region.axis_major_length)
    aspect_ratio = float(major / minor) if minor > 0.0 else 1.0

    convex_area = float(region.area_convex) if region.area_convex > 0.0 else area
    solidity = float(area / convex_area) if convex_area > 0.0 else 0.0

    return {
        "cell_area": area,
        "cell_perimeter": perimeter,
        "cell_circularity": circularity,
        "cell_aspect_ratio": aspect_ratio,
        "cell_solidity": solidity,
        "cell_spread_area": convex_area,
    }


def _zero_features() -> dict[str, float]:
    return {
        "cell_area": 0.0,
        "cell_perimeter": 0.0,
        "cell_circularity": 0.0,
        "cell_aspect_ratio": 0.0,
        "cell_solidity": 0.0,
        "cell_spread_area": 0.0,
    }
