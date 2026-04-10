"""Shared synthetic image fixtures for GlycoQuant tests.

All fixtures share the same ground-truth cell geometry via the
``cell_specs`` fixture so tests across feature modules can reason about
the same synthetic cells. No external data downloads — everything is
generated with ``skimage.draw``.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pytest
from skimage.draw import disk

IMAGE_SIZE: tuple[int, int] = (512, 512)
RNG_SEED: int = 42


@dataclass(frozen=True)
class SyntheticCellSpec:
    """Ground-truth parameters for a single synthetic cell.

    Attributes
    ----------
    center : tuple[int, int]
        (row, col) centroid in pixel coordinates.
    cell_radius : int
        Radius of the cytoplasmic disk, in pixels.
    nuclear_radius : int
        Radius of the nuclear disk, in pixels.
    """

    center: tuple[int, int]
    cell_radius: int
    nuclear_radius: int


@pytest.fixture(scope="session")
def cell_specs() -> list[SyntheticCellSpec]:
    """Ground-truth cell geometry shared by all synthetic-image fixtures."""
    return [
        SyntheticCellSpec(center=(120, 120), cell_radius=40, nuclear_radius=15),
        SyntheticCellSpec(center=(120, 300), cell_radius=45, nuclear_radius=18),
        SyntheticCellSpec(center=(300, 120), cell_radius=38, nuclear_radius=14),
        SyntheticCellSpec(center=(300, 300), cell_radius=42, nuclear_radius=16),
        SyntheticCellSpec(center=(400, 400), cell_radius=35, nuclear_radius=13),
    ]


@pytest.fixture(scope="session")
def synthetic_cell_image(cell_specs: list[SyntheticCellSpec]) -> np.ndarray:
    """Cytoplasmic channel: uniformly bright disks on a dark background.

    Shape: ``IMAGE_SIZE``, dtype ``float32``, range ``[0, 1]``.
    """
    image = np.zeros(IMAGE_SIZE, dtype=np.float32)
    for spec in cell_specs:
        rr, cc = disk(spec.center, spec.cell_radius, shape=IMAGE_SIZE)
        image[rr, cc] = 1.0
    return image


@pytest.fixture(scope="session")
def synthetic_nuclear_image(cell_specs: list[SyntheticCellSpec]) -> np.ndarray:
    """DAPI channel: small bright disks at cell centers."""
    image = np.zeros(IMAGE_SIZE, dtype=np.float32)
    for spec in cell_specs:
        rr, cc = disk(spec.center, spec.nuclear_radius, shape=IMAGE_SIZE)
        image[rr, cc] = 1.0
    return image


@pytest.fixture(scope="session")
def synthetic_glycocalyx_image(cell_specs: list[SyntheticCellSpec]) -> np.ndarray:
    """WGA-lectin channel: bright pericellular ring around each cell.

    Ring is constructed by subtracting the cell disk from a slightly
    larger outer disk, producing a shell of width ``ring_width``.
    Used by ``test_features_glycocalyx`` to verify that
    ``pericellular_ratio > 1.0`` and ``heterogeneity ≈ 0`` on this
    near-uniform ring.
    """
    ring_width = 6
    image = np.zeros(IMAGE_SIZE, dtype=np.float32)
    for spec in cell_specs:
        rr_out, cc_out = disk(
            spec.center, spec.cell_radius + ring_width, shape=IMAGE_SIZE
        )
        image[rr_out, cc_out] = 1.0
        rr_in, cc_in = disk(spec.center, spec.cell_radius, shape=IMAGE_SIZE)
        image[rr_in, cc_in] = 0.0
    return image


@pytest.fixture(scope="session")
def synthetic_yap_image(cell_specs: list[SyntheticCellSpec]) -> np.ndarray:
    """YAP channel with known N/C ratio = 2.0.

    Nucleus intensity = 2.0, cytoplasm intensity = 1.0. Used by
    ``test_features_yap`` to verify the N/C computation.
    """
    nuclear_intensity = 2.0
    cytoplasmic_intensity = 1.0
    image = np.zeros(IMAGE_SIZE, dtype=np.float32)
    for spec in cell_specs:
        rr_cell, cc_cell = disk(spec.center, spec.cell_radius, shape=IMAGE_SIZE)
        image[rr_cell, cc_cell] = cytoplasmic_intensity
        rr_nuc, cc_nuc = disk(spec.center, spec.nuclear_radius, shape=IMAGE_SIZE)
        image[rr_nuc, cc_nuc] = nuclear_intensity
    return image


@pytest.fixture(scope="session")
def synthetic_paxillin_image(cell_specs: list[SyntheticCellSpec]) -> np.ndarray:
    """Paxillin channel: small punctate structures near each cell periphery.

    Exactly ``puncta_per_cell`` puncta of radius ``punctum_radius`` are
    placed per cell at a random angle between 75% and 95% of the cell
    radius, using a fixed seed so the fixture is deterministic.
    """
    rng = np.random.default_rng(RNG_SEED)
    puncta_per_cell = 8
    punctum_radius = 2
    image = np.zeros(IMAGE_SIZE, dtype=np.float32)
    for spec in cell_specs:
        cy, cx = spec.center
        angles = rng.uniform(0.0, 2.0 * np.pi, puncta_per_cell)
        radial_offsets = rng.uniform(
            spec.cell_radius * 0.75,
            spec.cell_radius * 0.95,
            puncta_per_cell,
        )
        for theta, r in zip(angles, radial_offsets, strict=True):
            py = int(round(cy + r * np.sin(theta)))
            px = int(round(cx + r * np.cos(theta)))
            rr, cc = disk((py, px), punctum_radius, shape=IMAGE_SIZE)
            image[rr, cc] = 1.0
    return image
