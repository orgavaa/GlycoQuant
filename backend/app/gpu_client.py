"""GPU provider abstraction for the analysis worker.

The FastAPI worker calls ``get_provider()`` to decide whether to run
the heavy pipeline locally (laptop dev loop or CPU-fallback Railway
deployment) or remotely on Modal (Railway + Modal production split).

The remote path serializes the channel dict to a compressed NPZ, calls
the Modal function, and rehydrates the returned dict into a
``JobResult`` pydantic model. All failures surface as ``RuntimeError``
with a human-readable message so the JobStore's ``failed`` state stays
useful.
"""
from __future__ import annotations

import io
import os
from typing import Any, Literal

import numpy as np

from backend.app.schemas import JobResult

Provider = Literal["local", "modal"]

MODAL_APP_NAME = "glycoquant-gpu"
MODAL_FUNCTION_NAME = "run_pipeline"

# Cached remote function handle so we only pay the lookup cost once per
# worker process. Invalidated implicitly on process restart.
_REMOTE_FUNCTION: Any = None


def get_provider() -> Provider:
    """Return the active GPU provider.

    Controlled by the ``GLYCOQUANT_GPU_PROVIDER`` env var. Anything
    other than an exact ``"modal"`` is treated as ``"local"`` so a
    typo never sends a laptop dev loop into a remote call.
    """
    raw = os.environ.get("GLYCOQUANT_GPU_PROVIDER", "").strip().lower()
    return "modal" if raw == "modal" else "local"


def _serialize_channels(channels: dict[str, np.ndarray]) -> bytes:
    """Pack a channel dict into a compressed NPZ payload."""
    buf = io.BytesIO()
    np.savez_compressed(buf, **channels)
    return buf.getvalue()


def _lookup_modal_function() -> Any:
    """Lazy + cached lookup of the deployed Modal function."""
    global _REMOTE_FUNCTION
    if _REMOTE_FUNCTION is not None:
        return _REMOTE_FUNCTION
    try:
        import modal
    except ImportError as exc:  # noqa: BLE001
        raise RuntimeError(
            "Modal provider selected but the 'modal' package is not installed. "
            "Add it to pyproject.toml or set GLYCOQUANT_GPU_PROVIDER=local."
        ) from exc
    try:
        _REMOTE_FUNCTION = modal.Function.from_name(
            MODAL_APP_NAME, MODAL_FUNCTION_NAME
        )
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(
            f"Modal function lookup failed for {MODAL_APP_NAME}/{MODAL_FUNCTION_NAME}: "
            f"{type(exc).__name__}: {exc}. "
            "Ensure you have run 'modal deploy backend/modal_app.py' and that "
            "MODAL_TOKEN_ID / MODAL_TOKEN_SECRET are set."
        ) from exc
    return _REMOTE_FUNCTION


def run_pipeline_remote(
    channels: dict[str, np.ndarray],
    cell_diameter: int,
    include_deep_features: bool,
) -> JobResult:
    """Execute the GlycoQuant pipeline on Modal and return a JobResult.

    Parameters match the worker's local code path so the dispatcher
    branch can be a one-liner.
    """
    fn = _lookup_modal_function()
    payload = _serialize_channels(channels)
    try:
        raw = fn.remote(payload, int(cell_diameter), bool(include_deep_features))
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(
            f"Modal call failed: {type(exc).__name__}: {exc}"
        ) from exc
    if not isinstance(raw, dict):
        raise RuntimeError(
            f"Modal function returned unexpected type {type(raw).__name__}; "
            "expected a dict matching JobResult."
        )
    return JobResult.model_validate(raw)
