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

import math
from dataclasses import dataclass

import numpy as np
from scipy.ndimage import distance_transform_edt
from skimage.filters import threshold_otsu
from skimage.measure import label, regionprops


@dataclass(frozen=True)
class FocalAdhesionParams:
    """Parameters controlling focal adhesion detection and filtering.

    Defaults mirror ``configs/default.yaml → features.focal_adhesions``.

    All spatially-sized knobs (area bounds, peripheral distance,
    maturation bins) are **µm-native** — the pixel footprints are
    computed on the fly from ``pixel_size_um`` via the
    ``..._px`` / ``..._um2`` derived properties. This is what makes
    an image acquired at 0.325 µm/px (standard confocal) comparable
    to one at 0.656 µm/px (BBBC022) without the feature classifier
    silently mis-binning adhesions. Legacy ``min_area_px`` /
    ``max_area_px`` / ``peripheral_distance_px`` fields are preserved
    so external callers that override them continue to work; when set
    to a non-``None`` value they take precedence over the µm-native
    defaults.

    The Zaidel-Bar 2007 / Geiger 2001 nascent-adhesion threshold is
    ~0.25 µm² (5-7 px² at 0.325 µm/px). The platform default here is
    ``min_area_um2 = 0.5`` to stay above the diffraction-limited
    puncta floor; override to ``0.25`` for strict Zaidel-Bar staging.
    """

    threshold_method: str = "otsu"  # "otsu" | "fixed"
    threshold_fixed: float = 0.5
    # Pixel-unit fields — kept for backward compat. When ``None``, the
    # µm-native fields are used as the source of truth.
    min_area_px: int | None = None
    max_area_px: int | None = None
    peripheral_distance_px: int | None = None
    # µm-native fields (source of truth)
    min_area_um2: float = 0.5  # above the diffraction-limited FA floor
    max_area_um2: float = 50.0  # fibrillar-adhesion upper bound
    peripheral_distance_um: float = 6.5  # ~1 cell edge thickness
    pixel_size_um: float = 0.325
    # Maturation bin edges in microns. Defaults match the
    # Buskermolen 2018 / Zaidel-Bar nascent → focal-complex → mature
    # → fibrillar taxonomy.
    nascent_max_um: float = 0.5
    focal_complex_max_um: float = 1.0
    mature_max_um: float = 5.0

    @property
    def resolved_min_area_px(self) -> int:
        """Integer px² floor for FA connected components."""
        if self.min_area_px is not None:
            return int(self.min_area_px)
        px_area = self.pixel_size_um ** 2
        return max(1, int(round(self.min_area_um2 / px_area)))

    @property
    def resolved_max_area_px(self) -> int:
        """Integer px² ceiling for FA connected components."""
        if self.max_area_px is not None:
            return int(self.max_area_px)
        px_area = self.pixel_size_um ** 2
        return max(
            self.resolved_min_area_px + 1,
            int(round(self.max_area_um2 / px_area)),
        )

    @property
    def resolved_peripheral_distance_px(self) -> float:
        """Distance from the cell edge that counts as 'peripheral', in pixels."""
        if self.peripheral_distance_px is not None:
            return float(self.peripheral_distance_px)
        return max(1.0, self.peripheral_distance_um / self.pixel_size_um)


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
    lo = p.resolved_min_area_px
    hi = p.resolved_max_area_px
    regions = [r for r in regionprops(labeled) if lo <= r.area <= hi]
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
        Aggregate keys:
        - fa_count                       : number of focal adhesions
        - fa_density_per_um2             : count per cell area in µm²
        - fa_mean_area                   : mean FA area (px)
        - fa_total_area                  : total FA area (px)
        - fa_mean_area_um2               : mean FA area (µm²)
        - fa_total_area_um2              : total FA area (µm²)
        - fa_mean_elongation             : mean axis_major / axis_minor
        - fa_mean_distance_to_edge       : mean centroid → edge distance (px)
        - fa_mean_distance_to_edge_um    : same in µm
        - fa_peripheral_fraction         : fraction of FAs within ``peripheral_distance_um``
                                           of the cell edge (default 6.5 µm); the µm value
                                           is resolved to pixels at call time from
                                           ``pixel_size_um`` so the physical footprint is
                                           invariant to acquisition optics.
        - fa_mean_orientation_alignment  : 1 − circular variance over 2θ of FA major-axis angles
        Maturation bins (Buskermolen 2018, Zaidel-Bar):
        - fa_nascent_count       : major axis < nascent_max_um
        - fa_focal_complex_count : nascent_max_um ≤ axis < focal_complex_max_um
        - fa_mature_count        : focal_complex_max_um ≤ axis < mature_max_um
        - fa_fibrillar_count     : axis ≥ mature_max_um
        - fa_mature_fraction     : (mature + fibrillar) / total
    """
    regions = detect_focal_adhesions(paxillin_channel, cell_mask, cell_id, params)
    p = params or FocalAdhesionParams()

    if not regions:
        return _nan_features()

    this_cell = cell_mask == cell_id
    cell_area_px = float(this_cell.sum())
    pixel_area_um2 = float(p.pixel_size_um) ** 2
    cell_area_um2 = cell_area_px * pixel_area_um2

    distance_to_edge = distance_transform_edt(this_cell)

    areas = np.array([r.area for r in regions], dtype=np.float64)
    major_axes_um = np.array(
        [r.axis_major_length * p.pixel_size_um for r in regions], dtype=np.float64
    )
    elongations = np.array([_elongation(r) for r in regions], dtype=np.float64)
    distances = np.array(
        [_centroid_distance(r, distance_to_edge) for r in regions], dtype=np.float64
    )
    orientations = np.array([float(r.orientation) for r in regions], dtype=np.float64)

    peripheral_count = int(np.sum(distances <= p.resolved_peripheral_distance_px))

    nascent_count = int(np.sum(major_axes_um < p.nascent_max_um))
    focal_complex_count = int(
        np.sum(
            (major_axes_um >= p.nascent_max_um) & (major_axes_um < p.focal_complex_max_um)
        )
    )
    mature_count = int(
        np.sum(
            (major_axes_um >= p.focal_complex_max_um) & (major_axes_um < p.mature_max_um)
        )
    )
    fibrillar_count = int(np.sum(major_axes_um >= p.mature_max_um))
    n_total = len(regions)
    mature_fraction = (
        float(mature_count + fibrillar_count) / n_total if n_total > 0 else math.nan
    )

    return {
        "fa_count": float(n_total),
        "fa_density_per_um2": (
            float(n_total / cell_area_um2) if cell_area_um2 > 0 else math.nan
        ),
        "fa_mean_area": float(np.nanmean(areas)),
        "fa_total_area": float(np.nansum(areas)),
        "fa_mean_area_um2": float(np.nanmean(areas) * pixel_area_um2),
        "fa_total_area_um2": float(np.nansum(areas) * pixel_area_um2),
        "fa_mean_elongation": float(np.nanmean(elongations)),
        "fa_mean_distance_to_edge": float(np.nanmean(distances)),
        "fa_mean_distance_to_edge_um": float(np.nanmean(distances) * p.pixel_size_um),
        "fa_peripheral_fraction": peripheral_count / n_total,
        "fa_mean_orientation_alignment": _orientation_alignment(orientations),
        "fa_nascent_count": float(nascent_count),
        "fa_focal_complex_count": float(focal_complex_count),
        "fa_mature_count": float(mature_count),
        "fa_fibrillar_count": float(fibrillar_count),
        "fa_mature_fraction": mature_fraction,
    }


def _orientation_alignment(orientations: np.ndarray) -> float:
    """Coherence of FA major-axis orientations within a cell.

    Returns ``1 − circular variance`` computed on ``2θ`` so that
    parallel adhesions pointing in opposite directions still count
    as aligned (FA orientation is undirected). Values in [0, 1]:
    1 = perfectly aligned, 0 = isotropic. NaN for fewer than 2 FAs
    (alignment is undefined).
    """
    finite = orientations[np.isfinite(orientations)]
    if finite.size < 2:
        return math.nan
    angles_2theta = 2.0 * finite
    sin_mean = float(np.sin(angles_2theta).mean())
    cos_mean = float(np.cos(angles_2theta).mean())
    resultant_length = math.hypot(sin_mean, cos_mean)
    return float(resultant_length)


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
    """major_axis / minor_axis. NaN if the minor axis is degenerate.

    Returning 1.0 on a degenerate minor axis used to conflate "perfect
    circle" (a real biological signal) with "shape undefined" — NaN
    is the honest marker so nanmean aggregates ignore these FAs.
    """
    major = region.axis_major_length
    minor = region.axis_minor_length
    if minor <= 0.0:
        return math.nan
    return float(major / minor)


def _centroid_distance(region, distance_to_edge: np.ndarray) -> float:  # noqa: ANN001
    """Distance from the FA centroid to the cell boundary, in pixels."""
    cy, cx = (int(round(c)) for c in region.centroid)
    cy = int(np.clip(cy, 0, distance_to_edge.shape[0] - 1))
    cx = int(np.clip(cx, 0, distance_to_edge.shape[1] - 1))
    return float(distance_to_edge[cy, cx])


def _nan_features() -> dict[str, float]:
    """Zero count, NaN shape statistics.

    ``fa_count`` stays at 0.0 because "no FA" is a real, interpretable
    observation (non-adherent cell). But mean/total area, elongation,
    edge distance, and peripheral fraction have no defined value when
    there are no FAs to average over, so they are NaN — not a silent
    zero that would bias per-condition means.
    """
    nan = math.nan
    return {
        "fa_count": 0.0,
        "fa_density_per_um2": 0.0,
        "fa_mean_area": nan,
        "fa_total_area": 0.0,
        "fa_mean_area_um2": nan,
        "fa_total_area_um2": 0.0,
        "fa_mean_elongation": nan,
        "fa_mean_distance_to_edge": nan,
        "fa_mean_distance_to_edge_um": nan,
        "fa_peripheral_fraction": nan,
        "fa_mean_orientation_alignment": nan,
        "fa_nascent_count": 0.0,
        "fa_focal_complex_count": 0.0,
        "fa_mature_count": 0.0,
        "fa_fibrillar_count": 0.0,
        "fa_mature_fraction": nan,
    }
