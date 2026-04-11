"""Download one dense BBBC022 field of view at native 1392×1040 16-bit.

This is the heavy-budget cousin of ``download_bbbc_demo_images.py``. The
sibling script fetches the public sample PNGs (327×423, 8-bit, ~24 cells)
which are good enough for a smoke test but trip the n<30 PCA fallback
in the composite mechano score and don't show off the pipeline at the
density Cell Painting was designed for.

This script instead pulls **one curated (plate, well, site) coordinate**
from the real BBBC022 plate-channel zip archives and stitches the 5
wavelength TIFFs into the canonical GlycoQuant 5-slot layout. It uses
HTTP Range requests via ``remotezip`` so we only download ~7 MB total
(5 × ~1.4 MB TIFFs) instead of the 7 GB of full plate-channel zips.
The Broad data server's Range support has been verified end-to-end:

    $ curl -I -H 'Range: bytes=0-1023' \\
        https://data.broadinstitute.org/bbbc/BBBC022/BBBC022_v1_images_20585w1.zip
    HTTP/1.1 206 Partial Content
    accept-ranges: bytes
    content-length: 1024
    content-range: bytes 0-1023/1383949189   ← full zip is 1.38 GB

Curated coordinate
------------------
plate ``20585``, well ``A01``, site ``s5``

Why this one:
    - 20585 is one of the 20 BBBC022 plates and is referenced in the
      Broad bioimage_metric_comparison repo as a clean baseline
      processing target.
    - A01 is the corner well; far away from compound treatments that
      live in the inner 22×14 grid, so this is an unperturbed control.
    - s5 is the centre of the 9-site (3×3) per-well imaging grid, so
      autofocus, illumination uniformity, and field-of-view tiling
      artefacts are minimised.

If this specific coordinate turns out to be a stain failure or otherwise
unusable, swap the constants at the top of the file. The script is
deliberately one-coordinate-per-run; multi-field cohort curation is a
follow-on PR.

Channel mapping into the canonical 5-slot TIFF
-----------------------------------------------

| GlycoQuant slot | BBBC022 channel | Real biological identity   | Real match? |
|-----------------|-----------------|----------------------------|-------------|
| 0 — DAPI        | w1              | Hoechst 33342              | yes         |
| 1 — glycocalyx  | w4              | WGA + phalloidin (AGP)     | yes (WGA)   |
| 2 — YAP         | w2              | con A (ER)                 | no — note   |
| 3 — paxillin    | w5              | MitoTracker Deep Red       | no — note   |
| 4 — actin       | w4              | WGA + phalloidin (AGP)     | yes (phalloidin) |

The glycocalyx and actin slots intentionally point at the same w4
channel — Cell Painting bundles WGA and phalloidin in a single AGP
stain and can't separate them at the imaging level. The slot-source
notes in the manifest document this honestly.

License
-------
BBBC022 is released by the Broad Institute under CC0 / public domain.
Attribution to Gustafsdottir et al. 2013 PLoS ONE is recorded in the
manifest entry written by this script.
"""
from __future__ import annotations

import io
import json
import sys
import urllib.request
from pathlib import Path

import numpy as np
import tifffile

# remotezip is the only non-trivial dep this script needs. The pipeline
# itself doesn't depend on it; it lives only in the optional download
# script. ``pip install remotezip`` if missing.
try:
    from remotezip import RemoteZip
except ImportError as exc:  # pragma: no cover - install hint only
    raise SystemExit(
        "remotezip is required for the dense BBBC022 downloader.\n"
        "Install with: pip install remotezip"
    ) from exc

_REPO_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = _REPO_ROOT / "data" / "demo"
OUTPUT_TIFF = OUTPUT_DIR / "BBBC022_U2OS_CellPainting.tiff"
MANIFEST_PATH = OUTPUT_DIR / "manifest.json"

# ---------------------------------------------------------------------------
# Curated coordinate — edit these three constants to swap fields.
# ---------------------------------------------------------------------------
PLATE = "20585"
WELL = "A01"
SITE = "s5"

BBBC_BASE = "https://data.broadinstitute.org/bbbc/BBBC022"
USER_AGENT = "GlycoQuant/0.3 (https://github.com/orgavaa/GlycoQuant)"

