"""Download a real Cell Painting U2OS field for the Tab 1 demo dropdown.

Pulls the public 5-channel sample images that Broad publishes with
BBBC022 (the U2OS Cell Painting pilot dataset, Gustafsdottir *et al.*
PLOS ONE 2013) and stitches them into a single 5-slot TIFF that
matches GlycoQuant's canonical channel layout.

Why this dataset:
    BBBC022 is a 20-plate, 384-well, 9-site-per-well U2OS Cell
    Painting screen — the standard reference for high-content
    morphological profiling. The single field exposed on the BBBC
    page (one well, one site) is dense (~80 cells), real
    immunofluorescence, and crucially uses **WGA-lectin** for the
    AGP channel, which is exactly the glycocalyx marker GlycoQuant
    cares about. The HPA demos dropped into ``data/demo/`` earlier
    have *no* real WGA stain anywhere, so this download is the only
    way to exercise the glycocalyx extractors against true biology.

Channel mapping into the canonical 5-slot TIFF
-----------------------------------------------

| GlycoQuant slot | BBBC022 channel | Real biological identity   | Real match? |
|-----------------|-----------------|----------------------------|-------------|
| 0 — DAPI        | DAPI.png        | Hoechst 33342 (nuclei)     | yes         |
| 1 — glycocalyx  | TxRed.png       | WGA-lectin + phalloidin    | yes (WGA)   |
| 2 — YAP         | FITC.png        | con A (ER)                 | no — note   |
| 3 — paxillin    | Cy5.png         | MitoTracker Deep Red       | no — note   |
| 4 — actin       | TxRed.png       | WGA-lectin + phalloidin    | yes (phalloidin)|

Two of the five slots (DAPI, glycocalyx) are biologically real, and
the actin slot also lands on a phalloidin-containing channel — so
three of the five mechano-pipeline blocks (segmentation, glycocalyx
features, actin coherence) operate on genuine signal. YAP and FA
features still run, but their interpretation is documented as a
substitution in ``data/demo/manifest.json`` exactly like the HPA
demos.

The BBBC022 sample images are 8-bit RGB PNGs (the page-preview copy),
not full-resolution 16-bit TIFFs. Full TIFFs live inside the
1.3–1.7 GB ``BBBC022_v1_images_<plate>w<channel>.zip`` archives —
out of scope for a single-file demo script. The 8-bit preview is
plenty for a UI demo and runs the pipeline cleanly; pixel
intensities are simply quantised to 256 levels rather than 65,536.

License: BBBC022 is released by the Broad Institute under the
Creative Commons CC0 / public-domain dedication. Attribution to
Gustafsdottir *et al.* 2013 is recorded in the manifest.
"""
from __future__ import annotations

import io
import json
import sys
import urllib.request
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import tifffile
from PIL import Image

_REPO_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = _REPO_ROOT / "data" / "demo"
MANIFEST_PATH = OUTPUT_DIR / "manifest.json"
USER_AGENT = "GlycoQuant/0.3 (https://github.com/orgavaa/GlycoQuant)"

# The BBBC022 page (https://bbbc.broadinstitute.org/BBBC022) exposes
# one sample field of view as five separate PNGs, one per stain.
BBBC_BASE = "https://data.broadinstitute.org/bbbc/BBBC022"

# (slot_index, slot_name, file, biological_identity, real_match, note)
@dataclass(frozen=True)
class BBBCChannel:
    slot: int
    slot_name: str
    file: str
    biological_identity: str
    real_match: bool
    note: str | None


CHANNELS: list[BBBCChannel] = [
    BBBCChannel(
        slot=0,
        slot_name="dapi",
        file="DAPI.png",
        biological_identity="Hoechst 33342 (DNA / nuclei)",
        real_match=True,
        note=None,
    ),
    BBBCChannel(
        slot=1,
        slot_name="glycocalyx",
        file="TxRed.png",
        biological_identity="WGA-lectin + phalloidin (AGP channel)",
        real_match=True,
        note=(
            "Real WGA-lectin signal — the canonical glycocalyx marker. "
            "Cell Painting bundles WGA with phalloidin in a single AGP "
            "channel, so the same image also feeds the actin slot below. "
            "Glycocalyx pericellular features are scientifically meaningful "
            "on this slot."
        ),
    ),
    BBBCChannel(
        slot=2,
        slot_name="yap",
        file="FITC.png",
        biological_identity="con A (endoplasmic reticulum)",
        real_match=False,
        note=(
            "Real ER stain (concanavalin A), not anti-YAP. The YAP N/C "
            "ratio computed on this slot reflects ER nuclear-perinuclear "
            "intensity, not YAP/TAZ translocation, and should not be "
            "interpreted as mechanotransduction signal."
        ),
    ),
    BBBCChannel(
        slot=3,
        slot_name="paxillin",
        file="Cy5.png",
        biological_identity="MitoTracker Deep Red (mitochondria)",
        real_match=False,
        note=(
            "Real mitochondrial stain, not anti-paxillin. Focal-adhesion "
            "features extracted from this slot reflect mitochondrial "
            "puncta morphometry, not adhesion biology."
        ),
    ),
    BBBCChannel(
        slot=4,
        slot_name="actin",
        file="TxRed.png",
        biological_identity="WGA-lectin + phalloidin (AGP channel, duplicated)",
        real_match=True,
        note=(
            "Same AGP channel as the glycocalyx slot — Cell Painting does "
            "not separate WGA from phalloidin. Actin coherence and "
            "cortical-ratio features therefore reflect a mixture of WGA "
            "membrane staining and phalloidin F-actin and should be "
            "interpreted with that caveat."
        ),
    ),
]


