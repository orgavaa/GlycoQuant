"""Image preprocessing for quantitative fluorescence microscopy.

Every intensity-based feature in GlycoQuant is sensitive to imaging
conditions (laser power, exposure, detector gain, autofluorescence,
uneven illumination). Without a consistent background-removal step,
"mean intensity" features confound biological signal with batch
effects — the single largest source of bias in morphological
profiling pipelines (Caicedo *et al.*, *Nat Methods* 2017; Bray
*et al.*, *Nat Protoc* 2016).

This module provides a single entry point, :func:`subtract_background`,
that applies the **white top-hat** transform — the standard
mathematical-morphology background-removal operator used by
CellProfiler's ``CorrectIlluminationCalculate`` module and by ImageJ's
``Subtract Background`` (rolling ball) since 1983 (Sternberg,
*Computer* 1983). The structuring-element radius must be larger than
the largest *biological* feature but smaller than the illumination
non-uniformity.

The radius is specified in **microns**, not pixels. A 7.5 µm radius
is larger than any cell-surface feature we want to preserve
(pericellular shell, individual focal adhesion, actin fiber) but
smaller than the spatial scale of typical illumination non-uniformity.
At the canonical 0.325 µm/px it resolves to 23 px; at BBBC022's
0.656 µm/px it resolves to 11 px — *different pixel counts, same
biological footprint*, which is what makes cross-optics comparisons
scientifically meaningful.

We deliberately skip the DAPI channel: nuclear staining is dominated
by nucleolar brights and DNA density variation, and a top-hat at this
radius removes real signal rather than autofluorescence. DAPI is only
used for segmentation and nuclear morphometry, neither of which needs
background subtraction.
"""
from __future__ import annotations

from collections.abc import Iterable

import numpy as np
from scipy.ndimage import white_tophat

# Channels that carry quantitative fluorescence we want to normalise.
# DAPI is omitted on purpose — see module docstring.
INTENSITY_CHANNELS: tuple[str, ...] = (
    "glycocalyx",
    "yap",
    "paxillin",
    "actin",
    "heparan_sulfate",
)

# Default structuring-element radius in microns. Chosen to be larger
# than any single focal adhesion, pericellular shell, or actin fiber
# we want to preserve (< ~5 µm) but smaller than the spatial scale of
# typical illumination non-uniformity (> ~20 µm on standard widefield/
# confocal). Converted to pixels per image via ``pixel_size_um`` so
# the physical footprint is invariant to acquisition optics.
DEFAULT_BACKGROUND_RADIUS_UM: float = 7.5

# Legacy alias — kept for backward compatibility with call sites that
# still pass a fixed pixel radius. New code should use
# ``DEFAULT_BACKGROUND_RADIUS_UM`` together with the caller's
# ``pixel_size_um``.
DEFAULT_BACKGROUND_RADIUS_PX: int = 25


def resolve_background_radius_px(
    radius_um: float,
    pixel_size_um: float,
) -> int:
    """Convert a µm-native background radius to a pixel footprint.

    The return value is guaranteed to be at least 1 px so the
    ``white_tophat`` structuring element is always well-defined. A
    non-positive ``pixel_size_um`` raises — silently defaulting would
    mask a provenance bug.
    """
    if pixel_size_um <= 0.0:
        raise ValueError(
            f"pixel_size_um must be positive, got {pixel_size_um}"
        )
    if radius_um <= 0.0:
        return 0
    return max(1, int(round(radius_um / pixel_size_um)))


def subtract_background(
    channels: dict[str, np.ndarray],
    radius_px: int | None = None,
    channels_to_correct: Iterable[str] | None = None,
    *,
    radius_um: float | None = None,
    pixel_size_um: float | None = None,
) -> dict[str, np.ndarray]:
    """Return a new channel dict with background removed from intensity channels.

    Applies :func:`scipy.ndimage.white_tophat` — the mathematical-
    morphology equivalent of ImageJ's rolling-ball subtraction — to
    every channel in ``channels_to_correct`` that is present in
    ``channels``. The operation is performed out-of-place; the input
    dict is not mutated.

    The radius can be specified one of two ways:

    - **µm-native (preferred):** pass ``radius_um`` and
      ``pixel_size_um`` and the function resolves the pixel footprint
      via :func:`resolve_background_radius_px`. Use this mode to make
      feature extraction invariant to acquisition optics.
    - **Pixel-native (legacy):** pass ``radius_px`` directly. This is
      what the old assembler wired in before pixel-size plumbing
      existed; it still works unchanged for backward-compat.

    Passing both ``radius_um`` and ``radius_px`` is an error. If
    neither is given, the default µm-native radius is used together
    with ``pixel_size_um``; if ``pixel_size_um`` is also ``None`` the
    function falls back to ``DEFAULT_BACKGROUND_RADIUS_PX`` so tests
    that do not care about physical units keep their old semantics.

    Parameters
    ----------
    channels : dict[str, np.ndarray]
        Canonical channel dict as consumed by
        :class:`glycoquant.profiles.ProfileAssembler`.
    radius_px : int, optional
        Legacy pixel radius. Mutually exclusive with ``radius_um``.
    channels_to_correct : iterable[str], optional
        Which channel names to process. Defaults to
        :data:`INTENSITY_CHANNELS`; pass an explicit list to override
        (e.g. skip actin on a noisy acquisition).
    radius_um : float, optional
        Physical radius of the structuring element in microns.
    pixel_size_um : float, optional
        Acquisition pixel size. Required when ``radius_um`` is given.

    Returns
    -------
    dict[str, np.ndarray]
        A new dict with corrected intensity channels and untouched
        copies of every other channel (DAPI, anything unknown).
    """
    if radius_um is not None and radius_px is not None:
        raise ValueError("pass either radius_um or radius_px, not both")

    if radius_um is not None:
        if pixel_size_um is None:
            raise ValueError("radius_um requires pixel_size_um")
        resolved_px = resolve_background_radius_px(radius_um, pixel_size_um)
    elif radius_px is not None:
        resolved_px = int(radius_px)
    elif pixel_size_um is not None:
        resolved_px = resolve_background_radius_px(
            DEFAULT_BACKGROUND_RADIUS_UM, pixel_size_um
        )
    else:
        resolved_px = DEFAULT_BACKGROUND_RADIUS_PX

    if resolved_px <= 0:
        return dict(channels)

    targets = set(channels_to_correct or INTENSITY_CHANNELS)
    size = int(2 * resolved_px + 1)  # square footprint side length

    corrected: dict[str, np.ndarray] = {}
    for name, arr in channels.items():
        if name not in targets:
            corrected[name] = arr
            continue
        # white_tophat emits float64; keep float32 to match the rest of the pipeline
        corrected[name] = white_tophat(arr.astype(np.float32), size=size).astype(
            np.float32
        )
    return corrected
