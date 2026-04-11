"""YAP/TAZ nuclear-to-cytoplasmic translocation features.

YAP/TAZ translocates between cytoplasm and nucleus in response to
mechanical cues (Dupont *et al.*, *Nature* 2011). The nuclear-to-
cytoplasmic intensity ratio is the canonical readout of
mechanotransduction activation — but it is a **reductionist** readout:
Lomakin *et al.* (*Nature* 2020) showed that nuclear shape and
envelope tension carry complementary mechanotransduction information,
which is why GlycoQuant also exposes ``extract_nuclear_morphology_features``.
"""
from __future__ import annotations

import math

import numpy as np


def extract_yap_features(
    yap_channel: np.ndarray,
    cell_mask: np.ndarray,
    nuclear_mask: np.ndarray,
    cell_id: int,
) -> dict[str, float]:
    """Extract YAP features for a single cell.

    Parameters
    ----------
    yap_channel : np.ndarray
        2D fluorescence image of the YAP/TAZ channel.
    cell_mask : np.ndarray
        Integer labeled mask, 0 = background, 1..N = cell IDs.
    nuclear_mask : np.ndarray
        Integer labeled mask of nuclei with IDs matching ``cell_mask``
        (see ``CellSegmenter.segment_both``).
    cell_id : int
        Cell ID to profile.

    Returns
    -------
    dict[str, float]
        Keys:
        - yap_nuclear_intensity     : mean YAP in the nucleus
        - yap_cytoplasmic_intensity : mean YAP in ``cell − nucleus``
        - yap_nc_ratio              : nuclear / cytoplasmic (capped)
        - yap_nuclear_fraction      : total_nuclear / total_cell YAP

    Raises
    ------
    ValueError
        On non-2D input or shape mismatch.
    """
    _validate_inputs(yap_channel, cell_mask, nuclear_mask)

    this_cell = cell_mask == cell_id
    this_nucleus = nuclear_mask == cell_id

    if not this_cell.any():
        return _nan_features()

    cytoplasm = this_cell & ~this_nucleus
    nuclear_values = yap_channel[this_nucleus]
    cytoplasmic_values = yap_channel[cytoplasm]

    nuclear_intensity = (
        float(nuclear_values.mean()) if nuclear_values.size else math.nan
    )
    cytoplasmic_intensity = (
        float(cytoplasmic_values.mean()) if cytoplasmic_values.size else math.nan
    )

    nc_ratio = _safe_ratio(nuclear_intensity, cytoplasmic_intensity)

    cell_values = yap_channel[this_cell]
    total_cell = float(cell_values.sum()) if cell_values.size else math.nan
    total_nuclear = float(nuclear_values.sum()) if nuclear_values.size else math.nan
    if math.isfinite(total_cell) and total_cell > 0.0 and math.isfinite(total_nuclear):
        nuclear_fraction = total_nuclear / total_cell
    else:
        nuclear_fraction = math.nan

    return {
        "yap_nuclear_intensity": nuclear_intensity,
        "yap_cytoplasmic_intensity": cytoplasmic_intensity,
        "yap_nc_ratio": nc_ratio,
        "yap_nuclear_fraction": nuclear_fraction,
    }


def _validate_inputs(
    yap_channel: np.ndarray,
    cell_mask: np.ndarray,
    nuclear_mask: np.ndarray,
) -> None:
    """Reject non-2D or shape-mismatched inputs."""
    for name, arr in (
        ("yap_channel", yap_channel),
        ("cell_mask", cell_mask),
        ("nuclear_mask", nuclear_mask),
    ):
        if arr.ndim != 2:
            raise ValueError(f"{name} must be 2D, got shape {arr.shape}")
    if not (yap_channel.shape == cell_mask.shape == nuclear_mask.shape):
        raise ValueError(
            f"shape mismatch: yap {yap_channel.shape}, "
            f"cell {cell_mask.shape}, nuclear {nuclear_mask.shape}"
        )


def _safe_ratio(numerator: float, denominator: float) -> float:
    """Nuclear/cytoplasmic ratio. NaN when either side is undefined.

    Earlier versions returned a finite sentinel (``1000.0``) for
    zero-cytoplasm cases, which silently biased per-condition means
    toward that value. NaN is the correct marker — pandas and numpy
    aggregators accept ``skipna=True`` / ``nanmean`` so these cells
    are excluded from downstream statistics.
    """
    if not (math.isfinite(numerator) and math.isfinite(denominator)):
        return math.nan
    if denominator <= 0.0:
        return math.nan
    return float(numerator / denominator)


def _nan_features() -> dict[str, float]:
    """All-NaN feature dict for missing cells."""
    nan = math.nan
    return {
        "yap_nuclear_intensity": nan,
        "yap_cytoplasmic_intensity": nan,
        "yap_nc_ratio": nan,
        "yap_nuclear_fraction": nan,
    }
