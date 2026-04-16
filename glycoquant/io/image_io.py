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

DEFAULT_DISPLAY_MAX_SIDE = 2048  # pixels

# Canonical channel names that downstream code (ProfileAssembler,
# DinoV2Embedder) expects.
CANONICAL_CHANNEL_NAMES = (
    "dapi",
    "glycocalyx",
    "yap",
    "paxillin",
    "actin",
    "heparan_sulfate",
)


# ---------------------------------------------------------------------------
# Loading
# ---------------------------------------------------------------------------


def load_multichannel_image(
    source: str | Path | bytes | BinaryIO,
) -> np.ndarray:
    """Load a multi-channel image from disk, bytes, or a file-like object.

    Thin wrapper around :func:`load_multichannel_image_with_provenance`
    that returns only the image — preserved for the existing call
    sites that don't care about z-stack provenance metadata.
    """
    image, _ = load_multichannel_image_with_provenance(source)
    return image


def load_multichannel_image_with_provenance(
    source: str | Path | bytes | BinaryIO,
) -> tuple[np.ndarray, dict[str, object]]:
    """Load a multi-channel image and report what was done to it.

    Returns
    -------
    (image, provenance) : tuple[np.ndarray, dict]
        - ``image``: ``(H, W, C)`` float32 array in ``[0, 1]``.
        - ``provenance``: dict with keys
          ``z_projection`` (``"max"`` or ``None``) — set to ``"max"``
          when a confocal z-stack was detected and flattened to a
          maximum-intensity projection along z;
          ``z_planes`` (int | None) — number of z-planes flattened;
          ``raw_shape`` (tuple) — the original shape before any
          canonicalisation, useful for the UI banner;
          ``axes`` (str | None) — the TIFF ``axes`` metadata if available
          (e.g. ``"ZCYX"``), used to disambiguate z-stacks from
          multi-channel arrays when the array's bare shape is
          ambiguous.

    Confocal z-stacks (most Leica/Zeiss acquisitions) arrive as 4D
    ``(Z, C, H, W)`` or ``(C, Z, H, W)`` arrays. The 2D feature
    extractors cannot consume those directly. Maximum-intensity
    projection along the z-axis is the standard preview compromise:
    fast, deterministic, preserves the brightest signal at every
    pixel, and matches what most papers display in figures. It is NOT
    a substitute for a true 3D analysis (the platform is 2D-only by
    design today), but it is the right operational fallback for "drop
    in a confocal stack and just process it".
    """
    buffer = _coerce_to_bytes(source)

    raw_shape: tuple[int, ...] | None = None
    axes: str | None = None
    array: np.ndarray | None = None

    # Try TIFF first (handles multi-page + axis metadata).
    try:
        with tifffile.TiffFile(io.BytesIO(buffer)) as tf:
            array = tf.asarray()
            raw_shape = tuple(array.shape)
            # OME-TIFF / ImageJ-TIFF often carries an ``axes`` string
            # like "ZCYX" or "TZCYX" on the first series. Use it as
            # the authoritative discriminator when present.
            if tf.series:
                axes = tf.series[0].axes
    except (tifffile.TiffFileError, ValueError):
        with Image.open(io.BytesIO(buffer)) as im:
            array = np.array(im)
            raw_shape = tuple(array.shape)

    z_projection: str | None = None
    z_planes: int | None = None
    array, z_projection, z_planes = _maybe_max_project(array, axes=axes)
    canonical = _canonicalize(array)
    return canonical, {
        "z_projection": z_projection,
        "z_planes": z_planes,
        "raw_shape": raw_shape,
        "axes": axes,
    }


def _maybe_max_project(
    array: np.ndarray,
    axes: str | None,
) -> tuple[np.ndarray, str | None, int | None]:
    """Detect a z-stack and return the max-projected 2D/3D array.

    Two paths:

    1. **Authoritative**: TIFF ``axes`` metadata. If ``"Z"`` is in the
       axes string, project along that axis. Drops any leading ``T``
       (time) axis by selecting the first frame so the analysis stays
       2D — multi-timepoint pipelines are out of scope today.

    2. **Heuristic**: when ``axes`` is missing (PNG, plain TIFF), a
       4D array is interpreted as ``(Z, C, H, W)`` if the first axis
       is small (≤ 100) and the second axis is in the typical
       channel-count range (1–8). Otherwise raise rather than guess
       wrong on a 4D image — the user can pre-flatten in Fiji.

    Returns the projected array, ``z_projection`` ("max" or None),
    and the number of z-planes flattened.
    """
    if array is None:
        return array, None, None

    # Path 1: authoritative axes metadata
    if axes:
        axes_upper = axes.upper()
        if "Z" not in axes_upper:
            return array, None, None
        # Drop time and select the first frame
        if "T" in axes_upper:
            t_idx = axes_upper.index("T")
            array = np.take(array, 0, axis=t_idx)
            axes_upper = axes_upper[:t_idx] + axes_upper[t_idx + 1 :]
        z_idx = axes_upper.index("Z")
        z_planes = int(array.shape[z_idx])
        if z_planes <= 1:
            # Single-plane "stack" — squeeze and return
            return np.squeeze(array, axis=z_idx), None, None
        projected = np.max(array, axis=z_idx)
        return projected, "max", z_planes

    # Path 2: heuristic on bare arrays
    if array.ndim == 4:
        # Common Leica/Zeiss layouts: (Z, C, H, W) or (C, Z, H, W).
        # Disambiguate by axis size: channels are typically ≤ 8,
        # z-planes typically 5-100.
        a0, a1 = int(array.shape[0]), int(array.shape[1])
        if a0 <= 8 and a1 > 8:
            # (C, Z, H, W) → max-project axis 1
            z_planes = a1
            projected = np.max(array, axis=1)
            return projected, "max", z_planes
        if a1 <= 8 and a0 > 8:
            # (Z, C, H, W) → max-project axis 0
            z_planes = a0
            projected = np.max(array, axis=0)
            return projected, "max", z_planes
        if a0 <= 8 and a1 <= 8:
            # Both ambiguous (e.g. 5 channels × 5 z-planes) — refuse rather
            # than guess wrong; the user can pre-flatten in Fiji.
            raise ValueError(
                f"4D array shape {array.shape} is ambiguous: cannot tell whether "
                "the first two axes are (Z, C) or (C, Z). Pre-flatten with a "
                "max-intensity projection in Fiji/Imaris and re-upload."
            )
        # Both >8 — likely (Z, H, W, C) RGB stack; max-project Z
        z_planes = a0
        projected = np.max(array, axis=0)
        return projected, "max", z_planes

    return array, None, None


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
