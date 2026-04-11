"""Bundled demo image metadata + preview endpoints.

Datasets are now real Human Protein Atlas immunofluorescence images
downloaded via ``scripts/download_hpa_demo_images.py``. The per-image
metadata in ``data/demo/manifest.json`` carries full biological
provenance for every channel slot, so the UI can display honest
attributions instead of pretending the bundled data follows the
Labouesse-protocol channel layout.
"""
from __future__ import annotations

import io
import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from backend.app.schemas import DemoCondition, DemoListResponse

router = APIRouter(prefix="/demo", tags=["demo"])

DEMO_DIR = Path(__file__).resolve().parents[3] / "data" / "demo"
MANIFEST_PATH = DEMO_DIR / "manifest.json"


def _load_manifest() -> dict[str, Any]:
    if not MANIFEST_PATH.is_file():
        return {"schema_version": 0, "datasets": []}
    try:
        return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return {"schema_version": 0, "datasets": []}


def _find_dataset(name: str) -> dict[str, Any] | None:
    manifest = _load_manifest()
    for ds in manifest.get("datasets", []):
        if ds.get("name") == name:
            return ds
    return None


@router.get("", response_model=DemoListResponse)
async def list_demo_conditions() -> DemoListResponse:
    """Return the bundled demo datasets available on disk.

    Each dataset is a real HPA image stitched into our 5-slot TIFF
    schema. The returned ``DemoCondition.description`` carries the
    HPA attribution and the cell line so the UI can render it
    alongside the dropdown entry.
    """
    conditions: list[DemoCondition] = []
    manifest = _load_manifest()
    for ds in manifest.get("datasets", []):
        name = ds.get("name")
        if not name:
            continue
        tiff = DEMO_DIR / f"{name}.tiff"
        if not tiff.is_file():
            continue
        conditions.append(
            DemoCondition(
                name=name,
                display_name=ds.get("display_name", name),
                description=ds.get("description", ""),
                source=ds.get("source", "Synthetic"),
                license=ds.get("license", ""),
                attribution=ds.get("attribution", ""),
                attribution_url=ds.get("attribution_url", ""),
                gene=ds.get("gene", ""),
                cell_line=ds.get("cell_line", ""),
                is_real_microscopy=bool(ds.get("is_real_microscopy", False)),
                slot_sources=ds.get("slot_sources", {}),
            )
        )
    return DemoListResponse(conditions=conditions)


@router.get("/{name}/preview")
async def get_demo_preview(name: str) -> StreamingResponse:
    """Return a downsampled RGB PNG preview of a bundled demo TIFF.

    The preview maps slots 0 / 1 / 4 (DAPI / antibody / reference)
    onto the B / G / R output channels respectively. For HPA images
    that means:
      R  <- HPA red channel (microtubules, stored in actin slot)
      G  <- HPA green channel (antibody target, stored in glycocalyx slot)
      B  <- HPA blue channel (DAPI, stored in DAPI slot)
    which reproduces the familiar blue/green/red composite that HPA
    itself displays on its website.
    """
    dataset = _find_dataset(name)
    if dataset is None:
        raise HTTPException(status_code=404, detail=f"Unknown dataset: {name}")
    path = DEMO_DIR / f"{name}.tiff"
    if not path.is_file():
        raise HTTPException(status_code=404, detail=f"Demo image missing: {name}")

    import numpy as np
    from PIL import Image

    from glycoquant.io import downsample_for_display, load_multichannel_image

    image = load_multichannel_image(path)  # (H, W, 5) float32 in [0, 1]
    if image.ndim != 3 or image.shape[2] < 5:
        raise HTTPException(status_code=500, detail="Unexpected demo image shape")

    # Preview mapping — restore the HPA look
    rgb_source = np.stack(
        [image[:, :, 4], image[:, :, 1], image[:, :, 0]], axis=-1
    )  # (H, W, 3): R=microtubules, G=antibody, B=DAPI

    # Stretch each channel to [0, 1] via its own 1st–99.5th percentile
    stretched = np.zeros_like(rgb_source, dtype=np.float32)
    for i in range(3):
        ch = rgb_source[:, :, i]
        lo = float(np.quantile(ch, 0.01))
        hi = float(np.quantile(ch, 0.995))
        span = max(hi - lo, 1e-6)
        stretched[:, :, i] = np.clip((ch - lo) / span, 0.0, 1.0)

    rgb = downsample_for_display(stretched, max_side=1024)
    rgb_u8 = (np.clip(rgb, 0.0, 1.0) * 255.0).astype(np.uint8)

    buf = io.BytesIO()
    Image.fromarray(rgb_u8, mode="RGB").save(buf, format="PNG", optimize=False)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=3600"},
    )