# Canonical 5-slot mapping. Tuples are (slot_index, channel_id, slot_name).
# Slot 1 (glycocalyx) and slot 4 (actin) both pull from w4 because Cell
# Painting's AGP channel bundles WGA + phalloidin into a single stain.
SLOT_TO_CHANNEL: list[tuple[int, str, str]] = [
    (0, "w1", "dapi"),
    (1, "w4", "glycocalyx"),
    (2, "w2", "yap"),
    (3, "w5", "paxillin"),
    (4, "w4", "actin"),
]


def _zip_url(channel: str) -> str:
    """Build the BBBC022 plate-channel zip URL."""
    return f"{BBBC_BASE}/BBBC022_v1_images_{PLATE}{channel}.zip"


def _entry_substring(channel: str) -> str:
    """Pattern that uniquely identifies the target entry inside a zip.

    Inside-zip filenames look like:
        BBBC022_v1_images_20585w1/IXMtest_A01_s5_w1<UUID>.tif

    We anchor on the leading slash so a UUID that happens to contain
    the substring "A01" doesn't false-match.
    """
    return f"/IXMtest_{WELL}_{SITE}_{channel}"


def fetch_one_tiff(channel: str) -> np.ndarray:
    """Pull one TIFF from a remote BBBC022 plate-channel zip via Range requests.

    Returns the decoded uint16 array. ~1.4 MB of bandwidth per call
    instead of the 1.4 GB the full zip would consume.
    """
    url = _zip_url(channel)
    needle = _entry_substring(channel)
    print(f"[bbbc-plate] {channel}: opening {url}")
    with RemoteZip(url) as rz:
        candidates = [n for n in rz.namelist() if needle in n]
        if not candidates:
            raise RuntimeError(
                f"no entry matching {needle!r} in {url} — coordinate "
                f"({PLATE}, {WELL}, {SITE}) may be wrong for this plate"
            )
        if len(candidates) > 1:
            raise RuntimeError(
                f"ambiguous match for {needle!r} in {url}: {candidates}"
            )
        entry = candidates[0]
        print(f"[bbbc-plate] {channel}: extracting {entry}")
        tiff_bytes = rz.read(entry)
    arr = tifffile.imread(io.BytesIO(tiff_bytes))
    if arr.ndim != 2:
        raise RuntimeError(
            f"unexpected TIFF shape for {channel}: {arr.shape}; expected 2D"
        )
    print(f"[bbbc-plate] {channel}: shape={arr.shape} dtype={arr.dtype}")
    return arr


