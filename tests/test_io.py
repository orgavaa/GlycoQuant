"""Tests for glycoquant.io.image_io."""
from __future__ import annotations

import numpy as np
import pytest
import tifffile
from PIL import Image

from glycoquant.io import (
    downsample_for_display,
    hash_image_bytes,
    load_multichannel_image,
    split_into_channels,
)

# ---------------------------------------------------------------------------
# load_multichannel_image
# ---------------------------------------------------------------------------


def test_load_from_path_roundtrips_5_channel_tiff(tmp_path) -> None:
    """Writing a 5-channel TIFF and loading it back yields (H, W, 5) float32 in [0, 1]."""
    rng = np.random.default_rng(0)
    original = (rng.random((5, 256, 256)) * 255).astype(np.uint8)  # (C, H, W)
    path = tmp_path / "test_5ch.tiff"
    tifffile.imwrite(path, original)

    loaded = load_multichannel_image(path)
    assert loaded.shape == (256, 256, 5)
    assert loaded.dtype == np.float32
    assert loaded.min() >= 0.0
    assert loaded.max() <= 1.0 + 1e-6


def test_load_from_bytes(tmp_path) -> None:
    """Loading from a raw bytes buffer works."""
    arr = np.zeros((3, 128, 128), dtype=np.uint8)
    path = tmp_path / "x.tiff"
    tifffile.imwrite(path, arr)
    raw = path.read_bytes()

    loaded = load_multichannel_image(raw)
    assert loaded.shape == (128, 128, 3)


def test_load_from_file_like_object(tmp_path) -> None:
    """Streamlit-style UploadedFile (file-like with .read()) works."""
    arr = np.zeros((2, 64, 64), dtype=np.uint8)
    path = tmp_path / "x.tiff"
    tifffile.imwrite(path, arr)

    with path.open("rb") as fh:
        loaded = load_multichannel_image(fh)
    assert loaded.shape == (64, 64, 2)


def test_load_grayscale_png_returns_single_channel(tmp_path) -> None:
    """A single-channel PNG returns shape (H, W, 1)."""
    im = Image.new("L", (32, 32), color=128)
    path = tmp_path / "gray.png"
    im.save(path)

    loaded = load_multichannel_image(path)
    assert loaded.shape == (32, 32, 1)


def test_load_rgb_png_returns_3_channels(tmp_path) -> None:
    im = Image.new("RGB", (40, 30), color=(10, 20, 30))
    path = tmp_path / "rgb.png"
    im.save(path)

    loaded = load_multichannel_image(path)
    assert loaded.shape == (30, 40, 3)


def test_load_rejects_unsupported_type() -> None:
    with pytest.raises(TypeError, match="unsupported"):
        load_multichannel_image(12345)  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# split_into_channels
# ---------------------------------------------------------------------------


def test_split_into_channels_returns_canonical_dict() -> None:
    image = np.stack(
        [np.full((64, 64), k / 5.0, dtype=np.float32) for k in range(5)],
        axis=-1,
    )  # (64, 64, 5)
    mapping = {
        "dapi": 0,
        "glycocalyx": 1,
        "yap": 2,
        "paxillin": 3,
        "actin": 4,
    }
    channels = split_into_channels(image, mapping)
    assert set(channels.keys()) == set(mapping.keys())
    for name, idx in mapping.items():
        assert channels[name].shape == (64, 64)
        assert np.allclose(channels[name], idx / 5.0)


def test_split_into_channels_rejects_non_3d() -> None:
    image = np.zeros((64, 64), dtype=np.float32)
    with pytest.raises(ValueError, match=r"\(H, W, C\)"):
        split_into_channels(image, {"dapi": 0})


def test_split_into_channels_rejects_out_of_range_index() -> None:
    image = np.zeros((64, 64, 3), dtype=np.float32)
    with pytest.raises(ValueError, match="out of range"):
        split_into_channels(image, {"dapi": 5})


# ---------------------------------------------------------------------------
# downsample_for_display
# ---------------------------------------------------------------------------


def test_downsample_large_image_to_max_side() -> None:
    image = np.zeros((2048, 2048, 5), dtype=np.float32)
    out = downsample_for_display(image, max_side=1024)
    assert out.shape == (1024, 1024, 5)


def test_downsample_preserves_aspect_ratio() -> None:
    image = np.zeros((2048, 1024, 3), dtype=np.float32)
    out = downsample_for_display(image, max_side=1024)
    assert out.shape[0] == 1024  # longer side
    assert out.shape[1] == 512  # shorter side, halved
    assert out.shape[2] == 3


def test_downsample_leaves_small_image_unchanged() -> None:
    image = np.ones((256, 256, 2), dtype=np.float32)
    out = downsample_for_display(image, max_side=1024)
    assert out.shape == (256, 256, 2)
    assert np.allclose(out, image)


def test_downsample_handles_2d_image() -> None:
    image = np.zeros((2000, 2000), dtype=np.float32)
    out = downsample_for_display(image, max_side=500)
    assert out.shape == (500, 500)


def test_downsample_rejects_non_2d_or_3d() -> None:
    bad = np.zeros((4, 512, 512, 3), dtype=np.float32)
    with pytest.raises(ValueError, match="2D or 3D"):
        downsample_for_display(bad)


# ---------------------------------------------------------------------------
# hash_image_bytes
# ---------------------------------------------------------------------------


def test_hash_is_deterministic() -> None:
    a = np.arange(100, dtype=np.float32).reshape(10, 10)
    b = np.arange(100, dtype=np.float32).reshape(10, 10)
    assert hash_image_bytes(a) == hash_image_bytes(b)


def test_hash_differs_for_different_content() -> None:
    a = np.zeros((10, 10), dtype=np.float32)
    b = np.ones((10, 10), dtype=np.float32)
    assert hash_image_bytes(a) != hash_image_bytes(b)


def test_hash_differs_for_different_shape() -> None:
    a = np.zeros((10, 10), dtype=np.float32)
    b = np.zeros((20, 5), dtype=np.float32)
    assert hash_image_bytes(a) != hash_image_bytes(b)


def test_hash_differs_for_different_dtype() -> None:
    a = np.zeros((10, 10), dtype=np.float32)
    b = np.zeros((10, 10), dtype=np.float64)
    assert hash_image_bytes(a) != hash_image_bytes(b)


def test_hash_is_hex_sha256() -> None:
    h = hash_image_bytes(np.zeros((4, 4), dtype=np.uint8))
    assert len(h) == 64
    int(h, 16)  # raises if not valid hex
