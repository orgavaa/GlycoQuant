"""Bundled demo image metadata endpoints."""
from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter

from backend.app.schemas import DemoCondition, DemoListResponse

router = APIRouter(prefix="/demo", tags=["demo"])

DEMO_DIR = Path(__file__).resolve().parents[3] / "data" / "demo"

_DESCRIPTIONS = {
    "control": "Intact pericellular WGA ring, cytoplasmic YAP, typical focal adhesions.",
    "siSDC1": "Reduced glycocalyx (thin ring, lower intensity) with mild YAP translocation.",
    "heparinase": "Thinned ring + elevated YAP nuclear signal, fewer focal adhesions.",
}


@router.get("", response_model=DemoListResponse)
async def list_demo_conditions() -> DemoListResponse:
    """Return the bundled demo conditions available on disk."""
    conditions: list[DemoCondition] = []

    manifest_path = DEMO_DIR / "manifest.json"
    manifest_cell_count = 5
    if manifest_path.is_file():
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest_cell_count = int(manifest.get("cell_count", 5))
        except Exception:  # noqa: BLE001
            pass

    for name in ("control", "siSDC1", "heparinase"):
        tiff = DEMO_DIR / f"{name}.tiff"
        if tiff.is_file():
            conditions.append(
                DemoCondition(
                    name=name,
                    description=_DESCRIPTIONS.get(name, ""),
                    cell_count=manifest_cell_count,
                )
            )
    return DemoListResponse(conditions=conditions)
