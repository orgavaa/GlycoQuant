"""Lightweight spatial-statistics helpers for the feature extractors.

Centralised here so the per-extractor modules don't depend on
``libpysal`` (which would pull ~30 MB of geographical-stats baggage
into the runtime). The single function exposed,
:func:`morans_i_on_mask`, computes Moran's I autocorrelation over the
intensity values of pixels inside a boolean mask using rook
contiguity weights — neighbours are the four orthogonal pixels in
the same mask.

Moran's I is a global measure of spatial autocorrelation:

- ``+1`` — perfectly clustered (neighbours have similar intensities)
- ``0``  — spatial randomness (no autocorrelation)
- ``-1`` — perfectly dispersed (checkerboard pattern)

This is the standard summary used in glycocalyx super-resolution
work (Möckl 2019, Tholen 2025) but is essentially never applied to
diffraction-limited confocal WGA images. Adding it as a per-cell
feature is one of the small-but-novel contributions in
GlycoQuant Tab 1.
"""
from __future__ import annotations

import math

import numpy as np


def morans_i_on_mask(
    image: np.ndarray,
    mask: np.ndarray,
    min_pixels: int = 50,
) -> float:
    """Global Moran's I over the intensity values inside a boolean mask.

    Uses rook (4-connected) contiguity: each pixel's neighbours are
    the orthogonal pixels above/below/left/right that are also inside
    the mask. Edge pixels with no in-mask neighbours are dropped.

    Parameters
    ----------
    image : np.ndarray
        2D intensity image. Same shape as ``mask``.
    mask : np.ndarray
        2D boolean mask selecting which pixels participate in the
        statistic.
    min_pixels : int
        Minimum number of in-mask pixels required for a stable
        estimate. Below this floor the function returns NaN — the
        estimator is too noisy to report otherwise.

    Returns
    -------
    float
        Moran's I in ``[-1, 1]``. NaN if the mask is too small, has
        no neighbour pairs, or has zero variance.
    """
    if image.shape != mask.shape:
        raise ValueError(
            f"shape mismatch: image {image.shape}, mask {mask.shape}"
        )
    if image.ndim != 2:
        raise ValueError(f"expected 2D arrays, got shape {image.shape}")

    n = int(mask.sum())
    if n < min_pixels:
        return math.nan

    values = image.astype(np.float64, copy=False)
    mean = float(values[mask].mean())
    deviations = np.where(mask, values - mean, 0.0)
    variance = float((deviations[mask] ** 2).sum())
    if variance <= 0.0:
        return math.nan

    # Rook neighbour contributions: shift the mask + deviations along
    # each of the 4 cardinal axes and accumulate the cross-products
    # for pairs that are both in-mask.
    cross_sum = 0.0
    weight_sum = 0
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        shifted_mask = np.roll(mask, shift=(dy, dx), axis=(0, 1))
        # Roll wraps around — invalidate the wrapped edge.
        if dy == 1:
            shifted_mask[0, :] = False
        elif dy == -1:
            shifted_mask[-1, :] = False
        if dx == 1:
            shifted_mask[:, 0] = False
        elif dx == -1:
            shifted_mask[:, -1] = False

        pair_mask = mask & shifted_mask
        if not pair_mask.any():
            continue
        shifted_dev = np.roll(deviations, shift=(dy, dx), axis=(0, 1))
        cross_sum += float((deviations[pair_mask] * shifted_dev[pair_mask]).sum())
        weight_sum += int(pair_mask.sum())

    if weight_sum == 0:
        return math.nan

    return float((n / weight_sum) * (cross_sum / variance))
