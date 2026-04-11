"""Nuclear morphometry features from the DAPI segmentation.

The nuclear envelope is now recognised as a **primary mechanosensor**
in its own right, complementing the YAP/TAZ translocation readout:

- Swift *et al.*, *Science* 2013 — lamin A/C scales with tissue
  stiffness and directly reports matrix mechanics.
- Lomakin *et al.*, *Nature* 2020 — nuclear deformation (area, aspect
  ratio, envelope folding) triggers cPLA2-driven contractility.
- Venturini *et al.*, *Science* 2020 — nuclear area expansion tracks
  with substrate stiffness in the absence of any YAP change.

Nuclear shape features are therefore an orthogonal mechanotransduction
readout to YAP N/C. GlycoQuant extracts them from the DAPI-based
nuclear mask (no extra channel required, so they run on every image
that has a nucleus) using the same ``regionprops`` toolkit as the cell
morphology module.
"""
from __future__ import annotations

import math

import numpy as np
from skimage.measure import regionprops


def extract_nuclear_morphology_features(
    cell_mask: np.ndarray,
    nuclear_mask: np.ndarray,
    cell_id: int,
) -> dict[str, float]:
    """Return nuclear shape features for a single cell.

    Parameters
    ----------
    cell_mask : np.ndarray
        Labeled integer mask of cell bodies, 0 = background.
    nuclear_mask : np.ndarray
        Labeled integer mask of nuclei with IDs matching ``cell_mask``.
    cell_id : int
        Which cell (and its matching nucleus) to profile.

    Returns
    -------
    dict[str, float]
        Keys:
        - ``nuclear_area``               : nucleus area in pixels
        - ``nuclear_perimeter``          : nucleus perimeter in pixels
        - ``nuclear_circularity``        : ``4π·area / perimeter²``
        - ``nuclear_aspect_ratio``       : major / minor axis (elongation)
        - ``nuclear_solidity``           : ``area / convex_hull_area``
                                           (low = lobed / wrinkled nucleus,
                                           a hallmark of lamin-A/C-
                                           deficient cells and stiff ECM)
        - ``nuclear_eccentricity``       : 0 = circle, 1 = line
        - ``nuclear_to_cell_area_ratio`` : nucleus / cell body area,
                                           a direct mechanotransduction
                                           readout (Venturini 2020)

    Every value is NaN when the nucleus is absent from the mask, and
    individual shape metrics are NaN on degenerate geometry (e.g. a
    one-pixel mask with no perimeter). This matches the NaN semantics
    of all other extractors so ``nanmean`` aggregation is safe.
    """
    if cell_mask.ndim != 2 or nuclear_mask.ndim != 2:
        raise ValueError("cell_mask and nuclear_mask must be 2D")
    if cell_mask.shape != nuclear_mask.shape:
        raise ValueError(
            f"shape mismatch: cell {cell_mask.shape}, nuclear {nuclear_mask.shape}"
        )

    this_nucleus = (nuclear_mask == cell_id).astype(np.uint8)
    if not this_nucleus.any():
        return _nan_features()

    regions = regionprops(this_nucleus)
    if not regions:
        return _nan_features()
    r = regions[0]

    area = float(r.area)
    perimeter = float(r.perimeter)
    circularity = (
        float(4.0 * math.pi * area / (perimeter * perimeter))
        if perimeter > 0.0
        else math.nan
    )

    minor = float(r.axis_minor_length)
    major = float(r.axis_major_length)
    aspect = float(major / minor) if minor > 0.0 else math.nan

    convex_area = float(r.area_convex) if r.area_convex > 0.0 else math.nan
    solidity = (
        float(area / convex_area)
        if math.isfinite(convex_area) and convex_area > 0.0
        else math.nan
    )
    eccentricity = float(r.eccentricity)

    this_cell = cell_mask == cell_id
    cell_area = float(this_cell.sum())
    n_to_c = float(area / cell_area) if cell_area > 0.0 else math.nan

    return {
        "nuclear_area": area,
        "nuclear_perimeter": perimeter,
        "nuclear_circularity": circularity,
        "nuclear_aspect_ratio": aspect,
        "nuclear_solidity": solidity,
        "nuclear_eccentricity": eccentricity,
        "nuclear_to_cell_area_ratio": n_to_c,
    }


def _nan_features() -> dict[str, float]:
    nan = math.nan
    return {
        "nuclear_area": nan,
        "nuclear_perimeter": nan,
        "nuclear_circularity": nan,
        "nuclear_aspect_ratio": nan,
        "nuclear_solidity": nan,
        "nuclear_eccentricity": nan,
        "nuclear_to_cell_area_ratio": nan,
    }