def fetch_grayscale(url: str) -> np.ndarray:
    """Download a BBBC sample PNG and collapse to a single-channel float array.

    The BBBC022 PNGs are RGB previews where the relevant stain occupies
    one of the colour planes. Taking the per-pixel max across RGB
    recovers the underlying single-channel intensity without mixing
    artefacts from any low-level JPEG/PNG residual on the other planes.
    """
    print(f"[bbbc] fetching {url}")
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = resp.read()
    img = Image.open(io.BytesIO(data)).convert("RGB")
    arr = np.array(img, dtype=np.float32) / 255.0  # (H, W, 3) in [0, 1]
    return arr.max(axis=-1)  # (H, W)


def build_demo_tiff() -> tuple[Path, dict]:
    """Stitch the 5 BBBC022 PNGs into a single 5-slot uint16 TIFF.

    Returns the output path and a manifest entry ready to drop into
    ``data/demo/manifest.json``.
    """
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Cache so the duplicated TxRed channel only downloads once.
    cache: dict[str, np.ndarray] = {}
    slots: list[np.ndarray] = []
    slot_sources: dict[str, dict] = {}

    for ch in CHANNELS:
        if ch.file not in cache:
            cache[ch.file] = fetch_grayscale(f"{BBBC_BASE}/{ch.file}")
        slots.append(cache[ch.file])
        slot_sources[ch.slot_name] = {
            "bbbc_channel": ch.file,
            "biological_identity": ch.biological_identity,
            "matches_labouesse_protocol": ch.real_match,
            **({"note": ch.note} if ch.note else {}),
        }

    h, w = slots[0].shape
    print(f"[bbbc] stitched 5 slots at {h}x{w}")

    stack = np.clip(np.stack(slots, axis=0) * 65535.0, 0, 65535).astype(np.uint16)
    out_path = OUTPUT_DIR / "BBBC022_U2OS_CellPainting.tiff"
    tifffile.imwrite(out_path, stack, compression="zlib")
    size_kb = out_path.stat().st_size // 1024
    print(f"[bbbc] wrote {out_path.relative_to(_REPO_ROOT)} ({size_kb} KB)")

    entry = {
        "name": "BBBC022_U2OS_CellPainting",
        "display_name": "Cell Painting — U-2 OS (BBBC022)",
        "source": "Broad BBBC022 — Cell Painting Pilot",
        "license": "CC0 / public domain",
        "attribution": (
            "Gustafsdottir SM et al. (2013) Multiplex Cytological Profiling "
            "Assay to Measure Diverse Cellular States. PLOS ONE 8:e80999. "
            "Distributed by the Broad Bioimage Benchmark Collection (BBBC022)."
        ),
        "attribution_url": "https://bbbc.broadinstitute.org/BBBC022",
        "gene": "—",
        "ensembl_id": "",
        "cell_line": "U-2 OS (osteosarcoma)",
        "description": (
            "One U-2 OS field of view from the BBBC022 Cell Painting pilot "
            "screen, ~80 cells, 5-channel staining. Two slots (DAPI, "
            "glycocalyx-WGA) are biologically real; the actin slot also "
            "carries the WGA+phalloidin AGP channel. YAP and paxillin slots "
            "are substitutions documented per slot. This is the gold "
            "reference demo for exercising the glycocalyx extractors "
            "against real WGA-lectin signal."
        ),
        "is_real_microscopy": True,
        "pixel_size_um": 0.656,
        "pixel_size_note": (
            "BBBC022 was acquired on an ImageXpress Micro at 20× — native "
            "pixel size 0.656 µm/px (Gustafsdottir 2013, Methods). Override "
            "in the sidebar if you re-acquire on different optics."
        ),
        "native_image_size": [h, w],
        "image_size": [h, w],
        "crop_strategy": (
            "No crop — the BBBC022 sample PNG is the page-preview field "
            "(8-bit), already at a tractable 696×520 resolution. Full "
            "16-bit TIFFs at native resolution are available inside the "
            "BBBC022 plate-channel zip archives."
        ),
        "slot_sources": slot_sources,
    }
    return out_path, entry


def main() -> int:
    try:
        _out_path, entry = build_demo_tiff()
    except Exception as exc:  # noqa: BLE001
        print(f"[bbbc] FAILED: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1

    # Merge the new entry into the existing manifest. We *prepend* it so
    # the BBBC demo appears first in the dropdown — it's the only entry
    # with real WGA glycocalyx signal and should be the default reference.
    if MANIFEST_PATH.is_file():
        manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    else:
        manifest = {
            "schema_version": 2,
            "channel_order": ["dapi", "glycocalyx", "yap", "paxillin", "actin"],
            "datasets": [],
        }

    # Drop any prior BBBC entry so re-runs are idempotent.
    manifest["datasets"] = [
        d for d in manifest.get("datasets", []) if d.get("name") != entry["name"]
    ]
    manifest["datasets"] = [entry] + manifest["datasets"]

    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"[bbbc] updated {MANIFEST_PATH.relative_to(_REPO_ROOT)}")
    print(f"[bbbc] {len(manifest['datasets'])} demo datasets registered")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