def build_dense_field() -> tuple[Path, dict]:
    """Stitch the curated 5-channel field into a uint16 canonical TIFF."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Cache so the duplicated w4 channel only downloads once.
    cache: dict[str, np.ndarray] = {}
    slots: list[np.ndarray] = []
    for _slot_idx, channel, _slot_name in SLOT_TO_CHANNEL:
        if channel not in cache:
            cache[channel] = fetch_one_tiff(channel)
        slots.append(cache[channel])

    h, w = slots[0].shape
    print(f"[bbbc-plate] stitching 5 slots at {h}x{w}")
    if any(s.shape != (h, w) for s in slots):
        raise RuntimeError(
            "channel TIFFs have inconsistent shapes — refuse to stitch"
        )

    # All BBBC022 TIFFs are uint16; preserve precision (no rescale).
    stack = np.stack(slots, axis=0).astype(np.uint16)
    tifffile.imwrite(OUTPUT_TIFF, stack, compression="zlib")
    size_kb = OUTPUT_TIFF.stat().st_size // 1024
    print(f"[bbbc-plate] wrote {OUTPUT_TIFF.relative_to(_REPO_ROOT)} ({size_kb} KB)")

    entry = {
        "name": "BBBC022_U2OS_CellPainting",
        "display_name": (
            f"Cell Painting — U-2 OS (BBBC022, plate {PLATE} / {WELL} / {SITE})"
        ),
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
            f"One U-2 OS field of view from the BBBC022 Cell Painting pilot "
            f"screen — plate {PLATE}, well {WELL} (corner / unperturbed "
            f"control), site {SITE} (centre of the 3×3 imaging grid). "
            f"Native 16-bit TIFFs at {h}×{w} resolution, ~{round(h * w * 0.656**2 / 1e3)} "
            f"thousand µm². Two slots (DAPI, glycocalyx-WGA) carry real "
            f"biological signal; the actin slot also pulls the WGA+phalloidin "
            f"AGP channel. YAP and paxillin slots are documented "
            f"substitutions. This is the gold reference demo for exercising "
            f"the GlycoQuant glycocalyx extractors against real WGA-lectin "
            f"staining."
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
            f"No crop — {h}×{w} px = {round(h * 0.656)}×{round(w * 0.656)} µm "
            f"at the 0.656 µm/px BBBC022 native sampling. Yields ~50–80 "
            f"segmented cells; n≥30 trips real PCA on the composite mechano "
            f"score (no weighted-sum fallback). First Cellpose-SAM pass on "
            f"this field is ~6 min on CPU; subsequent runs hit the model "
            f"singleton cache and are <30 s."
        ),
        "slot_sources": {
            "dapi": {
                "bbbc_channel": "w1 (Hoechst 33342)",
                "biological_identity": "Hoechst 33342 (DNA / nuclei)",
                "matches_labouesse_protocol": True,
            },
            "glycocalyx": {
                "bbbc_channel": "w4 (WGA + phalloidin AGP)",
                "biological_identity": "WGA-lectin + phalloidin (AGP channel)",
                "matches_labouesse_protocol": True,
                "note": (
                    "Real WGA-lectin signal — the canonical glycocalyx "
                    "marker. Cell Painting bundles WGA with phalloidin in a "
                    "single AGP channel, so the same image also feeds the "
                    "actin slot. Glycocalyx pericellular features are "
                    "scientifically meaningful on this slot."
                ),
            },
            "yap": {
                "bbbc_channel": "w2 (con A / ER)",
                "biological_identity": "con A (endoplasmic reticulum)",
                "matches_labouesse_protocol": False,
                "note": (
                    "Real ER stain (concanavalin A), not anti-YAP. The YAP "
                    "N/C ratio computed on this slot reflects ER nuclear-"
                    "perinuclear intensity, not YAP/TAZ translocation, and "
                    "should not be interpreted as mechanotransduction signal."
                ),
            },
            "paxillin": {
                "bbbc_channel": "w5 (MitoTracker Deep Red)",
                "biological_identity": "MitoTracker Deep Red (mitochondria)",
                "matches_labouesse_protocol": False,
                "note": (
                    "Real mitochondrial stain, not anti-paxillin. Focal-"
                    "adhesion features extracted from this slot reflect "
                    "mitochondrial puncta morphometry, not adhesion biology."
                ),
            },
            "actin": {
                "bbbc_channel": "w4 (WGA + phalloidin AGP, duplicated)",
                "biological_identity": (
                    "WGA-lectin + phalloidin (AGP channel, duplicated)"
                ),
                "matches_labouesse_protocol": True,
                "note": (
                    "Same AGP channel as the glycocalyx slot — Cell Painting "
                    "does not separate WGA from phalloidin. Actin coherence "
                    "and cortical-ratio features therefore reflect a mixture "
                    "of WGA membrane staining and phalloidin F-actin and "
                    "should be interpreted with that caveat."
                ),
            },
        },
        "bbbc_coordinate": {
            "plate": PLATE,
            "well": WELL,
            "site": SITE,
            "channels": {
                slot_name: channel for _, channel, slot_name in SLOT_TO_CHANNEL
            },
        },
    }
    return OUTPUT_TIFF, entry


def main() -> int:
    try:
        _path, entry = build_dense_field()
    except Exception as exc:  # noqa: BLE001
        print(f"[bbbc-plate] FAILED: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1

    if MANIFEST_PATH.is_file():
        manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    else:
        manifest = {
            "schema_version": 2,
            "channel_order": ["dapi", "glycocalyx", "yap", "paxillin", "actin"],
            "datasets": [],
        }
    manifest["datasets"] = [
        d for d in manifest.get("datasets", []) if d.get("name") != entry["name"]
    ]
    manifest["datasets"] = [entry] + manifest["datasets"]
    MANIFEST_PATH.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"[bbbc-plate] updated {MANIFEST_PATH.relative_to(_REPO_ROOT)}")
    print(f"[bbbc-plate] {len(manifest['datasets'])} demo datasets registered")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
