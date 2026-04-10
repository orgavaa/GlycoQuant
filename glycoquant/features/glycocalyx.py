"""Glycocalyx feature extraction from pericellular fluorescence staining.

The glycocalyx is a ~50-500 nm-thick layer of glycopolymers tethered to
the cell surface, imaged here via lectins (e.g. WGA) that bind
sialic acid and N-acetylglucosamine on the cell-surface sugars. In
conventional confocal microscopy the glycocalyx appears as a bright
pericellular shell surrounding the cytoplasmic signal; this module
quantifies that shell on a per-cell basis.

Features extracted per cell:
    glycocalyx_mean_intensity     : mean fluorescence in the pericellular ring
    glycocalyx_heterogeneity      : coefficient of variation (std/mean) in the ring
    glycocalyx_coverage           : fraction of ring pixels above the chosen threshold
    glycocalyx_pericellular_ratio : ring intensity / cell-interior intensity
    glycocalyx_radial_profile     : binned intensity as a function of radius
    glycocalyx_radial_decay_rate  : exponential decay constant fitted to the profile
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy.ndimage import binary_dilation, binary_erosion
from skimage.filters import threshold_otsu
from skimage.measure import regionprops

# Sentinel returned when the ring has signal but the cell interior is
# perfectly dark (division-by-zero in the ratio). Large finite value
# keeps the feature table numeric-safe for downstream clustering.
_PERICELLULAR_RATIO_MAX = 1000.0


@dataclass(frozen=True)
class GlycocalyxParams:
    """Parameters controlling pericellular ring geometry and thresholding.

    Defaults mirror ``configs/default.yaml → features.glycocalyx``.
    """

    pericellular_ring_width_px: int = 10
    n_radial_bins: int = 20
    coverage_threshold_method: str = "otsu"  # "otsu" | "percentile" | "fixed"
    coverage_threshold_percentile: float = 75.0
    coverage_threshold_fixed: float = 50.0


def extract_glycocalyx_features(
    glycocalyx_channel: np.ndarray,
    cell_mask: np.ndarray,
    cell_id: int,
    params: GlycocalyxParams | None = None,
) -> dict[str, float | list[float]]:
    """Extract glycocalyx features for a single cell.

    Parameters
    ----------
    glycocalyx_channel : np.ndarray
        2D fluorescence image of the glycocalyx channel (e.g. WGA-lectin).
    cell_mask : np.ndarray
        Integer labeled mask: ``0`` = background, ``1..N`` = cell IDs.
        Must share shape with ``glycocalyx_channel``.
    cell_id : int
        The ID in ``cell_mask`` identifying which cell to profile.
    params : GlycocalyxParams, optional
        Feature extraction parameters; defaults from the dataclass.

    Returns
    -------
    dict[str, float | list[float]]
        Six keys as described in the module docstring.

    Raises
    ------
    ValueError
        If shapes mismatch or input is not 2D.
    """
    if glycocalyx_channel.ndim != 2:
        raise ValueError(f"expected 2D array, got shape {glycocalyx_channel.shape}")
    if cell_mask.ndim != 2:
        raise ValueError(f"cell_mask must be 2D, got shape {cell_mask.shape}")
    if glycocalyx_channel.shape != cell_mask.shape:
        raise ValueError(
            f"glycocalyx_channel shape {glycocalyx_channel.shape} "
            f"!= cell_mask shape {cell_mask.shape}"
        )

    p = params or GlycocalyxParams()
    this_cell = cell_mask == cell_id

    if not this_cell.any():
        return _zero_features(p.n_radial_bins)

    ring = _build_pericellular_ring(this_cell, p.pericellular_ring_width_px)
    ring_values = glycocalyx_channel[ring]

    interior = _cell_interior(this_cell, p.pericellular_ring_width_px)
    interior_values = (
        glycocalyx_channel[interior] if interior.any() else glycocalyx_channel[this_cell]
    )

    mean_intensity = float(ring_values.mean()) if ring_values.size else 0.0
    heterogeneity = _coefficient_of_variation(ring_values)
    coverage = _compute_coverage(ring_values, p)
    pericellular_ratio = _pericellular_ratio(mean_intensity, interior_values)

    centroid = regionprops(this_cell.astype(np.uint8))[0].centroid
    roi = this_cell | ring  # radial profile spans cell body AND pericellular shell
    radial_profile = _radial_profile(
        glycocalyx_channel, roi, centroid, p.n_radial_bins
    )
    decay_rate = _exp_decay_rate(radial_profile)

    return {
        "glycocalyx_mean_intensity": mean_intensity,
        "glycocalyx_heterogeneity": heterogeneity,
        "glycocalyx_coverage": coverage,
        "glycocalyx_pericellular_ratio": pericellular_ratio,
        "glycocalyx_radial_profile": radial_profile.tolist(),
        "glycocalyx_radial_decay_rate": decay_rate,
    }


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------


def _zero_features(n_radial_bins: int) -> dict[str, float | list[float]]:
    """Return an all-zero feature dict for empty / missing cells."""
    return {
        "glycocalyx_mean_intensity": 0.0,
        "glycocalyx_heterogeneity": 0.0,
        "glycocalyx_coverage": 0.0,
        "glycocalyx_pericellular_ratio": 0.0,
        "glycocalyx_radial_profile": [0.0] * n_radial_bins,
        "glycocalyx_radial_decay_rate": 0.0,
    }


def _build_pericellular_ring(this_cell: np.ndarray, ring_width: int) -> np.ndarray:
    """Boolean mask of the pericellular ring outside the cell body."""
    dilated = binary_dilation(this_cell, iterations=ring_width)
    return dilated & ~this_cell


def _cell_interior(this_cell: np.ndarray, ring_width: int) -> np.ndarray:
    """Boolean mask of the cell interior, eroded inward to exclude the edge.

    Uses half the pericellular ring width as the erosion depth so the
    interior and ring are non-overlapping and the ratio is well-defined.
    """
    erosion_iters = max(1, ring_width // 2)
    return binary_erosion(this_cell, iterations=erosion_iters)


def _coefficient_of_variation(values: np.ndarray) -> float:
    """CV = std / mean. Zero if the array is empty or has zero mean."""
    if values.size == 0:
        return 0.0
    mean = float(values.mean())
    if mean == 0.0:
        return 0.0
    return float(values.std() / mean)


def _compute_coverage(
    ring_values: np.ndarray,
    params: GlycocalyxParams,
) -> float:
    """Fraction of ring pixels whose intensity exceeds the chosen threshold.

    ``coverage_threshold_method`` selects between Otsu, a configurable
    percentile, or a fixed absolute value. Otsu falls back to 1.0 when
    the ring has no intensity variation.
    """
    if ring_values.size == 0:
        return 0.0
    method = params.coverage_threshold_method
    if method == "otsu":
        unique = np.unique(ring_values)
        if unique.size < 2:
            return 1.0 if float(ring_values.mean()) > 0.0 else 0.0
        threshold = float(threshold_otsu(ring_values))
    elif method == "percentile":
        threshold = float(np.percentile(ring_values, params.coverage_threshold_percentile))
    elif method == "fixed":
        threshold = float(params.coverage_threshold_fixed)
    else:
        raise ValueError(f"unknown coverage_threshold_method: {method}")
    return float(np.mean(ring_values > threshold))


def _pericellular_ratio(ring_mean: float, interior_values: np.ndarray) -> float:
    """Ring / interior intensity ratio, with a finite sentinel for 0/0."""
    if interior_values.size == 0:
        return 0.0
    interior_mean = float(interior_values.mean())
    if interior_mean > 0.0:
        ratio = ring_mean / interior_mean
    elif ring_mean > 0.0:
        ratio = _PERICELLULAR_RATIO_MAX
    else:
        ratio = 0.0
    return float(min(ratio, _PERICELLULAR_RATIO_MAX))


def _radial_profile(
    glycocalyx_channel: np.ndarray,
    roi: np.ndarray,
    centroid: tuple[float, float],
    n_bins: int,
) -> np.ndarray:
    """Binned mean intensity as a function of distance from ``centroid``.

    Only pixels inside ``roi`` contribute. Bins span ``[0, max_distance]``
    where ``max_distance`` is the furthest ROI pixel from the centroid.
    Empty bins return 0.
    """
    if not roi.any():
        return np.zeros(n_bins, dtype=np.float32)

    cy, cx = centroid
    ys, xs = np.indices(roi.shape)
    distances = np.hypot(ys - cy, xs - cx)

    roi_distances = distances[roi]
    max_distance = float(roi_distances.max())
    if max_distance == 0.0:
        return np.zeros(n_bins, dtype=np.float32)

    bin_edges = np.linspace(0.0, max_distance, n_bins + 1)
    profile = np.zeros(n_bins, dtype=np.float32)
    roi_values = glycocalyx_channel[roi]
    for i in range(n_bins):
        lo, hi = bin_edges[i], bin_edges[i + 1]
        in_bin = (roi_distances >= lo) & (roi_distances <= hi if i == n_bins - 1 else roi_distances < hi)
        if in_bin.any():
            profile[i] = float(roi_values[in_bin].mean())
    return profile


def _exp_decay_rate(profile: np.ndarray) -> float:
    """Fit ``I(r) = A * exp(-k * r)`` via log-linear regression and return ``k``.

    Returns 0 if fewer than two positive-intensity bins are available or
    the fit fails. Positive values indicate decay with radius; negative
    values indicate *increase* with radius (characteristic of a
    pericellular shell around a darker cell body).
    """
    r = np.arange(len(profile), dtype=np.float32)
    valid = profile > 0
    if int(valid.sum()) < 2:
        return 0.0
    try:
        log_intensity = np.log(profile[valid])
        slope, _intercept = np.polyfit(r[valid], log_intensity, 1)
    except (np.linalg.LinAlgError, ValueError):
        return 0.0
    return float(-slope)
