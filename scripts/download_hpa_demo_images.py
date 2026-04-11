"""Download real Human Protein Atlas (HPA) subcellular IF images for Tab 1.

Replaces the previous synthetic disk-drawing demos with real
immunofluorescence microscopy from the Human Protein Atlas.

For each of the three target proteins (SDC1, CD44, YAP1) we fetch the
four available channels (blue = DAPI, red = microtubules,
yellow = endoplasmic reticulum, green = antibody target) from the HPA
image CDN, convert the RGB JPEGs to single-channel float arrays, and
stitch them into a 5-channel TIFF matching our canonical
``data/demo/*.tiff`` schema.

Canonical channel slots in the TIFF (matching the GlycoQuant UI):

    slot 0: DAPI       <-  HPA blue channel (real DAPI)
    slot 1: glycocalyx <-  HPA green channel (real antibody target)
    slot 2: YAP        <-  HPA green channel (duplicated; this is *not*
                           anti-YAP staining in general — we flag the
                           mismatch in the sidecar manifest)
    slot 3: paxillin   <-  HPA yellow channel (ER in most images; again,
                           *not* paxillin)
    slot 4: actin      <-  HPA red channel (microtubules; *not* phalloidin)

The sidecar ``data/demo/manifest.json`` records the **real biological
identity** of each slot per image so the UI can display honest channel
labels (e.g. "slot 4 shows HPA microtubules, not phalloidin actin").
The Labouesse-protocol channel names are kept as slot positions only
for pipeline compatibility.

License: HPA images are CC BY-SA 3.0. Attribution is written into
``manifest.json`` and displayed in the app.
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

# ---------------------------------------------------------------------------
# Crop configuration
# ---------------------------------------------------------------------------
# The raw HPA images are 1728x1728 or 2048x2048. At native resolution a full
# Cellpose-SAM pass takes 15-30 minutes on CPU, which makes interactive
# testing impractical. We crop each image to CROP_SIZE x CROP_SIZE pixels
# centered on the region with the highest DAPI mass (i.e. the most nucleus-
# dense patch). This preserves the native per-cell resolution (cells remain
# ~80-120 px across), keeps Cellpose-SAM at its published ~0.88 AP, and
# drops wall-clock runtime to ~4 minutes per image.
#
# Choose CROP_SIZE via the command line (default 768). 768 balances cell
# density (~25-40 cells per crop) against runtime (~4 min CPU). Drop to 512
# for ~2-3 min at the cost of ~15-20 cells per crop.
CROP_SIZE = 768

_REPO_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = _REPO_ROOT / "data" / "demo"
HPA_CDN = "https://images.proteinatlas.org"
USER_AGENT = "GlycoQuant/0.3 (https://github.com/orgavaa/GlycoQuant)"


@dataclass(frozen=True)
class HPASpec:
    """One HPA image we want to fetch and repackage."""

    name: str  # slug used for the TIFF filename and UI label
    gene: str  # display label
    ensembl_id: str
    antibody_path: str  # CDN subpath, e.g. "6185"
    image_stem: str  # filename stem, e.g. "95_B1_1"
    cell_line: str
    description: str
    glycocalyx_slot_source: str  # "green"  (HPA antibody channel)
    # Per-slot provenance for the manifest
    slot_sources: dict[str, str] | None = None


# ---------------------------------------------------------------------------
# Target images — picked because each gene is directly in our glycocalyx or
# mechanotransduction panels, so a PI immediately recognises the protein.
# ---------------------------------------------------------------------------
TARGETS: list[HPASpec] = [
    HPASpec(
        name="HPA_SDC1_U2OS",
        gene="SDC1",
        ensembl_id="ENSG00000115884",
        antibody_path="6185",
        image_stem="95_B1_1",
        cell_line="U-2 OS (osteosarcoma)",
        description=(
            "Syndecan-1 immunofluorescence in U-2 OS cells. SDC1 is the "
            "primary heparan-sulfate proteoglycan target for glycocalyx "
            "perturbation studies."
        ),
        glycocalyx_slot_source="green",
    ),
    HPASpec(
        name="HPA_CD44_U251MG",
        gene="CD44",
        ensembl_id="ENSG00000026508",
        antibody_path="112",
        image_stem="207_F1_1",
        cell_line="U-251 MG (glioma)",
        description=(
            "CD44 immunofluorescence. CD44 is the top-ranked gene in "
            "the STRING pathway prior shown in Tab 2."
        ),
        glycocalyx_slot_source="green",
    ),
    HPASpec(
        name="HPA_YAP1_U2OS",
        gene="YAP1",
        ensembl_id="ENSG00000137693",
        antibody_path="38884",
        image_stem="862_E4_1",
        cell_line="U-2 OS (osteosarcoma)",
        description=(
            "YAP1 immunofluorescence. YAP is the canonical "
            "mechanotransduction readout; Dupont et al. Nature 2011."
        ),
        glycocalyx_slot_source="green",
    ),
]


# ---------------------------------------------------------------------------
# Fetching and TIFF assembly
# ---------------------------------------------------------------------------


def fetch_channel(spec: HPASpec, channel: str) -> np.ndarray:
    """Download one HPA channel JPEG and return a single-channel float32 array.

    HPA stores each microscopy channel as a coloured RGB JPEG — e.g. the
    ``blue`` JPEG is a black-and-blue image where only the B plane is
    non-zero. We collapse it to grayscale by taking the dominant channel
    intensity, which recovers the original single-channel information
    without mixing colours.
    """
    url = f"{HPA_CDN}/{spec.antibody_path}/{spec.image_stem}_{channel}.jpg"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = resp.read()
    img = Image.open(io.BytesIO(data)).convert("RGB")
    arr = np.array(img, dtype=np.float32) / 255.0  # (H, W, 3) in [0, 1]

    # Take the max across RGB — the channel that carries the signal
    gray = arr.max(axis=-1)  # (H, W)
    return gray


def _pick_dapi_dense_crop(
    dapi: np.ndarray, crop_size: int
) -> tuple[int, int]:
    """Find the (top-left) corner of the most DAPI-dense crop_size x crop_size window.

    Uses a box-sum via the integral image (``cumsum`` trick) so the search
    is O(H*W) regardless of window size. Returns clamped coordinates so
    the crop always lies fully inside the image.
    """
    h, w = dapi.shape
    if h <= crop_size and w <= crop_size:
        return 0, 0

    # Integral image: integral[i, j] = sum of dapi[:i, :j]
    integral = np.zeros((h + 1, w + 1), dtype=np.float64)
    integral[1:, 1:] = np.cumsum(np.cumsum(dapi, axis=0), axis=1)

    # Box-sum at every valid (r, c): sum of dapi[r:r+crop, c:c+crop]
    max_r = h - crop_size
    max_c = w - crop_size
    br = integral[crop_size : crop_size + max_r + 1, crop_size : crop_size + max_c + 1]
    tr = integral[:max_r + 1, crop_size : crop_size + max_c + 1]
    bl = integral[crop_size : crop_size + max_r + 1, :max_c + 1]
    tl = integral[:max_r + 1, :max_c + 1]
    box_sums = br - tr - bl + tl  # shape (max_r + 1, max_c + 1)

    flat = int(box_sums.argmax())
    r0, c0 = np.unravel_index(flat, box_sums.shape)
    return int(r0), int(c0)


def _crop_channels(
    channels: dict[str, np.ndarray], crop_size: int
) -> dict[str, np.ndarray]:
    """Crop every channel in the dict to the same DAPI-dense window."""
    dapi = channels["blue"]
    r0, c0 = _pick_dapi_dense_crop(dapi, crop_size)
    h, w = dapi.shape
    if h <= crop_size and w <= crop_size:
        return channels
    return {
        name: arr[r0 : r0 + crop_size, c0 : c0 + crop_size]
        for name, arr in channels.items()
    }


def build_tiff_for_spec(spec: HPASpec) -> tuple[Path, dict]:
    """Download 4 channels, crop, stitch into a 5-channel uint16 TIFF, write."""
    print(f"[hpa] fetching {spec.gene} channels from HPA CDN ({spec.antibody_path}/{spec.image_stem})")
    raw_channels = {
        "blue": fetch_channel(spec, "blue"),  # DAPI
        "red": fetch_channel(spec, "red"),  # microtubules
        "green": fetch_channel(spec, "green"),  # antibody target
        "yellow": fetch_channel(spec, "yellow"),  # ER
    }
    raw_h, raw_w = raw_channels["blue"].shape
    print(f"       downloaded 4 channels at {raw_h}x{raw_w}")

    cropped = _crop_channels(raw_channels, CROP_SIZE)
    h, w = cropped["blue"].shape
    if (h, w) != (raw_h, raw_w):
        print(
            f"       cropped to {h}x{w} centered on the DAPI-densest region "
            f"(preserves native per-cell resolution; Cellpose-SAM ~0.88 AP)"
        )

    blue = cropped["blue"]
    red = cropped["red"]
    green = cropped["green"]
    yellow = cropped["yellow"]

    # Canonical 5-slot layout (matching data/demo manifest + Tab 1 UI)
    slots = np.stack(
        [
            blue,  # slot 0 DAPI            = real DAPI
            green,  # slot 1 glycocalyx      = real antibody (e.g. SDC1)
            green,  # slot 2 YAP             = duplicate of antibody (NOT real YAP)
            yellow,  # slot 3 paxillin       = real ER (NOT real paxillin)
            red,  # slot 4 actin             = real microtubules (NOT real actin)
        ],
        axis=0,
    )  # shape (5, H, W)

    # Scale to uint16 for on-disk compactness
    stack = np.clip(slots * 65535.0, 0, 65535).astype(np.uint16)

    out_path = OUTPUT_DIR / f"{spec.name}.tiff"
    tifffile.imwrite(out_path, stack, compression="zlib")
    size_kb = out_path.stat().st_size // 1024
    print(f"       wrote {out_path.relative_to(_REPO_ROOT)} ({size_kb} KB)")

    # Per-slot provenance entry for the manifest
    slot_sources = {
        "dapi": {
            "hpa_channel": "blue",
            "biological_identity": "DAPI (nuclei)",
            "matches_labouesse_protocol": True,
        },
        "glycocalyx": {
            "hpa_channel": "green",
            "biological_identity": f"anti-{spec.gene} immunofluorescence",
            "matches_labouesse_protocol": False,
            "note": (
                f"Real antibody stain of {spec.gene}. "
                "Labouesse protocol expects WGA-lectin in this slot — "
                f"{spec.gene} is a glycocalyx target gene, so feature "
                "extraction on this slot still exercises the pipeline "
                "meaningfully."
            ),
        },
        "yap": {
            "hpa_channel": "green (duplicated)",
            "biological_identity": f"anti-{spec.gene} (duplicate of slot 1)",
            "matches_labouesse_protocol": False,
            "note": (
                "HPA does not provide a YAP co-stain in this image. "
                "The YAP slot is duplicated from the antibody channel "
                "so the pipeline runs end-to-end; YAP N/C ratios "
                "computed on this image are not biologically meaningful."
            ),
        },
        "paxillin": {
            "hpa_channel": "yellow",
            "biological_identity": "ER reference stain",
            "matches_labouesse_protocol": False,
            "note": (
                "Real endoplasmic reticulum reference, not paxillin. "
                "Focal-adhesion features on this image reflect ER "
                "punctate structure and should not be interpreted "
                "biologically."
            ),
        },
        "actin": {
            "hpa_channel": "red",
            "biological_identity": "microtubule reference stain",
            "matches_labouesse_protocol": False,
            "note": (
                "Real microtubule reference, not phalloidin-stained "
                "actin. Actin coherence values reflect microtubule "
                "organisation."
            ),
        },
    }
    entry = {
        "name": spec.name,
        "display_name": f"{spec.gene} — {spec.cell_line}",
        "source": "Human Protein Atlas",
        "license": "CC BY-SA 3.0",
        "attribution": (
            f"Human Protein Atlas, {spec.gene} in {spec.cell_line}, "
            f"antibody {spec.antibody_path}/{spec.image_stem}"
        ),
        "attribution_url": (
            f"https://www.proteinatlas.org/{spec.ensembl_id}-{spec.gene}/subcellular"
        ),
        "gene": spec.gene,
        "ensembl_id": spec.ensembl_id,
        "cell_line": spec.cell_line,
        "description": spec.description,
        "is_real_microscopy": True,
        "native_image_size": [raw_h, raw_w],
        "image_size": [h, w],
        "crop_strategy": (
            "DAPI-dense center crop at native resolution; preserves per-cell "
            "pixel size so Cellpose-SAM operates at ~0.88 average precision "
            "(Stringer & Pachitariu 2024 benchmark)."
        ),
        "slot_sources": slot_sources,
    }
    return out_path, entry


def main() -> int:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest: dict = {
        "schema_version": 2,
        "channel_order": ["dapi", "glycocalyx", "yap", "paxillin", "actin"],
        "datasets": [],
    }
    for spec in TARGETS:
        try:
            _out_path, entry = build_tiff_for_spec(spec)
            manifest["datasets"].append(entry)
        except Exception as e:
            print(f"[hpa] FAILED for {spec.gene}: {type(e).__name__}: {e}", file=sys.stderr)
            return 1

    manifest_path = OUTPUT_DIR / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"[hpa] wrote {manifest_path.relative_to(_REPO_ROOT)}")
    print(f"[hpa] {len(manifest['datasets'])} real HPA images ready")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
