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
MODAL_GENEFORMER_FUNCTION_NAME = "generate_geneformer_prior"

# Cached remote function handles so we only pay the lookup cost once
# per worker process. Invalidated implicitly on process restart.
_REMOTE_FUNCTION: Any = None
_REMOTE_GENEFORMER_FUNCTION: Any = None


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
    import time

    fn = _lookup_modal_function()
    payload = _serialize_channels(channels)
    print(f"[gpu_client] dispatching to Modal (payload={len(payload)/1024:.0f} KB, deep={include_deep_features})")
    t0 = time.monotonic()
    try:
        raw = fn.remote(payload, int(cell_diameter), bool(include_deep_features))
    except Exception as exc:  # noqa: BLE001
        elapsed = time.monotonic() - t0
        print(f"[gpu_client] Modal call FAILED after {elapsed:.1f}s: {type(exc).__name__}: {exc}")
        raise RuntimeError(
            f"Modal call failed after {elapsed:.0f}s: {type(exc).__name__}: {exc}"
        ) from exc
    elapsed = time.monotonic() - t0
    print(f"[gpu_client] Modal call returned in {elapsed:.1f}s, type={type(raw).__name__}")
    if not isinstance(raw, dict):
        raise RuntimeError(
            f"Modal function returned unexpected type {type(raw).__name__}; "
            "expected a dict matching JobResult."
        )
    # Log payload size for debugging
    result = JobResult.model_validate(raw)
    print(f"[gpu_client] JobResult parsed OK: {result.cell_count} cells, deep={result.has_deep_features}")
    return result


# ---------------------------------------------------------------------------
# Axis B — Geneformer async spawn + poll
# ---------------------------------------------------------------------------


def _lookup_geneformer_function() -> Any:
    """Lazy + cached lookup of the deployed Geneformer Modal function."""
    global _REMOTE_GENEFORMER_FUNCTION
    if _REMOTE_GENEFORMER_FUNCTION is not None:
        return _REMOTE_GENEFORMER_FUNCTION
    try:
        import modal
    except ImportError as exc:  # noqa: BLE001
        raise RuntimeError(
            "Modal provider selected but the 'modal' package is not installed."
        ) from exc
    try:
        _REMOTE_GENEFORMER_FUNCTION = modal.Function.from_name(
            MODAL_APP_NAME, MODAL_GENEFORMER_FUNCTION_NAME
        )
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(
            f"Modal Geneformer function lookup failed: {type(exc).__name__}: {exc}"
        ) from exc
    return _REMOTE_GENEFORMER_FUNCTION


def spawn_geneformer_generation(
    n_reference_cells: int = 5000,
) -> str:
    """Spawn a Modal Geneformer run asynchronously.

    Uses ``modal.Function.spawn`` which returns an opaque function-call
    handle immediately instead of blocking. The returned ``object_id``
    is stored in the JobStore so subsequent polls can re-fetch the
    call state via :func:`poll_geneformer_call`.

    The full 22 × 15 in-silico perturbation grid takes ~20-30 min on
    an L4 — too long for a synchronous HTTP request.
    """
    from glycoquant.predictor import get_glycocalyx_genes, get_mechano_signature

    fn = _lookup_geneformer_function()
    try:
        call = fn.spawn(
            glycocalyx_genes=list(get_glycocalyx_genes()),
            mechano_genes=list(get_mechano_signature()),
            n_reference_cells=int(n_reference_cells),
        )
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(
            f"Modal spawn failed: {type(exc).__name__}: {exc}"
        ) from exc
    return str(call.object_id)


def poll_geneformer_call(call_id: str) -> tuple[str, dict[str, Any] | None]:
    """Return the current state of a spawned Geneformer call.

    Returns
    -------
    (state, result) : tuple
        ``state`` ∈ ``{"running", "complete", "failed"}``.
        ``result`` is the dict returned by the Modal function when
        complete, otherwise ``None``.
    """
    try:
        import modal
    except ImportError as exc:  # noqa: BLE001
        raise RuntimeError(
            "Modal provider selected but the 'modal' package is not installed."
        ) from exc

    try:
        call = modal.FunctionCall.from_id(call_id)
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(
            f"Modal call lookup failed for {call_id}: {type(exc).__name__}: {exc}"
        ) from exc

    try:
        # Non-blocking poll: timeout=0 raises TimeoutError if still running.
        result = call.get(timeout=0)
    except TimeoutError:
        return "running", None
    except Exception as exc:  # noqa: BLE001 - catch Modal's OutputExpired and friends
        # Any other exception from Modal is treated as failed so the
        # caller can surface a useful error to the user.
        return "failed", None if "Expired" in type(exc).__name__ else None

    if not isinstance(result, dict):
        raise RuntimeError(
            f"Modal Geneformer function returned unexpected type "
            f"{type(result).__name__}; expected a dict matching "
            "geneformer_ranks.json schema."
        )
    return "complete", result
