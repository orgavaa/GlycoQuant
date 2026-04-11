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
non-uniformity; 25 px is a sensible default for confocal data at
~0.3 µm/px (matches a ~7.5 µm cell feature upper bound).

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
INTENSITY_CHANNELS: tuple[str, ...] = ("glycocalyx", "yap", "paxillin", "actin")

# Default structuring-element radius in pixels. 25 px at a typical
# confocal pixel size of ~0.3 µm/px corresponds to ~7.5 µm, about one
# small cell, which is larger than any single focal adhesion or
# pericellular shell we want to preserve.
DEFAULT_BACKGROUND_RADIUS_PX: int = 25


def subtract_background(
    channels: dict[str, np.ndarray],
    radius_px: int = DEFAULT_BACKGROUND_RADIUS_PX,
    channels_to_correct: Iterable[str] | None = None,
) -> dict[str, np.ndarray]:
    """Return a new channel dict with background removed from intensity channels.

    Applies :func:`scipy.ndimage.white_tophat` — the mathematical-
    morphology equivalent of ImageJ's rolling-ball subtraction — to
    every channel in ``channels_to_correct`` that is present in
    ``channels``. The operation is performed out-of-place; the input
    dict is not mutated.

    Parameters
    ----------
    channels : dict[str, np.ndarray]
        Canonical channel dict as consumed by
        :class:`glycoquant.profiles.ProfileAssembler`.
    radius_px : int
        Radius of the square structuring element used for the top-hat.
        Must be larger than any feature the user wants to preserve.
    channels_to_correct : iterable[str], optional
        Which channel names to process. Defaults to
        :data:`INTENSITY_CHANNELS`; pass an explicit list to override
        (e.g. skip actin on a noisy acquisition).

    Returns
    -------
    dict[str, np.ndarray]
        A new dict with corrected intensity channels and untouched
        copies of every other channel (DAPI, anything unknown).
    """
    if radius_px <= 0:
        return dict(channels)

    targets = set(channels_to_correct or INTENSITY_CHANNELS)
    size = int(2 * radius_px + 1)  # square footprint side length

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
