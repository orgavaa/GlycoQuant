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

import math
from dataclasses import dataclass

import numpy as np
from scipy.ndimage import binary_dilation, binary_erosion
from skimage.filters import threshold_otsu
from skimage.measure import regionprops

# Minimum floor for the dynamically-sized pericellular ring. Smaller
# than ~3 px and the ring becomes one pixel wide at the diagonal,
# which fractures under discrete topology.
_MIN_RING_WIDTH_PX = 3


@dataclass(frozen=True)
class GlycocalyxParams:
    """Parameters controlling pericellular ring geometry and thresholding.

    Attributes
    ----------
    pericellular_ring_width_px : int
        Legacy fixed ring width. Only used if ``adaptive_ring_width`` is
        disabled — kept for backwards compatibility and tests.
    adaptive_ring_width : bool
        If True, the pericellular ring width is set per-cell to
        ``max(_MIN_RING_WIDTH_PX, 0.1 × equivalent_diameter)``, which
        scales with cell size the way the biological shell does
        (Möckl *et al.* 2019 report ~5% of cell radius as a typical
        glycocalyx extent in fibroblasts).
    n_radial_bins : int
        Number of bins in the radial intensity profile.
    coverage_threshold_method : str
        ``"otsu"`` | ``"percentile"`` | ``"fixed"`` — choice of
        thresholding rule for the coverage fraction.
    """

    pericellular_ring_width_px: int = 10
    adaptive_ring_width: bool = True
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
        return _nan_features(p.n_radial_bins)

    ring_width = _resolve_ring_width(this_cell, p)
    ring = _build_pericellular_ring(this_cell, ring_width)
    ring_values = glycocalyx_channel[ring]

    interior = _cell_interior(this_cell, ring_width)
    interior_values = (
        glycocalyx_channel[interior] if interior.any() else glycocalyx_channel[this_cell]
    )

    mean_intensity = float(ring_values.mean()) if ring_values.size else math.nan
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


def _nan_features(n_radial_bins: int) -> dict[str, float | list[float]]:
    """Return an all-NaN feature dict for empty / missing cells.

    NaN — rather than ``0.0`` — is the scientifically honest signal for
    "missing". Zero conflates *no glycocalyx* with *no data*, silently
    biasing per-condition means toward zero when a single cell is
    mis-segmented. Downstream code must use ``np.nanmean`` / pandas
    ``skipna=True`` aggregation, which is the standard in Cell Painting
    pipelines (Caicedo *et al.* 2017).
    """
    nan = math.nan
    return {
        "glycocalyx_mean_intensity": nan,
        "glycocalyx_heterogeneity": nan,
        "glycocalyx_coverage": nan,
        "glycocalyx_pericellular_ratio": nan,
        "glycocalyx_radial_profile": [nan] * n_radial_bins,
        "glycocalyx_radial_decay_rate": nan,
    }


def _resolve_ring_width(this_cell: np.ndarray, params: GlycocalyxParams) -> int:
    """Return the pericellular ring width in pixels for this cell.

    Adaptive mode derives the width from the cell's equivalent
    diameter (the diameter of a circle with the same area), matching
    the empirical ~5–10% of cell radius for the pericellular shell
    reported by Möckl *et al.* (*Dev Cell* 2019) on super-resolution
    measurements of endothelial glycocalyx. Non-adaptive mode returns
    the legacy fixed width from the params dataclass.
    """
    if not params.adaptive_ring_width:
        return int(params.pericellular_ring_width_px)
    props = regionprops(this_cell.astype(np.uint8))
    if not props:
        return int(params.pericellular_ring_width_px)
    equiv_diam = float(props[0].equivalent_diameter_area)
    width = int(round(0.1 * equiv_diam))
    return max(_MIN_RING_WIDTH_PX, width)


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
    """CV = std / mean. NaN on empty or zero-mean inputs (division undefined)."""
    if values.size == 0:
        return math.nan
    mean = float(values.mean())
    if mean == 0.0:
        return math.nan
    return float(values.std() / mean)


def _compute_coverage(
    ring_values: np.ndarray,
    params: GlycocalyxParams,
) -> float:
    """Fraction of ring pixels whose intensity exceeds the chosen threshold.

    ``coverage_threshold_method`` selects between Otsu, a configurable
    percentile, or a fixed absolute value. Uniform-intensity rings
    return NaN rather than a hard 0/1 boundary (the question of
    "coverage" is ill-posed when every pixel has the same value).
    """
    if ring_values.size == 0:
        return math.nan
    method = params.coverage_threshold_method
    if method == "otsu":
        unique = np.unique(ring_values)
        if unique.size < 2:
            # A uniform ring is an edge case where Otsu is undefined
            # (no between-class variance to maximise). If the signal is
            # positive, every pixel is "covered" (fraction = 1.0); if
            # the ring is dark, the coverage question is meaningless
            # and we return NaN.
            return 1.0 if float(ring_values.mean()) > 0.0 else math.nan
        threshold = float(threshold_otsu(ring_values))
    elif method == "percentile":
        threshold = float(np.percentile(ring_values, params.coverage_threshold_percentile))
    elif method == "fixed":
        threshold = float(params.coverage_threshold_fixed)
    else:
        raise ValueError(f"unknown coverage_threshold_method: {method}")
    return float(np.mean(ring_values > threshold))


def _pericellular_ratio(ring_mean: float, interior_values: np.ndarray) -> float:
    """Ring / interior intensity ratio. NaN when either side is undefined."""
    if interior_values.size == 0 or not math.isfinite(ring_mean):
        return math.nan
    interior_mean = float(interior_values.mean())
    if interior_mean <= 0.0:
        return math.nan
    return float(ring_mean / interior_mean)


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
        return np.full(n_bins, math.nan, dtype=np.float32)

    cy, cx = centroid
    ys, xs = np.indices(roi.shape)
    distances = np.hypot(ys - cy, xs - cx)

    roi_distances = distances[roi]
    max_distance = float(roi_distances.max())
    if max_distance == 0.0:
        return np.full(n_bins, math.nan, dtype=np.float32)

    bin_edges = np.linspace(0.0, max_distance, n_bins + 1)
    # Empty bins stay as NaN so downstream aggregations (nanmean, nanstd)
    # ignore them instead of biasing the profile toward zero.
    profile = np.full(n_bins, math.nan, dtype=np.float32)
    roi_values = glycocalyx_channel[roi]
    for i in range(n_bins):
        lo, hi = bin_edges[i], bin_edges[i + 1]
        in_bin = (roi_distances >= lo) & (roi_distances <= hi if i == n_bins - 1 else roi_distances < hi)
        if in_bin.any():
            profile[i] = float(roi_values[in_bin].mean())
    return profile


def _exp_decay_rate(profile: np.ndarray) -> float:
    """Fit ``I(r) = A * exp(-k * r)`` via log-linear regression and return ``k``.

    Returns NaN when fewer than two positive-intensity bins are available
    or the fit is numerically unstable. Positive values indicate decay
    with radius; negative values indicate *increase* with radius
    (characteristic of a pericellular shell around a darker cell body).
    """
    r = np.arange(len(profile), dtype=np.float32)
    finite_positive = np.isfinite(profile) & (profile > 0)
    if int(finite_positive.sum()) < 2:
        return math.nan
    try:
        log_intensity = np.log(profile[finite_positive])
        slope, _intercept = np.polyfit(r[finite_positive], log_intensity, 1)
    except (np.linalg.LinAlgError, ValueError):
        return math.nan
    return float(-slope)
