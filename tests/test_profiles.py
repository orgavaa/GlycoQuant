"""Integration tests for glycoquant.profiles.assembler.

Runs the full feature-extraction pipeline against pre-computed masks
(built inline from ``cell_specs``) so Cellpose is never invoked — the
whole suite runs in <1 s.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest
from skimage.draw import disk

from glycoquant.profiles import (
    CANONICAL_CHANNELS,
    AssemblerConfig,
    ProfileAssembler,
)

IMAGE_SIZE = (512, 512)


@pytest.fixture(scope="module")
def cell_mask(cell_specs: list) -> np.ndarray:
    mask = np.zeros(IMAGE_SIZE, dtype=np.int32)
    for i, spec in enumerate(cell_specs, start=1):
        rr, cc = disk(spec.center, spec.cell_radius, shape=IMAGE_SIZE)
        mask[rr, cc] = i
    return mask


@pytest.fixture(scope="module")
def nuclear_mask(cell_specs: list) -> np.ndarray:
    mask = np.zeros(IMAGE_SIZE, dtype=np.int32)
    for i, spec in enumerate(cell_specs, start=1):
        rr, cc = disk(spec.center, spec.nuclear_radius, shape=IMAGE_SIZE)
        mask[rr, cc] = i
    return mask


@pytest.fixture(scope="module")
def full_channels(
    synthetic_cell_image: np.ndarray,
    synthetic_nuclear_image: np.ndarray,
    synthetic_glycocalyx_image: np.ndarray,
    synthetic_yap_image: np.ndarray,
    synthetic_paxillin_image: np.ndarray,
) -> dict[str, np.ndarray]:
    return {
        "dapi": synthetic_nuclear_image,
        "glycocalyx": synthetic_glycocalyx_image,
        "yap": synthetic_yap_image,
        "paxillin": synthetic_paxillin_image,
        "actin": synthetic_cell_image,
    }


def test_canonical_channels_are_the_five_expected() -> None:
    assert set(CANONICAL_CHANNELS) == {
        "dapi",
        "glycocalyx",
        "yap",
        "paxillin",
        "actin",
    }


def test_process_image_with_precomputed_masks_produces_one_row_per_cell(
    full_channels: dict[str, np.ndarray],
    cell_mask: np.ndarray,
    nuclear_mask: np.ndarray,
    cell_specs: list,
) -> None:
    assembler = ProfileAssembler()
    df = assembler.process_image(
        full_channels, cell_mask=cell_mask, nuclear_mask=nuclear_mask
    )

    assert isinstance(df, pd.DataFrame)
    assert len(df) == len(cell_specs)
    assert df.index.name == "cell_id"


def test_full_feature_count(
    full_channels: dict[str, np.ndarray],
    cell_mask: np.ndarray,
    nuclear_mask: np.ndarray,
) -> None:
    """At least 25 scalar feature columns across the 5 extractors."""
    assembler = ProfileAssembler()
    df = assembler.process_image(
        full_channels, cell_mask=cell_mask, nuclear_mask=nuclear_mask
    )
    # glycocalyx scalar features: 5 (radial profile list is dropped by default)
    # yap: 4, fa: 6, actin: 4, morphology: 6 → 25 total
    assert df.shape[1] >= 25


def test_radial_profile_dropped_by_default(
    full_channels: dict[str, np.ndarray],
    cell_mask: np.ndarray,
    nuclear_mask: np.ndarray,
) -> None:
    assembler = ProfileAssembler()
    df = assembler.process_image(
        full_channels, cell_mask=cell_mask, nuclear_mask=nuclear_mask
    )
    assert "glycocalyx_radial_profile" not in df.columns


def test_include_radial_profile_expands_into_bin_columns(
    full_channels: dict[str, np.ndarray],
    cell_mask: np.ndarray,
    nuclear_mask: np.ndarray,
) -> None:
    assembler = ProfileAssembler(
        config=AssemblerConfig(include_radial_profile=True)
    )
    df = assembler.process_image(
        full_channels, cell_mask=cell_mask, nuclear_mask=nuclear_mask
    )
    profile_cols = [
        c for c in df.columns if c.startswith("glycocalyx_radial_profile_")
    ]
    assert len(profile_cols) == 20  # default n_radial_bins


def test_yap_nc_ratio_matches_synthetic_ground_truth(
    full_channels: dict[str, np.ndarray],
    cell_mask: np.ndarray,
    nuclear_mask: np.ndarray,
) -> None:
    """Fixture has nuclear=2.0 and cytoplasmic=1.0 → N/C = 2.0 for every row."""
    assembler = ProfileAssembler()
    df = assembler.process_image(
        full_channels, cell_mask=cell_mask, nuclear_mask=nuclear_mask
    )
    assert (df["yap_nc_ratio"].round(6) == 2.0).all()


def test_morphology_columns_match_disk_geometry(
    full_channels: dict[str, np.ndarray],
    cell_mask: np.ndarray,
    nuclear_mask: np.ndarray,
) -> None:
    assembler = ProfileAssembler()
    df = assembler.process_image(
        full_channels, cell_mask=cell_mask, nuclear_mask=nuclear_mask
    )
    # Circular synthetic cells: circularity ~1 and aspect_ratio ~1
    assert (df["cell_circularity"] > 0.8).all()
    assert (df["cell_aspect_ratio"].between(0.9, 1.15)).all()


def test_partial_channels_skip_their_extractors(
    cell_mask: np.ndarray,
    nuclear_mask: np.ndarray,
    synthetic_glycocalyx_image: np.ndarray,
) -> None:
    """Only supplying glycocalyx + DAPI skips YAP / FA / actin columns."""
    channels = {
        "dapi": np.zeros(IMAGE_SIZE, dtype=np.float32),
        "glycocalyx": synthetic_glycocalyx_image,
    }
    assembler = ProfileAssembler()
    df = assembler.process_image(
        channels, cell_mask=cell_mask, nuclear_mask=nuclear_mask
    )
    assert len(df) == 5
    assert "glycocalyx_mean_intensity" in df.columns
    assert "yap_nc_ratio" not in df.columns
    assert "fa_count" not in df.columns
    assert "actin_stress_fiber_coherence" not in df.columns
    # Morphology always runs
    assert "cell_area" in df.columns


def test_empty_mask_returns_empty_dataframe(
    full_channels: dict[str, np.ndarray],
) -> None:
    empty = np.zeros(IMAGE_SIZE, dtype=np.int32)
    assembler = ProfileAssembler()
    df = assembler.process_image(
        full_channels, cell_mask=empty, nuclear_mask=empty
    )
    assert df.empty


def test_rejects_empty_channels_dict(
    cell_mask: np.ndarray,
    nuclear_mask: np.ndarray,
) -> None:
    assembler = ProfileAssembler()
    with pytest.raises(ValueError, match="empty"):
        assembler.process_image({}, cell_mask=cell_mask, nuclear_mask=nuclear_mask)


def test_rejects_mismatched_channel_shapes(
    cell_mask: np.ndarray,
    nuclear_mask: np.ndarray,
) -> None:
    channels = {
        "dapi": np.zeros(IMAGE_SIZE, dtype=np.float32),
        "glycocalyx": np.zeros((256, 256), dtype=np.float32),
    }
    assembler = ProfileAssembler()
    with pytest.raises(ValueError, match="shape"):
        assembler.process_image(
            channels, cell_mask=cell_mask, nuclear_mask=nuclear_mask
        )


def test_missing_dapi_when_segmenting_raises(
    cell_specs: list,
) -> None:
    """Without pre-computed masks, a segmentation attempt without DAPI fails fast."""
    channels = {"actin": np.zeros(IMAGE_SIZE, dtype=np.float32)}
    assembler = ProfileAssembler()
    with pytest.raises(ValueError, match="dapi"):
        assembler.process_image(channels)  # no masks, no DAPI


def test_unknown_segmentation_channel_raises() -> None:
    channels = {
        "dapi": np.zeros(IMAGE_SIZE, dtype=np.float32),
        "actin": np.zeros(IMAGE_SIZE, dtype=np.float32),
    }
    assembler = ProfileAssembler()
    with pytest.raises(ValueError, match="segmentation_channel"):
        assembler.process_image(channels, segmentation_channel="nonexistent")
