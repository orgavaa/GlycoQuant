"""Generate bundled synthetic demo TIFFs for Tab 1's "Load demo image" button.

Run this script **once** locally; it writes three 5-channel TIFFs to
``data/demo/`` (control / siSDC1 / heparinase) that simulate three
common conditions in a glycocalyx perturbation experiment:

- **control**: normal cells with intact pericellular WGA ring,
  cytoplasmic YAP, typical focal adhesions
- **siSDC1**: reduced glycocalyx (thin ring, lower pericellular
  intensity), intermediate YAP translocation
- **heparinase**: severely thinned ring, elevated YAP nuclear signal
  (mimicking mechanotransduction activation), fewer focal adhesions

The generated images use ``skimage.draw.disk`` so they are fully
deterministic and require no external data. Total bundled size is
under 1 MB.

Usage
-----
    python scripts/generate_demo_images.py

Re-running overwrites the existing files.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import tifffile
from skimage.draw import disk

IMAGE_SIZE = (512, 512)
OUTPUT_DIR = Path(__file__).resolve().parents[1] / "data" / "demo"
CANONICAL_ORDER = ("dapi", "glycocalyx", "yap", "paxillin", "actin")


@dataclass(frozen=True)
class CellSpec:
    center: tuple[int, int]
    cell_radius: int
    nuclear_radius: int


@dataclass(frozen=True)
class ConditionParams:
    """Parameters that differ between control / siSDC1 / heparinase."""

    name: str
    glycocalyx_ring_width_px: int
    glycocalyx_peak_intensity: float
    yap_nuclear_intensity: float
    yap_cytoplasmic_intensity: float
    n_focal_adhesions: int


CELL_SPECS: list[CellSpec] = [
    CellSpec((120, 120), 40, 15),
    CellSpec((120, 300), 45, 18),
    CellSpec((300, 120), 38, 14),
    CellSpec((300, 300), 42, 16),
    CellSpec((400, 400), 35, 13),
]

CONDITIONS: list[ConditionParams] = [
    ConditionParams(
        name="control",
        glycocalyx_ring_width_px=6,
        glycocalyx_peak_intensity=1.0,
        yap_nuclear_intensity=1.0,
        yap_cytoplasmic_intensity=1.0,
        n_focal_adhesions=8,
    ),
    ConditionParams(
        name="siSDC1",
        glycocalyx_ring_width_px=2,
        glycocalyx_peak_intensity=0.35,
        yap_nuclear_intensity=1.3,
        yap_cytoplasmic_intensity=1.0,
        n_focal_adhesions=6,
    ),
    ConditionParams(
        name="heparinase",
        glycocalyx_ring_width_px=3,
        glycocalyx_peak_intensity=0.5,
        yap_nuclear_intensity=2.0,
        yap_cytoplasmic_intensity=0.8,
        n_focal_adhesions=4,
    ),
]


def build_stack(condition: ConditionParams, seed: int = 42) -> np.ndarray:
    """Assemble a 5-channel ``(5, H, W)`` uint16 stack for one condition."""
    rng = np.random.default_rng(seed)

    dapi = np.zeros(IMAGE_SIZE, dtype=np.float32)
    glycocalyx = np.zeros(IMAGE_SIZE, dtype=np.float32)
    yap = np.zeros(IMAGE_SIZE, dtype=np.float32)
    paxillin = np.zeros(IMAGE_SIZE, dtype=np.float32)
    actin = np.zeros(IMAGE_SIZE, dtype=np.float32)

    for spec in CELL_SPECS:
        cy, cx = spec.center

        # DAPI: nuclear disk
        rr, cc = disk(spec.center, spec.nuclear_radius, shape=IMAGE_SIZE)
        dapi[rr, cc] = 1.0

        # Glycocalyx: pericellular ring of configurable width + intensity
        rr_out, cc_out = disk(
            spec.center,
            spec.cell_radius + condition.glycocalyx_ring_width_px,
            shape=IMAGE_SIZE,
        )
        glycocalyx[rr_out, cc_out] = condition.glycocalyx_peak_intensity
        rr_in, cc_in = disk(spec.center, spec.cell_radius, shape=IMAGE_SIZE)
        glycocalyx[rr_in, cc_in] = 0.0

        # YAP: cytoplasm + brighter nucleus
        rr_cell, cc_cell = disk(spec.center, spec.cell_radius, shape=IMAGE_SIZE)
        yap[rr_cell, cc_cell] = condition.yap_cytoplasmic_intensity
        rr_nuc, cc_nuc = disk(spec.center, spec.nuclear_radius, shape=IMAGE_SIZE)
        yap[rr_nuc, cc_nuc] = condition.yap_nuclear_intensity

        # Paxillin: punctate focal adhesions near cell periphery
        angles = rng.uniform(0.0, 2.0 * np.pi, condition.n_focal_adhesions)
        radial = rng.uniform(
            spec.cell_radius * 0.75,
            spec.cell_radius * 0.95,
            condition.n_focal_adhesions,
        )
        for theta, r in zip(angles, radial, strict=True):
            py = int(round(cy + r * np.sin(theta)))
            px = int(round(cx + r * np.cos(theta)))
            rr, cc = disk((py, px), 2, shape=IMAGE_SIZE)
            paxillin[rr, cc] = 1.0

        # Actin: fills the cell body
        actin[rr_cell, cc_cell] = 0.8

    # Add gentle Gaussian noise so Cellpose sees a realistic texture
    for channel in (dapi, glycocalyx, yap, paxillin, actin):
        channel += rng.normal(0.0, 0.02, IMAGE_SIZE).astype(np.float32)
        np.clip(channel, 0.0, None, out=channel)

    # Stack in canonical order (C, H, W); tifffile writes this as a
    # multi-page TIFF that load_multichannel_image then transposes to
    # (H, W, C) on read.
    stack = np.stack([dapi, glycocalyx, yap, paxillin, actin], axis=0)

    # Scale to uint16 for compact on-disk storage (under 1 MB per file)
    stack = np.clip(stack * 65535.0 / max(stack.max(), 1e-9), 0, 65535)
    return stack.astype(np.uint16)


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for condition in CONDITIONS:
        stack = build_stack(condition)
        path = OUTPUT_DIR / f"{condition.name}.tiff"
        tifffile.imwrite(path, stack, compression="zlib")
        size_kb = path.stat().st_size // 1024
        print(f"wrote {path.relative_to(OUTPUT_DIR.parent.parent)} ({size_kb} KB)")

    # Also write a small sidecar JSON documenting the canonical channel order
    # so the Tab 1 "Load demo image" handler knows which channel is which
    # without guessing.
    import json

    manifest = {
        "channel_order": list(CANONICAL_ORDER),
        "image_size": list(IMAGE_SIZE),
        "conditions": [c.name for c in CONDITIONS],
        "cell_count": len(CELL_SPECS),
    }
    manifest_path = OUTPUT_DIR / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2))
    print(f"wrote {manifest_path.relative_to(OUTPUT_DIR.parent.parent)}")


if __name__ == "__main__":
    main()
