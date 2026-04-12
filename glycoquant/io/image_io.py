"""Image loading, channel splitting, downsampling, and content hashing.

This module is the boundary between user-facing file uploads and the
numerical pipeline. It accepts either a filesystem path or a file-like
object (so Streamlit's ``UploadedFile`` works directly) and returns a
canonical ``(H, W, C)`` float32 array in ``[0, 1]``.

TIFF multi-page stacks, single PNGs with multiple channels (RGB / RGBA),
and single-channel grayscale images are all supported. For multi-page
TIFFs the channel axis is the first (page) axis, which we transpose to
the last axis for consistency.
"""
from __future__ import annotations

import contextlib
import hashlib
import io
from pathlib import Path
from typing import BinaryIO

import numpy as np
import tifffile
from PIL import Image
from skimage.transform import resize

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DEFAULT_DISPLAY_MAX_SIDE = 2048  # pixels — sharp on retina/HiDPI displays

# Canonical channel names that downstream code (ProfileAssembler,
# DinoV2Embedder) expects.
CANONICAL_CHANNEL_NAMES = ("dapi", "glycocalyx", "yap", "paxillin", "actin")


# ---------------------------------------------------------------------------
# Loading
# ---------------------------------------------------------------------------


def load_multichannel_image(
    source: str | Path | bytes | BinaryIO,
) -> np.ndarray:
    """Load a multi-channel image from disk, bytes, or a file-like object.

    Parameters
    ----------
    source : str | Path | bytes | file-like
        Filesystem path, raw bytes, or a readable binary stream (e.g.
        Streamlit's ``UploadedFile``).

    Returns
    -------
    np.ndarray
        ``(H, W, C)`` float32 array in ``[0, 1]``. Single-channel inputs
        are returned with ``C=1``. Multi-page TIFFs are transposed so
        channels are the last axis.

    Raises
    ------
    ValueError
        On unrecognized format or unexpected dimensionality.
    """
    buffer = _coerce_to_bytes(source)

    # Try TIFF first (handles multi-page); fall back to Pillow for
    # PNG / JPEG / other single-frame formats.
    try:
        array = tifffile.imread(io.BytesIO(buffer))
    except (tifffile.TiffFileError, ValueError):
        with Image.open(io.BytesIO(buffer)) as im:
            array = np.array(im)

    return _canonicalize(array)


def _coerce_to_bytes(source: str | Path | bytes | BinaryIO) -> bytes:
    """Normalize every supported input form to a raw ``bytes`` buffer."""
    if isinstance(source, bytes):
        return source
    if isinstance(source, (str, Path)):
        return Path(source).read_bytes()
    if hasattr(source, "read"):
        # Seek to start in case the stream has been partially consumed
        with contextlib.suppress(AttributeError, io.UnsupportedOperation):
            source.seek(0)
        return source.read()
    raise TypeError(f"unsupported source type: {type(source).__name__}")


def _canonicalize(array: np.ndarray) -> np.ndarray:
    """Return ``(H, W, C)`` float32 in ``[0, 1]`` regardless of input layout.

    Handles:
    - ``(H, W)`` grayscale → ``(H, W, 1)``
    - ``(H, W, C)`` RGB / RGBA → unchanged shape, normalized dtype
    - ``(C, H, W)`` multi-page TIFF → transposed to ``(H, W, C)``
    """
    if array.ndim == 2:
        array = array[..., np.newaxis]
    elif array.ndim == 3:
        # Heuristic: if the first axis is "small" and the last axis is "large",
        # this is a (C, H, W) tiff page stack and we transpose. A 5-channel
        # confocal image will have C≈5 and H,W≈512..4096, so first_axis <= 8
        # is a reliable discriminant.
        if array.shape[0] <= 8 and array.shape[-1] > 8:
            array = np.transpose(array, (1, 2, 0))
    else:
        raise ValueError(
            f"expected 2D or 3D image, got ndim={array.ndim} shape={array.shape}"
        )

    # Normalize to float32 in [0, 1]
    array = array.astype(np.float32)
    if array.max() > 0:
        array = array / float(array.max())
    return array


# ---------------------------------------------------------------------------
# Channel splitting
# ---------------------------------------------------------------------------


def split_into_channels(
    image: np.ndarray,
    mapping: dict[str, int],
) -> dict[str, np.ndarray]:
    """Split an ``(H, W, C)`` image into the canonical channel dict.

    Parameters
    ----------
    image : np.ndarray
        ``(H, W, C)`` float32 image.
    mapping : dict[str, int]
        ``{channel_name: channel_index}``. Channel names should come from
        ``CANONICAL_CHANNEL_NAMES`` for downstream compatibility, but any
        string is accepted.

    Returns
    -------
    dict[str, np.ndarray]
        ``{name: (H, W) float32}`` ready to pass to
        :class:`glycoquant.profiles.ProfileAssembler`.

    Raises
    ------
    ValueError
        On non-3D input or out-of-range channel indices.
    """
    if image.ndim != 3:
        raise ValueError(f"expected (H, W, C) image, got shape {image.shape}")
    n_channels = image.shape[2]

    channels: dict[str, np.ndarray] = {}
    for name, idx in mapping.items():
        if not 0 <= idx < n_channels:
            raise ValueError(
                f"channel index {idx} for '{name}' out of range "
                f"[0, {n_channels})"
            )
        channels[name] = image[:, :, idx].astype(np.float32)
    return channels


# ---------------------------------------------------------------------------
# Downsampling for display
# ---------------------------------------------------------------------------


def downsample_for_display(
    image: np.ndarray,
    max_side: int = DEFAULT_DISPLAY_MAX_SIDE,
) -> np.ndarray:
    """Downsample an image so its longest side is at most ``max_side`` pixels.

    Preserves aspect ratio. Images already within the limit are returned
    unchanged. Used only for the Plotly ``imshow`` base layer in Tab 1 —
    analysis runs on the full-resolution original.

    Parameters
    ----------
    image : np.ndarray
        ``(H, W)`` or ``(H, W, C)`` float32 array.
    max_side : int
        Maximum allowed length of the longest side in pixels.

    Returns
    -------
    np.ndarray
        Downsampled image with the same number of channels, or the
        original if no downsampling was needed.
    """
    if image.ndim not in (2, 3):
        raise ValueError(f"expected 2D or 3D image, got shape {image.shape}")

    h, w = image.shape[:2]
    longest = max(h, w)
    if longest <= max_side:
        return image

    scale = max_side / longest
    new_h = int(round(h * scale))
    new_w = int(round(w * scale))
    new_shape = (new_h, new_w) + image.shape[2:]
    return resize(
        image, new_shape, preserve_range=True, anti_aliasing=True
    ).astype(np.float32)


# ---------------------------------------------------------------------------
# Hashing for cache keys
# ---------------------------------------------------------------------------


def hash_image_bytes(image: np.ndarray) -> str:
    """Stable SHA256 hex digest of a numpy array's byte buffer.

    Used as the cache key for ``@st.cache_data`` in the Tab 1 pipeline
    so re-running analysis on the same input is an instant cache hit.

    The hash covers both the contents and the dtype + shape, so two
    arrays with the same values but different types hash differently.
    """
    h = hashlib.sha256()
    h.update(str(image.shape).encode("ascii"))
    h.update(str(image.dtype).encode("ascii"))
    h.update(np.ascontiguousarray(image).tobytes())
    return h.hexdigest()
