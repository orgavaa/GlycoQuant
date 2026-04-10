"""Tests for glycoquant.features.deep_embedding.

Split into two tiers:

1. **Fast unit tests** for the pure-Python crop builder
   (``build_cell_crop``). No torch, no transformers, no model download.
   Runs in <1 s.

2. **Slow model smoke test** that loads DINOv2-base from HuggingFace
   (~340 MB first time) and confirms the full embed pipeline returns
   a ``(n_cells, 768)`` float32 array. Skipped if the environment
   cannot reach the HuggingFace hub; runs in ~30 s on a warm cache.
"""
from __future__ import annotations

import os

import numpy as np
import pytest
from skimage.draw import disk

from glycoquant.features import DinoV2Embedder, DinoV2Params, build_cell_crop

IMAGE_SIZE = (512, 512)


@pytest.fixture(scope="module")
def cell_mask(cell_specs: list) -> np.ndarray:
    mask = np.zeros(IMAGE_SIZE, dtype=np.int32)
    for i, spec in enumerate(cell_specs, start=1):
        rr, cc = disk(spec.center, spec.cell_radius, shape=IMAGE_SIZE)
        mask[rr, cc] = i
    return mask


@pytest.fixture(scope="module")
def three_channel_dict(
    synthetic_nuclear_image: np.ndarray,
    synthetic_glycocalyx_image: np.ndarray,
    synthetic_yap_image: np.ndarray,
) -> dict[str, np.ndarray]:
    return {
        "dapi": synthetic_nuclear_image,
        "glycocalyx": synthetic_glycocalyx_image,
        "yap": synthetic_yap_image,
    }


# ---------------------------------------------------------------------------
# Fast: crop builder (no model)
# ---------------------------------------------------------------------------


def test_params_defaults() -> None:
    params = DinoV2Params()
    assert params.model_name == "facebook/dinov2-base"
    assert params.crop_size == 224
    assert params.channel_assignment == ("dapi", "glycocalyx", "yap")


def test_build_cell_crop_has_correct_shape(
    three_channel_dict: dict[str, np.ndarray],
    cell_mask: np.ndarray,
) -> None:
    params = DinoV2Params()
    crop = build_cell_crop(three_channel_dict, cell_mask, cell_id=1, params=params)
    assert crop is not None
    assert crop.shape == (224, 224, 3)
    assert crop.dtype == np.float32


def test_build_cell_crop_channels_normalized(
    three_channel_dict: dict[str, np.ndarray],
    cell_mask: np.ndarray,
) -> None:
    crop = build_cell_crop(
        three_channel_dict, cell_mask, cell_id=1, params=DinoV2Params()
    )
    assert crop.min() >= 0.0
    assert crop.max() <= 1.0 + 1e-6


def test_build_cell_crop_custom_size_and_channels(
    three_channel_dict: dict[str, np.ndarray],
    cell_mask: np.ndarray,
) -> None:
    params = DinoV2Params(
        crop_size=128,
        channel_assignment=("glycocalyx", "yap", "dapi"),
    )
    crop = build_cell_crop(three_channel_dict, cell_mask, cell_id=2, params=params)
    assert crop.shape == (128, 128, 3)


def test_build_cell_crop_missing_cell_returns_none(
    three_channel_dict: dict[str, np.ndarray],
    cell_mask: np.ndarray,
) -> None:
    crop = build_cell_crop(
        three_channel_dict, cell_mask, cell_id=999, params=DinoV2Params()
    )
    assert crop is None


def test_build_cell_crop_all_five_cells_produce_crops(
    three_channel_dict: dict[str, np.ndarray],
    cell_mask: np.ndarray,
    cell_specs: list,
) -> None:
    params = DinoV2Params()
    crops = [
        build_cell_crop(three_channel_dict, cell_mask, cell_id=i, params=params)
        for i in range(1, len(cell_specs) + 1)
    ]
    assert all(c is not None for c in crops)
    assert all(c.shape == (224, 224, 3) for c in crops)


# ---------------------------------------------------------------------------
# Embedder API without triggering model load
# ---------------------------------------------------------------------------


def test_embedder_instantiation_does_not_load_model() -> None:
    """Lazy loading: constructing the embedder must not download weights."""
    embedder = DinoV2Embedder()
    assert embedder._model is None
    assert embedder._processor is None
    assert embedder.embedding_dim() == 768


def test_embedder_rejects_missing_channels(
    cell_mask: np.ndarray,
) -> None:
    embedder = DinoV2Embedder()
    # Only two of the three required channels
    channels = {
        "dapi": np.zeros(IMAGE_SIZE, dtype=np.float32),
        "glycocalyx": np.zeros(IMAGE_SIZE, dtype=np.float32),
    }
    with pytest.raises(ValueError, match="missing"):
        embedder.embed_image_with_masks(channels, cell_mask)


def test_embedder_rejects_shape_mismatch(cell_mask: np.ndarray) -> None:
    embedder = DinoV2Embedder()
    channels = {
        "dapi": np.zeros((256, 256), dtype=np.float32),
        "glycocalyx": np.zeros(IMAGE_SIZE, dtype=np.float32),
        "yap": np.zeros(IMAGE_SIZE, dtype=np.float32),
    }
    with pytest.raises(ValueError, match="shape"):
        embedder.embed_image_with_masks(channels, cell_mask)


def test_empty_crop_list_returns_zero_shape_array() -> None:
    embedder = DinoV2Embedder()
    result = embedder.embed_cell_crops([])
    assert result.shape == (0, 768)
    assert result.dtype == np.float32


# ---------------------------------------------------------------------------
# Slow: real model smoke test
# ---------------------------------------------------------------------------


@pytest.mark.slow
@pytest.mark.skipif(
    os.environ.get("GLYCOQUANT_SKIP_SLOW") == "1",
    reason="set GLYCOQUANT_SKIP_SLOW=1 to skip DINOv2 download",
)
def test_dinov2_embed_returns_correct_shape_on_real_model(
    three_channel_dict: dict[str, np.ndarray],
    cell_mask: np.ndarray,
    cell_specs: list,
) -> None:
    """End-to-end: load DINOv2 and embed all 5 synthetic cells.

    First invocation downloads ~340 MB; subsequent runs are cached.
    """
    embedder = DinoV2Embedder()
    cell_ids, embeddings = embedder.embed_image_with_masks(
        three_channel_dict, cell_mask
    )
    assert len(cell_ids) == len(cell_specs)
    assert embeddings.shape == (len(cell_specs), 768)
    assert embeddings.dtype == np.float32
    # Embeddings should not be identically zero
    assert np.abs(embeddings).sum() > 0.0
