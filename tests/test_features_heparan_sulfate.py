"""Tests for the heparan-sulfate sibling extractor.

The HS extractor delegates to extract_glycocalyx_features and
renames keys glycocalyx_* → hs_*. These tests assert the rename is
exhaustive (no glycocalyx_* keys leak through) and the underlying
math matches the WGA path on the same input — confirming the
sibling is a faithful namespace move and not a silent
re-implementation.
"""
from __future__ import annotations

import math

import numpy as np
import pytest
from skimage.draw import disk

from glycoquant.features.glycocalyx import extract_glycocalyx_features
from glycoquant.features.heparan_sulfate import (
    _rename_key,
    extract_hs_features,
)


@pytest.fixture
def synthetic_ring_image() -> tuple[np.ndarray, np.ndarray]:
    """A 2-cell synthetic image with a bright pericellular ring per cell."""
    image = np.zeros((128, 128), dtype=np.float32)
    mask = np.zeros((128, 128), dtype=np.int32)
    # Ring = outer disc - inner disc
    rr_out, cc_out = disk((40, 40), 22, shape=image.shape)
    rr_in, cc_in = disk((40, 40), 16, shape=image.shape)
    image[rr_out, cc_out] = 0.5
    image[rr_in, cc_in] = 0.0  # cytoplasm dark
    mask[rr_in, cc_in] = 1
    # Second cell
    rr_out2, cc_out2 = disk((90, 90), 24, shape=image.shape)
    rr_in2, cc_in2 = disk((90, 90), 18, shape=image.shape)
    image[rr_out2, cc_out2] = 0.7
    image[rr_in2, cc_in2] = 0.0
    mask[rr_in2, cc_in2] = 2
    return image, mask


def test_hs_extractor_returns_only_hs_prefixed_keys(synthetic_ring_image) -> None:
    image, mask = synthetic_ring_image
    feats = extract_hs_features(image, mask, cell_id=1)
    for key in feats:
        assert not key.startswith("glycocalyx_"), (
            f"key {key!r} retains the WGA prefix — rename leaked"
        )
    # Every returned key starts with hs_ (no other prefixes by design)
    for key in feats:
        assert key.startswith("hs_"), key


def test_hs_extractor_values_match_wga_on_same_input(synthetic_ring_image) -> None:
    """Same channel, same mask → renaming must preserve values exactly."""
    image, mask = synthetic_ring_image
    glyco = extract_glycocalyx_features(image, mask, cell_id=2)
    hs = extract_hs_features(image, mask, cell_id=2)
    for glyco_key, glyco_val in glyco.items():
        hs_key = _rename_key(glyco_key)
        assert hs_key in hs, f"missing renamed key {hs_key}"
        hs_val = hs[hs_key]
        if isinstance(glyco_val, list):
            # Radial profile is a list — compare element-wise
            assert isinstance(hs_val, list)
            for a, b in zip(glyco_val, hs_val):
                if math.isnan(a) and math.isnan(b):
                    continue
                assert a == pytest.approx(b)
        elif math.isnan(glyco_val):
            assert math.isnan(hs_val)
        else:
            assert glyco_val == pytest.approx(hs_val)


def test_rename_key_passthrough_for_non_glycocalyx_prefix() -> None:
    """Defensive: any future field added to the WGA extractor that
    doesn't follow the convention is preserved unchanged."""
    assert _rename_key("not_a_glyco_field") == "not_a_glyco_field"
    assert _rename_key("hs_already_renamed") == "hs_already_renamed"


def test_assembler_runs_hs_extractor_when_channel_present() -> None:
    """End-to-end: ProfileAssembler produces hs_* columns when supplied."""
    pytest.importorskip("cellpose")  # assembler import chain needs cellpose
    from glycoquant.profiles import AssemblerConfig, ProfileAssembler

    image, mask = _build_two_cell_test_image()

    # Hand-crafted nuclear mask matching the cells
    nuclear_mask = np.zeros_like(mask)
    rr, cc = disk((40, 40), 8, shape=mask.shape)
    nuclear_mask[rr, cc] = 1
    rr, cc = disk((90, 90), 10, shape=mask.shape)
    nuclear_mask[rr, cc] = 2

    channels = {
        "dapi": image.astype(np.float32),
        "glycocalyx": image.astype(np.float32),
        "heparan_sulfate": (image * 1.5).astype(np.float32),
    }
    config = AssemblerConfig(background_radius_px=0)  # disable top-hat for synthetic
    assembler = ProfileAssembler(config=config)
    df = assembler.process_image(channels, cell_mask=mask, nuclear_mask=nuclear_mask)

    # Both column families must be present
    glyco_cols = [c for c in df.columns if c.startswith("glycocalyx_")]
    hs_cols = [c for c in df.columns if c.startswith("hs_")]
    assert len(glyco_cols) > 5
    assert len(hs_cols) > 5
    # Every hs_* column must have a matching glycocalyx_* sibling
    for hs_col in hs_cols:
        sibling = "glycocalyx_" + hs_col[len("hs_"):]
        assert sibling in glyco_cols, f"hs_ col {hs_col} has no glycocalyx_ sibling"


def _build_two_cell_test_image() -> tuple[np.ndarray, np.ndarray]:
    """Helper duplicated from the fixture — used by the optional assembler test."""
    image = np.zeros((128, 128), dtype=np.float32)
    mask = np.zeros((128, 128), dtype=np.int32)
    rr_out, cc_out = disk((40, 40), 22, shape=image.shape)
    rr_in, cc_in = disk((40, 40), 16, shape=image.shape)
    image[rr_out, cc_out] = 0.5
    image[rr_in, cc_in] = 0.0
    mask[rr_in, cc_in] = 1
    rr_out2, cc_out2 = disk((90, 90), 24, shape=image.shape)
    rr_in2, cc_in2 = disk((90, 90), 18, shape=image.shape)
    image[rr_out2, cc_out2] = 0.7
    image[rr_in2, cc_in2] = 0.0
    mask[rr_in2, cc_in2] = 2
    return image, mask
