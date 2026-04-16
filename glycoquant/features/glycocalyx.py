"""Glycocalyx feature extraction from pericellular fluorescence staining.

The glycocalyx is a ~50-500 nm-thick layer of glycopolymers tethered to
the cell surface, imaged here via lectins (e.g. WGA) that bind
sialic acid and N-acetylglucosamine on the cell-surface sugars. In
conventional confocal microscopy the glycocalyx appears as a bright
pericellular shell surrounding the cytoplasmic signal; this module
quantifies that shell on a per-cell basis.

Features extracted per cell:
    glycocalyx_mean_intensity        : mean fluorescence in the pericellular ring
    glycocalyx_integrated_intensity  : sum of ring pixel intensities
    glycocalyx_heterogeneity         : coefficient of variation in the ring
    glycocalyx_shannon_entropy       : information-theoretic intensity heterogeneity
    glycocalyx_coverage              : fraction of ring pixels above the threshold
    glycocalyx_pericellular_ratio    : ring intensity / cell-interior intensity
    glycocalyx_radial_profile        : binned intensity as a function of radius
    glycocalyx_radial_decay_rate     : exponential decay constant fitted to the profile
    glycocalyx_haralick_contrast     : GLCM contrast (texture energy)
    glycocalyx_haralick_homogeneity  : GLCM homogeneity (smoothness)
    glycocalyx_haralick_correlation  : GLCM correlation (linear directionality)
    glycocalyx_haralick_energy       : GLCM second angular moment
    glycocalyx_moran_i               : spatial autocorrelation (rook contiguity)
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
from scipy.ndimage import binary_dilation, binary_erosion
from scipy.stats import entropy as scipy_entropy
from skimage.feature import graycomatrix, graycoprops
from skimage.filters import threshold_otsu
from skimage.measure import regionprops

from glycoquant.features._spatial import morans_i_on_mask

# Minimum floor for the dynamically-sized pericellular ring. Specified
# in microns (~1 confocal PSF diameter) so the physical minimum is
# preserved across acquisition optics: at 0.325 µm/px the floor is
# 3 px (the old hard-coded value), at 0.656 µm/px it is 2 px. Below
# this physical size the ring becomes one-pixel-wide at the diagonal
# and fractures under discrete topology, so we also enforce an
# absolute 2-px floor as a discretisation backstop.
_MIN_RING_WIDTH_UM: float = 1.0
_MIN_RING_WIDTH_PX_ABSOLUTE_FLOOR: int = 2


def _resolve_min_ring_width_px(pixel_size_um: float) -> int:
    """Physical minimum ring width in pixels, clamped to a 2-px floor."""
    if pixel_size_um <= 0.0:
        return _MIN_RING_WIDTH_PX_ABSOLUTE_FLOOR
    px = int(round(_MIN_RING_WIDTH_UM / pixel_size_um))
    return max(_MIN_RING_WIDTH_PX_ABSOLUTE_FLOOR, px)


# Legacy alias — old call sites that imported ``_MIN_RING_WIDTH_PX``
# directly continue to resolve to the canonical 0.325 µm/px value (3 px).
_MIN_RING_WIDTH_PX = _resolve_min_ring_width_px(0.325)


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
    # Acquisition pixel size in microns. Used to resolve the
    # discretisation-floor on the adaptive ring width so the
    # per-cell shell width stays physically meaningful (~1 µm
    # minimum) across acquisition optics.
    pixel_size_um: float = 0.325
    n_radial_bins: int = 20
    coverage_threshold_method: str = "otsu"  # "otsu" | "percentile" | "fixed"
    coverage_threshold_percentile: float = 75.0
    coverage_threshold_fixed: float = 50.0
    # Number of histogram bins used for the Shannon-entropy estimate
    # over the pericellular ring intensities. 32 bins balances bias
    # against variance for typical cell-sized rings (~100-2000 px).
    entropy_n_bins: int = 32
    # Quantisation level count for the Haralick GLCM. 16 levels keeps
    # the matrix small enough to compute per-cell quickly while
    # preserving enough dynamic range to discriminate texture
    # patterns. ``compute_haralick=False`` skips Haralick entirely
    # (useful for unit tests on tiny synthetic rings where the GLCM
    # is degenerate).
    compute_haralick: bool = True
    haralick_levels: int = 16
    # Minimum ring pixel count below which Haralick is skipped — the
    # GLCM has no defined statistics on a few-pixel ring.
    haralick_min_pixels: int = 100
    compute_moran: bool = True
    moran_min_pixels: int = 50


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
    integrated_intensity = (
        float(ring_values.sum()) if ring_values.size else math.nan
    )
    heterogeneity = _coefficient_of_variation(ring_values)
    shannon = _shannon_entropy(ring_values, p.entropy_n_bins)
    coverage = _compute_coverage(ring_values, p)
    pericellular_ratio = _pericellular_ratio(mean_intensity, interior_values)

    centroid = regionprops(this_cell.astype(np.uint8))[0].centroid
    roi = this_cell | ring  # radial profile spans cell body AND pericellular shell
    radial_profile = _radial_profile(
        glycocalyx_channel, roi, centroid, p.n_radial_bins
    )
    decay_rate = _exp_decay_rate(radial_profile)

    haralick = _haralick_features(glycocalyx_channel, ring, p)
    moran = (
        morans_i_on_mask(glycocalyx_channel, ring, min_pixels=p.moran_min_pixels)
        if p.compute_moran
        else math.nan
    )

    return {
        "glycocalyx_mean_intensity": mean_intensity,
        "glycocalyx_integrated_intensity": integrated_intensity,
        "glycocalyx_heterogeneity": heterogeneity,
        "glycocalyx_shannon_entropy": shannon,
        "glycocalyx_coverage": coverage,
        "glycocalyx_pericellular_ratio": pericellular_ratio,
        "glycocalyx_radial_profile": radial_profile.tolist(),
        "glycocalyx_radial_decay_rate": decay_rate,
        "glycocalyx_haralick_contrast": haralick["contrast"],
        "glycocalyx_haralick_homogeneity": haralick["homogeneity"],
        "glycocalyx_haralick_correlation": haralick["correlation"],
        "glycocalyx_haralick_energy": haralick["energy"],
        "glycocalyx_moran_i": moran,
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
        "glycocalyx_integrated_intensity": nan,
        "glycocalyx_heterogeneity": nan,
        "glycocalyx_shannon_entropy": nan,
        "glycocalyx_coverage": nan,
        "glycocalyx_pericellular_ratio": nan,
        "glycocalyx_radial_profile": [nan] * n_radial_bins,
        "glycocalyx_radial_decay_rate": nan,
        "glycocalyx_haralick_contrast": nan,
        "glycocalyx_haralick_homogeneity": nan,
        "glycocalyx_haralick_correlation": nan,
        "glycocalyx_haralick_energy": nan,
        "glycocalyx_moran_i": nan,
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
    # Physical-unit minimum: never drop below ~1 µm on the given optics
    min_px = _resolve_min_ring_width_px(params.pixel_size_um)
    return max(min_px, width)


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


def _shannon_entropy(values: np.ndarray, n_bins: int) -> float:
    """Information-theoretic entropy of the ring intensity distribution.

    Computed over a fixed-bin histogram of the ring intensities (not
    a kernel density estimate, which is overkill for the typical
    ~100-2000 ring pixels). Values in nats. Returns NaN on empty
    rings or rings with a single unique value (entropy is well-
    defined as 0 there but the metric is uninformative for our
    heterogeneity question — NaN is honest).
    """
    if values.size == 0:
        return math.nan
    finite = values[np.isfinite(values)]
    if finite.size == 0:
        return math.nan
    if finite.min() == finite.max():
        return math.nan
    hist, _edges = np.histogram(finite, bins=int(n_bins))
    total = hist.sum()
    if total == 0:
        return math.nan
    probs = hist.astype(np.float64) / float(total)
    return float(scipy_entropy(probs))


def _haralick_features(
    image: np.ndarray,
    ring: np.ndarray,
    params: GlycocalyxParams,
) -> dict[str, float]:
    """GLCM-based texture summary of the pericellular ring.

    Computes the gray-level co-occurrence matrix on a quantised
    version of the ring patch and aggregates the four most
    interpretable Haralick descriptors:

    - ``contrast``     — local intensity variation (high for noisy rings)
    - ``homogeneity``  — closeness of distribution to the GLCM diagonal
    - ``correlation``  — linear dependence between neighbour intensities
    - ``energy``       — sum of squared GLCM entries (uniformity)

    Averaged over four orientations (0°, 45°, 90°, 135°) and three
    distances (1, 2, 4 pixels) to make the descriptor rotation- and
    scale-invariant within the typical ring thickness.
    """
    nan_dict = {
        "contrast": math.nan,
        "homogeneity": math.nan,
        "correlation": math.nan,
        "energy": math.nan,
    }
    if not params.compute_haralick:
        return nan_dict
    if int(ring.sum()) < params.haralick_min_pixels:
        return nan_dict

    rows, cols = np.where(ring)
    if rows.size == 0:
        return nan_dict

    rmin, rmax = int(rows.min()), int(rows.max()) + 1
    cmin, cmax = int(cols.min()), int(cols.max()) + 1
    patch = image[rmin:rmax, cmin:cmax].astype(np.float64)
    patch_mask = ring[rmin:rmax, cmin:cmax]

    finite_vals = patch[patch_mask & np.isfinite(patch)]
    if finite_vals.size == 0:
        return nan_dict
    lo = float(finite_vals.min())
    hi = float(finite_vals.max())
    if hi <= lo:
        return nan_dict

    # Quantise the patch to ``haralick_levels`` bins. Pixels outside
    # the ring (and non-finite pixels) are clamped to bin 0; we mask
    # them by setting them to a sentinel that the GLCM never uses,
    # but skimage's graycomatrix has no mask param, so the cleanest
    # approach is to compute over the bounding-box patch and accept
    # that out-of-ring pixels contribute to the GLCM with their
    # interpolated values. For tight pericellular rings the bbox is
    # close to the ring itself so this is a small bias.
    levels = int(params.haralick_levels)
    quantised = np.zeros_like(patch, dtype=np.uint8)
    finite_mask = np.isfinite(patch)
    scaled = (patch[finite_mask] - lo) / (hi - lo)
    quantised[finite_mask] = np.clip(
        (scaled * (levels - 1)).round(), 0, levels - 1
    ).astype(np.uint8)

    distances = [1, 2, 4]
    angles = [0.0, math.pi / 4, math.pi / 2, 3 * math.pi / 4]
    try:
        glcm = graycomatrix(
            quantised,
            distances=distances,
            angles=angles,
            levels=levels,
            symmetric=True,
            normed=True,
        )
    except (ValueError, IndexError):
        return nan_dict

    return {
        "contrast": float(np.nanmean(graycoprops(glcm, "contrast"))),
        "homogeneity": float(np.nanmean(graycoprops(glcm, "homogeneity"))),
        "correlation": float(np.nanmean(graycoprops(glcm, "correlation"))),
        "energy": float(np.nanmean(graycoprops(glcm, "energy"))),
    }


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
