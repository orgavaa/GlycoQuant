"""Tests for glycoquant.segmentation.cellpose_wrapper.

First test run downloads Cellpose-SAM weights (~1.2 GB) to
``~/.cellpose/models/``; subsequent runs are cached and offline.
CPU inference on a 512x512 image takes ~3-4 minutes per call, so
the full suite runs in ~10-15 minutes on a cold cache.
"""
from __future__ import annotations

import numpy as np
import pytest

from glycoquant.segmentation import CellSegmenter


def _add_noise(image: np.ndarray, sigma: float = 0.05, seed: int = 42) -> np.ndarray:
    """Add Gaussian noise so Cellpose-SAM sees something cell-like.

    Pure binary disks are too clean for a model trained on real
    microscopy; low-level Gaussian noise pushes the input closer to
    the training distribution.
    """
    rng = np.random.default_rng(seed)
    noisy = image + rng.normal(0.0, sigma, image.shape).astype(np.float32)
    return np.clip(noisy, 0.0, 1.0)


@pytest.fixture(scope="session")
def segmenter() -> CellSegmenter:
    """Session-scoped Cellpose-SAM segmenter (weights load once per session)."""
    # Tests always run on CPU to keep them hardware-independent; on the
    # GPU deployment the runtime singletons pick up CUDA via
    # ``glycoquant.compute.use_gpu`` instead.
    return CellSegmenter(gpu=False)


def test_segmenter_instantiates(segmenter: CellSegmenter) -> None:
    """Constructor exposes the expected attributes and holds a live model."""
    assert segmenter.model_type == "cpsam"
    assert segmenter.gpu is False
    assert segmenter._model is not None


def test_segment_cells_finds_all_cells(
    segmenter: CellSegmenter,
    synthetic_cell_image: np.ndarray,
    cell_specs: list,
) -> None:
    """Cellpose-SAM finds exactly 5 cells on the noisy synthetic fixture.

    Calibrated against a manual probe: with ``diameter=80`` and Gaussian
    noise sigma=0.05 injected, Cellpose-SAM returns exactly ``len(cell_specs)``
    labels on this specific fixture. Tightening the tolerance to zero is
    deliberate — if this starts failing, the fixture has drifted.
    """
    image = _add_noise(synthetic_cell_image)
    mask = segmenter.segment_cells(image, diameter=80.0)

    assert mask.shape == image.shape
    assert mask.dtype == np.int32
    assert int(mask.max()) == len(cell_specs)


def test_segment_cells_empty_image_returns_empty_mask(
    segmenter: CellSegmenter,
    synthetic_cell_image: np.ndarray,
) -> None:
    """All-zero input returns an all-zero mask via the fast path."""
    empty = np.zeros_like(synthetic_cell_image)
    mask = segmenter.segment_cells(empty)

    assert mask.shape == empty.shape
    assert mask.dtype == np.int32
    assert int(mask.max()) == 0


def test_segment_nuclei_finds_most_nuclei(
    segmenter: CellSegmenter,
    synthetic_nuclear_image: np.ndarray,
    cell_specs: list,
) -> None:
    """Nucleus segmentation is within +/- 1 of ground truth.

    Small objects (diameter 30 px) are harder for Cellpose-SAM than larger
    cells; the calibration probe recorded 4/5 nuclei detected on this
    fixture, so we allow a one-nucleus miss without failing.
    """
    image = _add_noise(synthetic_nuclear_image)
    mask = segmenter.segment_nuclei(image, diameter=30.0)

    assert mask.shape == image.shape
    assert mask.dtype == np.int32
    n_found = int(mask.max())
    n_expected = len(cell_specs)
    assert abs(n_found - n_expected) <= 1, (
        f"expected {n_expected} nuclei +/- 1, got {n_found}"
    )


def test_segment_both_matched_labels(
    segmenter: CellSegmenter,
    synthetic_cell_image: np.ndarray,
    synthetic_nuclear_image: np.ndarray,
    cell_specs: list,
) -> None:
    """segment_both returns cell and nuclear masks with consistent label IDs.

    Invariants checked:
    1. Both masks have the input shape and int32 dtype.
    2. Every nuclear ID exists as a cell ID (nuclei are a subset).
    3. Every matched nucleus sits entirely inside its assigned cell.
    4. The number of matched nuclei is within +/- 1 of ground truth.
    """
    cell_image = _add_noise(synthetic_cell_image)
    nuclear_image = _add_noise(synthetic_nuclear_image)

    cell_mask, nuclear_mask = segmenter.segment_both(
        cell_image,
        nuclear_image,
        cell_diameter=80.0,
        nuclear_diameter=30.0,
    )

    assert cell_mask.shape == cell_image.shape
    assert nuclear_mask.shape == cell_image.shape
    assert cell_mask.dtype == np.int32
    assert nuclear_mask.dtype == np.int32

    cell_ids = set(np.unique(cell_mask).tolist()) - {0}
    nuclear_ids = set(np.unique(nuclear_mask).tolist()) - {0}

    # Invariant 1: every nuclear ID corresponds to an existing cell.
    assert nuclear_ids.issubset(cell_ids), (
        f"nuclear IDs {nuclear_ids} are not a subset of cell IDs {cell_ids}"
    )

    # Invariant 2: every matched-nucleus pixel lies inside its assigned cell.
    for nuc_id in nuclear_ids:
        mismatch_count = int(
            np.sum((nuclear_mask == nuc_id) & (cell_mask != nuc_id))
        )
        assert mismatch_count == 0, (
            f"nucleus {nuc_id} has {mismatch_count} pixels outside its assigned cell"
        )

    # Invariant 3: roughly the expected number of cell/nucleus pairs.
    n_expected = len(cell_specs)
    assert abs(len(cell_ids) - n_expected) <= 1
    assert abs(len(nuclear_ids) - n_expected) <= 1


def test_segment_both_rejects_shape_mismatch(
    segmenter: CellSegmenter,
    synthetic_cell_image: np.ndarray,
) -> None:
    """segment_both raises ValueError on mismatched channel shapes."""
    wrong_shape = np.zeros((256, 256), dtype=np.float32)
    with pytest.raises(ValueError, match="same shape"):
        segmenter.segment_both(synthetic_cell_image, wrong_shape)


def test_run_eval_rejects_non_2d(segmenter: CellSegmenter) -> None:
    """_run_eval raises ValueError on non-2D input (defensive check)."""
    bad = np.zeros((4, 256, 256), dtype=np.float32)
    with pytest.raises(ValueError, match="2D"):
        segmenter.segment_cells(bad)
