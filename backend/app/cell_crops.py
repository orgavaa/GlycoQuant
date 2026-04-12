"""Per-cell channel crop extraction for the Single Cell view.

Generates base64-encoded PNG thumbnails of each channel for a selected
cell, plus an FA detection overlay on the paxillin crop. Called on-demand
when the user clicks a cell — not pre-computed for all cells.
"""
from __future__ import annotations

import base64
import io
from typing import Any

import numpy as np
from PIL import Image
from skimage.measure import regionprops


def extract_cell_crops(
    channels: dict[str, np.ndarray],
    cell_mask: np.ndarray,
    cell_id: int,
    padding_px: int = 15,
    crop_size: int = 128,
) -> dict[str, Any]:
    """Extract per-channel crops for one cell as base64 PNGs.

    Returns a dict with:
      - ``crops``: ``{channel_name: "data:image/png;base64,..."}``
      - ``cell_id``: the requested cell ID
      - ``bbox``: ``[min_row, min_col, max_row, max_col]`` in mask coords
    """
    this_cell = (cell_mask == cell_id).astype(np.uint8)
    if not this_cell.any():
        return {"cell_id": cell_id, "crops": {}, "bbox": None}

    props = regionprops(this_cell)
    if not props:
        return {"cell_id": cell_id, "crops": {}, "bbox": None}

    minr, minc, maxr, maxc = props[0].bbox
    h, w = cell_mask.shape

    # Pad the bounding box
    minr = max(0, minr - padding_px)
    minc = max(0, minc - padding_px)
    maxr = min(h, maxr + padding_px)
    maxc = min(w, maxc + padding_px)

    crops: dict[str, str] = {}
    for ch_name, ch_data in channels.items():
        crop = ch_data[minr:maxr, minc:maxc].astype(np.float32)

        # Min-max normalize to [0, 255]
        cmin, cmax = float(crop.min()), float(crop.max())
        if cmax > cmin:
            crop = (crop - cmin) / (cmax - cmin) * 255.0
        else:
            crop = np.zeros_like(crop)

        # Resize to crop_size × crop_size for consistent thumbnails
        img = Image.fromarray(crop.astype(np.uint8), mode="L")
        img = img.resize((crop_size, crop_size), Image.LANCZOS)

        # Encode as base64 PNG
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        b64 = base64.b64encode(buf.getvalue()).decode("ascii")
        crops[ch_name] = f"data:image/png;base64,{b64}"

    return {
        "cell_id": cell_id,
        "crops": crops,
        "bbox": [int(minr), int(minc), int(maxr), int(maxc)],
    }
