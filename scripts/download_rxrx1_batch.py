"""Download a batch of RxRx1 fields for the demo cohort.

RxRx1 (Recursion Pharmaceuticals) has 6 channels with WGA and
phalloidin as SEPARATE channels — giving 3/5 real biology for
GlycoQuant vs BBBC022's 2/5 (AGP bundle). Channel mapping:

    w1: Hoechst (nucleus)   → DAPI ✓ real
    w2: ConA (ER)           → YAP substitute
    w3: Phalloidin (actin)  → Actin ✓✓ REAL phalloidin!
    w4: Syto14 (RNA)        → (unused)
    w5: MitoTracker         → Paxillin substitute
    w6: WGA (Golgi)         → Glycocalyx ✓✓ REAL WGA!

Images are 512×512 8-bit PNGs inside a 45 GB zip on GCS. We use
remotezip HTTP Range requests to pull individual PNGs (~50 KB each)
without downloading the full archive.

Cell types in RxRx1: HUVEC, RPE, HepG2, U2OS — we target U2OS to
match BBBC022 and the GlycoQuant pipeline's default panel.
"""
from __future__ import annotations

import io
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

try:
    from remotezip import RemoteZip
except ImportError as exc:
    raise SystemExit("pip install remotezip") from exc

_REPO_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = _REPO_ROOT / "data" / "demo"
MANIFEST_PATH = OUTPUT_DIR / "manifest.json"

RXRX1_ZIP = "https://storage.googleapis.com/rxrx/rxrx1/rxrx1-images.zip"

# GlycoQuant slot → RxRx1 channel
# w1=Hoechst, w2=ConA, w3=Phalloidin, w4=Syto14, w5=MitoTracker, w6=WGA
SLOT_TO_CHANNEL = [
    ("dapi", "w1"),        # Hoechst → DAPI ✓
    ("glycocalyx", "w6"),  # WGA → glycocalyx ✓✓ REAL
    ("yap", "w2"),         # ConA/ER → YAP substitute
    ("paxillin", "w5"),    # MitoTracker → paxillin substitute
    ("actin", "w3"),       # Phalloidin → actin ✓✓ REAL
]

# Target U2OS cells — pick diverse wells from multiple batches/plates
# Pattern: rxrx1/images/{cell_type}-{batch}/Plate{N}/{well}_s{site}_w{ch}.png
BATCH_COORDS = [
    # U2OS batches — pick wells spread across the plate
    ("U2OS-01", "Plate1", "B02", "s1"),
    ("U2OS-01", "Plate1", "C05", "s1"),
    ("U2OS-01", "Plate1", "D08", "s1"),
    ("U2OS-01", "Plate1", "E11", "s1"),
    ("U2OS-01", "Plate1", "F14", "s1"),
    ("U2OS-01", "Plate1", "G17", "s1"),
    ("U2OS-01", "Plate1", "H20", "s1"),
    ("U2OS-01", "Plate1", "B02", "s2"),
    ("U2OS-01", "Plate1", "F14", "s2"),
    ("U2OS-01", "Plate2", "B02", "s1"),
    ("U2OS-01", "Plate2", "D08", "s1"),
    ("U2OS-01", "Plate2", "F14", "s1"),
    ("U2OS-01", "Plate2", "H20", "s1"),
    # Second batch for variety
    ("U2OS-02", "Plate1", "B02", "s1"),
    ("U2OS-02", "Plate1", "D08", "s1"),
    ("U2OS-02", "Plate1", "F14", "s1"),
    ("U2OS-02", "Plate1", "H20", "s1"),
    ("U2OS-02", "Plate2", "B02", "s1"),
    ("U2OS-02", "Plate2", "D08", "s1"),
    ("U2OS-02", "Plate2", "F14", "s1"),
]

# Deduplicate
BATCH_COORDS = list(dict.fromkeys(BATCH_COORDS))


