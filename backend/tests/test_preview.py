"""Unit tests for the shared preview-compositing helper + /analysis/preview."""
from __future__ import annotations

import io

import numpy as np
import pytest
import tifffile
from fastapi.testclient import TestClient
from PIL import Image

from backend.app.main import app
from backend.app.preview import composite_preview_png


@pytest.fixture(scope="module")
def client() -> TestClient:
    return TestClient(app)


def _decode_png(blob: bytes) -> np.ndarray:
    return np.asarray(Image.open(io.BytesIO(blob)).convert("RGB"))


# ---------------------------------------------------------------------------
# composite_preview_png — shape coverage
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("n_channels", [1, 2, 3, 4, 5, 7])
def test_composite_handles_any_channel_count(n_channels: int) -> None:
    rng = np.random.default_rng(n_channels)
    image = rng.random((128, 128, n_channels), dtype=np.float32)
    blob = composite_preview_png(image)
    assert blob.startswith(b"\x89PNG")
    arr = _decode_png(blob)
    assert arr.shape == (128, 128, 3)
    # Percentile stretch guarantees at least one pixel reaches ~255 in
    # every channel (unless the input was constant, which random isn't).
    assert arr.max() > 200


def test_composite_accepts_2d_grayscale() -> None:
    image = np.linspace(0, 1, 64 * 64, dtype=np.float32).reshape(64, 64)
    blob = composite_preview_png(image)
    arr = _decode_png(blob)
    assert arr.shape == (64, 64, 3)
    # 1-channel path replicates the same channel into R=G=B
    np.testing.assert_array_equal(arr[..., 0], arr[..., 1])
    np.testing.assert_array_equal(arr[..., 1], arr[..., 2])


def test_composite_rejects_4d_input() -> None:
    with pytest.raises(ValueError):
        composite_preview_png(np.zeros((2, 2, 2, 2), dtype=np.float32))


def test_composite_rejects_empty_input() -> None:
    with pytest.raises(ValueError):
        composite_preview_png(np.zeros((0, 0), dtype=np.float32))


# ---------------------------------------------------------------------------
# POST /analysis/preview — happy path + error surfaces
# ---------------------------------------------------------------------------


def _make_tiff_bytes(n_channels: int) -> bytes:
    rng = np.random.default_rng(42)
    image = (rng.random((n_channels, 64, 64), dtype=np.float32) * 255).astype("uint16")
    buf = io.BytesIO()
    tifffile.imwrite(buf, image)
    return buf.getvalue()


def test_upload_preview_5_channel_tiff(client: TestClient) -> None:
    resp = client.post(
        "/analysis/preview",
        files={"upload": ("fake.tiff", _make_tiff_bytes(5), "image/tiff")},
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "image/png"
    assert resp.content.startswith(b"\x89PNG")


def test_upload_preview_3_channel_tiff_still_renders(client: TestClient) -> None:
    resp = client.post(
        "/analysis/preview",
        files={"upload": ("fake.tiff", _make_tiff_bytes(3), "image/tiff")},
    )
    assert resp.status_code == 200
    assert resp.content.startswith(b"\x89PNG")


def test_upload_preview_png(client: TestClient) -> None:
    img = Image.new("RGB", (32, 32), color=(200, 100, 50))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    resp = client.post(
        "/analysis/preview",
        files={"upload": ("fake.png", buf.getvalue(), "image/png")},
    )
    assert resp.status_code == 200
    assert resp.content.startswith(b"\x89PNG")


def test_upload_preview_rejects_garbage(client: TestClient) -> None:
    resp = client.post(
        "/analysis/preview",
        files={"upload": ("junk.tiff", b"not an image", "image/tiff")},
    )
    assert resp.status_code == 422
    assert "Could not read" in resp.json()["detail"]
