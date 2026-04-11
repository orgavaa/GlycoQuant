"""Tests for the Cell-DINO channel-adaptive embedder.

Both the heavy "actually load the model" tests and the lightweight
"crop builder + column naming" tests live in this module. The heavy
tests are gated on:

    1. ``GLYCOQUANT_CELL_DINO_CKPT`` env var being set to an existing
       file (the operator has gone through the FAIR access form), AND
    2. The ``slow`` pytest marker being enabled.

The lightweight tests run in normal CI without any external setup —
they exercise ``build_cell_crop_multichannel`` and the embedder's
``column_names`` / ``embedding_dim`` / ``backend_name`` interface,
which is enough to catch most regressions in the integration glue.
"""
from __future__ import annotations

import os
from pathlib import Path

import numpy as np
import pytest
from skimage.draw import disk

from glycoquant.features import (
    ChannelAdaptiveDinoEmbedder,
    ChannelAdaptiveDinoParams,
    build_cell_crop_multichannel,
)


# ---------------------------------------------------------------------------
# Lightweight tests — always run
# ---------------------------------------------------------------------------


def _synth_channels(h: int = 128, w: int = 128) -> dict[str, np.ndarray]:
    rng = np.random.default_rng(0)
    return {
        name: rng.random((h, w), dtype=np.float32)
        for name in ("dapi", "glycocalyx", "yap", "paxillin", "actin")
    }


def _synth_mask(h: int = 128, w: int = 128, n_cells: int = 4) -> np.ndarray:
    mask = np.zeros((h, w), dtype=np.int32)
    rng = np.random.default_rng(1)
    for i in range(1, n_cells + 1):
        cy = int(rng.integers(15, h - 15))
        cx = int(rng.integers(15, w - 15))
        rr, cc = disk((cy, cx), 10, shape=(h, w))
        mask[rr, cc] = i
    return mask


def test_build_crop_returns_channel_first_5_h_w() -> None:
    channels = _synth_channels()
    mask = _synth_mask()
    params = ChannelAdaptiveDinoParams(
        crop_size=224, checkpoint_path="/dev/null"  # bypassed since we don't load
    )
    crop = build_cell_crop_multichannel(channels, mask, cell_id=1, params=params)
    assert crop is not None
    assert crop.shape == (5, 224, 224)
    assert crop.dtype == np.float32
    # All channels should have non-zero variance for a random fixture
    for c in range(5):
        assert crop[c].std() > 0.0


def test_build_crop_returns_none_for_missing_cell() -> None:
    channels = _synth_channels()
    mask = _synth_mask()
    params = ChannelAdaptiveDinoParams(checkpoint_path="/dev/null")
    crop = build_cell_crop_multichannel(channels, mask, cell_id=999, params=params)
    assert crop is None


def test_constructor_raises_without_checkpoint_path() -> None:
    with pytest.raises(ValueError, match="GLYCOQUANT_CELL_DINO_CKPT"):
        ChannelAdaptiveDinoEmbedder(ChannelAdaptiveDinoParams(checkpoint_path=None))


def test_column_names_layout() -> None:
    """5 channels × 1024 dims = 5120 columns, channel-prefixed in order."""
    embedder = ChannelAdaptiveDinoEmbedder(
        ChannelAdaptiveDinoParams(checkpoint_path="/dev/null")
    )
    cols = embedder.column_names()
    assert len(cols) == 5120
    assert embedder.embedding_dim() == 5120
    # First block is dapi
    assert cols[0] == "deep_dapi_0000"
    assert cols[1023] == "deep_dapi_1023"
    # Second block is glycocalyx
    assert cols[1024] == "deep_glycocalyx_0000"
    assert cols[2047] == "deep_glycocalyx_1023"
    # Third block is yap
    assert cols[2048] == "deep_yap_0000"
    # Fourth block is paxillin
    assert cols[3072] == "deep_paxillin_0000"
    # Fifth block is actin
    assert cols[4096] == "deep_actin_0000"
    assert cols[5119] == "deep_actin_1023"


def test_backend_name() -> None:
    embedder = ChannelAdaptiveDinoEmbedder(
        ChannelAdaptiveDinoParams(checkpoint_path="/dev/null")
    )
    assert embedder.backend_name() == "cell_dino_channel_adaptive"


# ---------------------------------------------------------------------------
# Heavy tests — only run when the operator has provisioned a checkpoint
# ---------------------------------------------------------------------------

_CKPT_ENV = "GLYCOQUANT_CELL_DINO_CKPT"
_ckpt_path = os.environ.get(_CKPT_ENV)
_ckpt_available = _ckpt_path is not None and Path(_ckpt_path).is_file()
_skip_reason = (
    f"set {_CKPT_ENV} to a downloaded channel_adaptive_dino_vitl16.pth "
    "checkpoint to enable Cell-DINO inference tests; see docs/CELL_DINO_SETUP.md"
)


@pytest.mark.slow
@pytest.mark.skipif(not _ckpt_available, reason=_skip_reason)
def test_embed_image_with_masks_produces_5120_d_per_cell() -> None:
    """End-to-end inference call. Runs only when the FAIR weights are present."""
    channels = _synth_channels()
    mask = _synth_mask(n_cells=4)
    embedder = ChannelAdaptiveDinoEmbedder(
        ChannelAdaptiveDinoParams(checkpoint_path=_ckpt_path)
    )
    cell_ids, embeddings = embedder.embed_image_with_masks(channels, mask)
    assert len(cell_ids) == 4
    assert embeddings.shape == (4, 5120)
    assert np.isfinite(embeddings).all()


@pytest.mark.slow
@pytest.mark.skipif(not _ckpt_available, reason=_skip_reason)
def test_per_channel_blocks_have_independent_variance() -> None:
    """Sanity check that the model isn't zero-passing some channels.

    Each 1024-D channel block should have non-zero variance across
    the 4 cells in the synthetic fixture. If a block is all-zero or
    constant, the channel-adaptive forward path is broken.
    """
    channels = _synth_channels()
    mask = _synth_mask(n_cells=4)
    embedder = ChannelAdaptiveDinoEmbedder(
        ChannelAdaptiveDinoParams(checkpoint_path=_ckpt_path)
    )
    _, embeddings = embedder.embed_image_with_masks(channels, mask)
    for block_idx, ch in enumerate(
        ("dapi", "glycocalyx", "yap", "paxillin", "actin")
    ):
        block = embeddings[:, block_idx * 1024 : (block_idx + 1) * 1024]
        assert block.std() > 0.0, f"channel {ch} block is constant"
