"""Shared preview compositing helper.

Both the bundled-demo endpoint and the upload-preview endpoint render
a PNG thumbnail of an arbitrary multi-channel image by picking three
meaningful slots, applying a per-channel percentile stretch, and
packing them into an RGB output. The compositing rules live here so
the demo and upload paths can never drift apart.
"""
from __future__ import annotations

import io

import numpy as np
from PIL import Image

from glycoquant.io import downsample_for_display

_LO_PCT = 0.01
_HI_PCT = 0.995
_MAX_SIDE = 1024


def composite_preview_png(image: np.ndarray) -> bytes:
    """Return a downsampled RGB PNG preview of any shape of input image.

    Channel mapping rules:
    - 1 channel:       grayscale replicated into R=G=B
    - 2 channels:      R=ch0, G=ch1, B=ch0 (so nothing is black)
    - 3 channels:      R=ch2, G=ch1, B=ch0 (BGR → RGB swap, the classic
                       microscopy look where DAPI sits in blue)
    - 4 channels:      R=ch3, G=ch1, B=ch0 (drop ch2, keep DAPI-blue)
    - 5+ channels:     R=ch4 (reference), G=ch1 (antibody), B=ch0 (DAPI)
                       — matches the HPA composite in the demo preview

    The resulting RGB image is percentile-stretched per channel, clipped
    to [0, 1], downsampled to fit in a 1024-pixel box, and encoded as a
    PNG byte string.

    Parameters
    ----------
    image : np.ndarray
        ``(H, W)`` grayscale or ``(H, W, C)`` multi-channel float array
        as returned by :func:`glycoquant.io.load_multichannel_image`.

    Returns
    -------
    bytes
        PNG-encoded RGB image, ready to stream as the response body.

    Raises
    ------
    ValueError
        On an empty image or an image with more than 3 dimensions.
    """
    if image.size == 0:
        raise ValueError("image is empty")
    if image.ndim == 2:
        image = image[..., np.newaxis]
    if image.ndim != 3:
        raise ValueError(f"expected 2D or 3D image, got ndim={image.ndim}")

    n_channels = image.shape[2]
    rgb = _pick_rgb_slots(image, n_channels).astype(np.float32)

    stretched = np.zeros_like(rgb, dtype=np.float32)
    for i in range(3):
        ch = rgb[:, :, i]
        lo = float(np.quantile(ch, _LO_PCT))
        hi = float(np.quantile(ch, _HI_PCT))
        span = max(hi - lo, 1e-6)
        stretched[:, :, i] = np.clip((ch - lo) / span, 0.0, 1.0)

    display = downsample_for_display(stretched, max_side=_MAX_SIDE)
    u8 = (np.clip(display, 0.0, 1.0) * 255.0).astype(np.uint8)

    buf = io.BytesIO()
    Image.fromarray(u8, mode="RGB").save(buf, format="PNG", optimize=False)
    return buf.getvalue()


def _pick_rgb_slots(image: np.ndarray, n_channels: int) -> np.ndarray:
    """Stack three channels of ``image`` into an ``(H, W, 3)`` array."""
    if n_channels == 1:
        ch0 = image[:, :, 0]
        return np.stack([ch0, ch0, ch0], axis=-1)
    if n_channels == 2:
        return np.stack([image[:, :, 0], image[:, :, 1], image[:, :, 0]], axis=-1)
    if n_channels == 3:
        return np.stack([image[:, :, 2], image[:, :, 1], image[:, :, 0]], axis=-1)
    if n_channels == 4:
        return np.stack([image[:, :, 3], image[:, :, 1], image[:, :, 0]], axis=-1)
    # 5+ channels — HPA-style composite
    return np.stack([image[:, :, 4], image[:, :, 1], image[:, :, 0]], axis=-1)
