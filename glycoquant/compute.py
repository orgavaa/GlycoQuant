"""Compute-device helpers.

Single source of truth for deciding whether the pipeline runs on CPU or
GPU. Order of precedence:

1. ``GLYCOQUANT_DEVICE`` env var if set (``"cuda"``, ``"cpu"``, or ``"auto"``)
2. Otherwise auto-detect via ``torch.cuda.is_available()``

Used by ``CellSegmenter``, ``DinoV2Embedder``, and the backend worker
singletons so every model lives on the same device, no scattered
``gpu=False`` hardcoding.
"""
from __future__ import annotations

import os
from functools import lru_cache


@lru_cache(maxsize=1)
def resolve_device() -> str:
    """Return ``"cuda"`` or ``"cpu"`` based on env var + hardware probe.

    A literal ``GLYCOQUANT_DEVICE=cuda`` is only honored if torch can
    actually see a CUDA device. Otherwise we fall back to CPU so
    downstream models (DINOv2, Cellpose) don't crash on ``.to("cuda")``
    in a container that has no NVIDIA driver.
    """
    env = os.environ.get("GLYCOQUANT_DEVICE", "auto").strip().lower()
    if env == "cpu":
        return "cpu"
    try:
        import torch

        cuda_available = torch.cuda.is_available()
    except Exception:  # noqa: BLE001 - torch may not be importable in some test contexts
        cuda_available = False
    if env == "cuda":
        return "cuda" if cuda_available else "cpu"
    return "cuda" if cuda_available else "cpu"


@lru_cache(maxsize=1)
def use_gpu() -> bool:
    """Boolean shortcut matching the Cellpose API's ``gpu=`` kwarg."""
    return resolve_device() == "cuda"


def describe_device() -> str:
    """Human-readable device summary for logs / health endpoint.

    Returns strings like ``"cpu"``, ``"cuda · NVIDIA L4"``, or
    ``"cuda requested but unavailable → cpu fallback"`` so deployments
    can verify from ``/health`` whether the GPU env var actually
    resolved to hardware.
    """
    dev = resolve_device()
    if dev == "cpu":
        return "cpu"
    try:
        import torch

        if not torch.cuda.is_available():
            return "cuda requested but unavailable → cpu fallback"
        name = torch.cuda.get_device_name(0)
        if not name or name.lower() == "cuda":
            return "cuda (device name unavailable)"
        return f"cuda · {name}"
    except Exception:  # noqa: BLE001
        return "cuda (torch probe failed)"