def download_field(
    rz: RemoteZip,
    all_names: list[str],
    cell_type_batch: str,
    plate: str,
    well: str,
    site: str,
) -> tuple[Path, dict] | None:
    """Download one 5-channel field from the open RemoteZip."""
    slots: list[np.ndarray] = []

    for slot_name, channel in SLOT_TO_CHANNEL:
        target = f"rxrx1/images/{cell_type_batch}/{plate}/{well}_{site}_{channel}.png"
        if target not in all_names:
            print(f"  [skip] {target} not found")
            return None
        try:
            png_bytes = rz.read(target)
            img = Image.open(io.BytesIO(png_bytes)).convert("L")
            arr = np.array(img, dtype=np.uint16) * 257  # 8-bit → 16-bit
            slots.append(arr)
        except Exception as exc:
            print(f"  [skip] {target} — {type(exc).__name__}: {exc}")
            return None

    h, w = slots[0].shape
    name = f"RxRx1_{cell_type_batch}_{plate}_{well}_{site}"
    out_path = OUTPUT_DIR / f"{name}.tiff"
    stack = np.stack(slots, axis=0).astype(np.uint16)

    import tifffile
    tifffile.imwrite(out_path, stack, compression="zlib")
    size_kb = out_path.stat().st_size // 1024
    print(f"  [ok] {name} — {h}×{w}, {size_kb} KB")

    col_num = int("".join(c for c in well if c.isdigit()))
    is_control = col_num <= 2 or col_num >= 23
    condition = "DMSO control" if is_control else "Genetic perturbation"

    entry = {
        "name": name,
        "display_name": f"RxRx1 · {cell_type_batch} · {plate} · {well}/{site} ({condition})",
        "source": "RxRx1 — Recursion Pharmaceuticals",
        "license": "CC BY 4.0",
        "attribution": "Taylor et al. (2019) RxRx1: A Dataset for Out-of-Distribution Generalization in Biological Microscopy",
        "attribution_url": "https://www.rxrx.ai/rxrx1",
        "gene": "—",
        "ensembl_id": "",
        "cell_line": "U-2 OS (osteosarcoma)",
        "description": (
            f"{cell_type_batch}, {plate}, well {well}, site {site}. "
            f"512×512 px, 6-channel Cell Painting. "
            f"WGA (glycocalyx) and phalloidin (actin) are separate real channels."
        ),
        "is_real_microscopy": True,
        "pixel_size_um": 0.65,  # RxRx1 is ~20× similar to BBBC022
        "native_image_size": [h, w],
        "image_size": [h, w],
        "condition": condition,
        "dataset_source": "rxrx1",
        "slot_sources": {
            "dapi": {
                "channel": "w1 (Hoechst)",
                "biological_identity": "Hoechst 33342 (DNA / nuclei)",
                "matches_labouesse_protocol": True,
            },
            "glycocalyx": {
                "channel": "w6 (WGA)",
                "biological_identity": "WGA-lectin (Golgi / glycocalyx)",
                "matches_labouesse_protocol": True,
                "note": "Real WGA-lectin — separate channel from phalloidin (unlike BBBC022 AGP bundle).",
            },
            "yap": {
                "channel": "w2 (ConA)",
                "biological_identity": "Concanavalin A (endoplasmic reticulum)",
                "matches_labouesse_protocol": False,
            },
            "paxillin": {
                "channel": "w5 (MitoTracker)",
                "biological_identity": "MitoTracker Deep Red (mitochondria)",
                "matches_labouesse_protocol": False,
            },
            "actin": {
                "channel": "w3 (Phalloidin)",
                "biological_identity": "Phalloidin (F-actin cytoskeleton)",
                "matches_labouesse_protocol": True,
                "note": "Real phalloidin — separate channel from WGA (unlike BBBC022 AGP bundle).",
            },
        },
    }
    return out_path, entry


def main() -> int:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"[rxrx1] opening 45 GB zip (central directory only)...")

    try:
        rz = RemoteZip(RXRX1_ZIP)
        all_names = set(rz.namelist())
        print(f"[rxrx1] {len(all_names)} entries indexed")
    except Exception as exc:
        print(f"[rxrx1] failed to open zip: {exc}", file=sys.stderr)
        return 1

    print(f"[rxrx1] downloading {len(BATCH_COORDS)} fields...")
    entries: list[dict] = []

    for i, (ct_batch, plate, well, site) in enumerate(BATCH_COORDS):
        print(f"[{i + 1}/{len(BATCH_COORDS)}] {ct_batch}/{plate}/{well}/{site}...")
        result = download_field(rz, list(all_names), ct_batch, plate, well, site)
        if result is not None:
            _path, entry = result
            entries.append(entry)

    rz.close()

    if not entries:
        print("[rxrx1] no fields downloaded!", file=sys.stderr)
        return 1

    # Append to existing manifest (don't overwrite BBBC022 entries)
    if MANIFEST_PATH.is_file():
        manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    else:
        manifest = {
            "schema_version": 2,
            "channel_order": ["dapi", "glycocalyx", "yap", "paxillin", "actin"],
            "datasets": [],
        }

    # Remove any prior RxRx1 entries (idempotent re-run)
    manifest["datasets"] = [
        d for d in manifest["datasets"] if not d.get("name", "").startswith("RxRx1_")
    ]
    manifest["datasets"].extend(entries)

    MANIFEST_PATH.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"\n[rxrx1] {len(entries)} RxRx1 fields added to manifest")
    total = len(manifest["datasets"])
    print(f"[rxrx1] manifest now has {total} total demo datasets")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
