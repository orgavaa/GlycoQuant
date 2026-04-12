"""Download a batch of BBBC022 fields for the demo cohort.

Pulls 20 diverse fields of view from plate 20585 via remotezip HTTP
Range requests (~7 MB per field, ~140 MB total bandwidth). Each field
is stitched into the canonical 5-slot GlycoQuant TIFF and added to
the demo manifest. The batch mixes control wells (columns 1–2) with
treated wells (inner columns) so the Condition Compare view has
real perturbation data to work with.

Usage:
    python scripts/download_bbbc_batch.py
"""
from __future__ import annotations

import io
import json
import sys
from pathlib import Path

import numpy as np
import tifffile

try:
    from remotezip import RemoteZip
except ImportError as exc:
    raise SystemExit("pip install remotezip") from exc

_REPO_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = _REPO_ROOT / "data" / "demo"
MANIFEST_PATH = OUTPUT_DIR / "manifest.json"

PLATE = "20585"
BBBC_BASE = "https://data.broadinstitute.org/bbbc/BBBC022"

# Channel mapping: GlycoQuant slot → BBBC022 wavelength
SLOT_TO_CHANNEL = [
    ("dapi", "w1"),
    ("glycocalyx", "w4"),
    ("yap", "w2"),
    ("paxillin", "w5"),
    ("actin", "w4"),
]

# 20 diverse (well, site) coordinates spread across the plate.
# Rows A-B cols 1-2 and 23-24 are typically DMSO controls in BBBC022.
# Inner wells are compound-treated. We pick the centre site (s5) for
# optimal focus and illumination, plus a few off-centre sites for
# morphological variety.
BATCH_COORDS = [
    # Control wells (DMSO — edge columns)
    ("A01", "s5"), ("A02", "s5"), ("B01", "s5"), ("B02", "s5"),
    ("A23", "s5"), ("A24", "s5"), ("B23", "s5"),
    # Treated wells (inner columns — various compounds)
    ("C05", "s5"), ("D08", "s5"), ("E03", "s5"),
    ("F10", "s5"), ("G07", "s5"), ("H12", "s5"),
    ("I06", "s5"), ("J09", "s5"), ("K04", "s5"),
    ("L11", "s5"), ("M08", "s5"), ("N06", "s5"),
    # Off-centre sites for variety
    ("A01", "s1"), ("C05", "s9"), ("G07", "s3"),
]

# Deduplicate (in case of typos)
BATCH_COORDS = list(dict.fromkeys(BATCH_COORDS))


def _zip_url(channel: str) -> str:
    return f"{BBBC_BASE}/BBBC022_v1_images_{PLATE}{channel}.zip"


def _find_entry(rz_names: list[str], well: str, site: str, channel: str) -> str | None:
    needle = f"/IXMtest_{well}_{site}_{channel}"
    matches = [n for n in rz_names if needle in n]
    return matches[0] if matches else None


def download_field(well: str, site: str) -> tuple[Path, dict] | None:
    """Download one 5-channel field and stitch into a TIFF."""
    cache: dict[str, np.ndarray] = {}
    slots: list[np.ndarray] = []

    for slot_name, channel in SLOT_TO_CHANNEL:
        if channel in cache:
            slots.append(cache[channel])
            continue

        url = _zip_url(channel)
        try:
            with RemoteZip(url) as rz:
                entry = _find_entry(rz.namelist(), well, site, channel)
                if entry is None:
                    print(f"  [skip] {well}/{site}/{channel} — not found in zip")
                    return None
                tiff_bytes = rz.read(entry)
        except Exception as exc:
            print(f"  [skip] {well}/{site}/{channel} — {type(exc).__name__}: {exc}")
            return None

        arr = tifffile.imread(io.BytesIO(tiff_bytes))
        if arr.ndim != 2:
            print(f"  [skip] {well}/{site}/{channel} — shape {arr.shape}")
            return None
        cache[channel] = arr
        slots.append(arr)

    h, w = slots[0].shape
    if any(s.shape != (h, w) for s in slots):
        print(f"  [skip] {well}/{site} — inconsistent channel shapes")
        return None

    name = f"BBBC022_{well}_{site}"
    out_path = OUTPUT_DIR / f"{name}.tiff"
    stack = np.stack(slots, axis=0).astype(np.uint16)
    tifffile.imwrite(out_path, stack, compression="zlib")
    size_kb = out_path.stat().st_size // 1024
    print(f"  [ok] {name} — {h}×{w}, {size_kb} KB")

    # Determine if this is likely a control well (edge columns)
    col_num = int("".join(c for c in well if c.isdigit()))
    is_control = col_num <= 2 or col_num >= 23
    condition = "DMSO control" if is_control else "Compound-treated"

    entry = {
        "name": name,
        "display_name": f"BBBC022 · {well} / {site} ({condition})",
        "source": "Broad BBBC022 — Cell Painting Pilot",
        "license": "CC0 / public domain",
        "attribution": "Gustafsdottir SM et al. (2013) PLOS ONE 8:e80999",
        "attribution_url": "https://bbbc.broadinstitute.org/BBBC022",
        "gene": "—",
        "ensembl_id": "",
        "cell_line": "U-2 OS (osteosarcoma)",
        "description": (
            f"Plate {PLATE}, well {well} ({condition}), site {site}. "
            f"Native 16-bit, {h}×{w} px at 0.656 µm/px."
        ),
        "is_real_microscopy": True,
        "pixel_size_um": 0.656,
        "native_image_size": [h, w],
        "image_size": [h, w],
        "condition": condition,
        "bbbc_coordinate": {
            "plate": PLATE,
            "well": well,
            "site": site,
        },
        "slot_sources": {
            "dapi": {
                "bbbc_channel": "w1",
                "biological_identity": "Hoechst 33342 (DNA / nuclei)",
                "matches_labouesse_protocol": True,
            },
            "glycocalyx": {
                "bbbc_channel": "w4",
                "biological_identity": "WGA-lectin + phalloidin (AGP)",
                "matches_labouesse_protocol": True,
            },
            "yap": {
                "bbbc_channel": "w2",
                "biological_identity": "con A (endoplasmic reticulum)",
                "matches_labouesse_protocol": False,
            },
            "paxillin": {
                "bbbc_channel": "w5",
                "biological_identity": "MitoTracker Deep Red (mitochondria)",
                "matches_labouesse_protocol": False,
            },
            "actin": {
                "bbbc_channel": "w4",
                "biological_identity": "WGA-lectin + phalloidin (AGP, duplicated)",
                "matches_labouesse_protocol": True,
            },
        },
    }
    return out_path, entry


def main() -> int:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"[batch] downloading {len(BATCH_COORDS)} fields from plate {PLATE}")

    entries: list[dict] = []
    for i, (well, site) in enumerate(BATCH_COORDS):
        print(f"[{i + 1}/{len(BATCH_COORDS)}] {well}/{site}...")
        result = download_field(well, site)
        if result is not None:
            _path, entry = result
            entries.append(entry)

    if not entries:
        print("[batch] no fields downloaded!", file=sys.stderr)
        return 1

    # Update manifest — replace all existing entries with the batch
    manifest = {
        "schema_version": 2,
        "channel_order": ["dapi", "glycocalyx", "yap", "paxillin", "actin"],
        "datasets": entries,
    }
    MANIFEST_PATH.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"\n[batch] {len(entries)} fields registered in manifest")
    controls = sum(1 for e in entries if e.get("condition") == "DMSO control")
    treated = sum(1 for e in entries if e.get("condition") == "Compound-treated")
    print(f"[batch] {controls} controls + {treated} treated")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
