"""Generate the Geneformer transcriptomic prior via Modal.

Historically this script ran Geneformer locally on a Colab GPU. After
Phase 5.6 (Modal GPU offload) and Axis B of the dynamic-Tab-2 refactor
the heavy lifting lives on Modal, so this script is now a thin CLI
wrapper that either:

1. **Runs the Modal function synchronously** (for a CLI-only user who
   doesn't want to click the UI button), blocks until completion, and
   writes ``data/priors/geneformer_ranks.json`` on disk.

2. **Falls through with a friendly error** when the ``modal`` package
   or the deployed function is unavailable, pointing the user at the
   UI button in Tab 2 as the preferred path.

Usage::

    # One-time (per developer machine)
    pip install modal
    modal token new
    bash scripts/deploy_modal.sh

    # Then:
    python scripts/generate_geneformer_priors.py

The generated JSON matches the schema of ``data/priors/pathway_ranks.json``
so ``glycoquant.predictor.prior_loader.load_prior`` reads it unchanged
and Tab 2's divergence column lights up automatically.
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[1]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from glycoquant.predictor.mechano_signature import (  # noqa: E402
    get_glycocalyx_genes,
    get_mechano_signature,
)

OUTPUT_DIR = _REPO_ROOT / "data" / "priors"
OUTPUT_PATH = OUTPUT_DIR / "geneformer_ranks.json"
MODAL_APP_NAME = "glycoquant-gpu"
MODAL_FUNCTION_NAME = "generate_geneformer_prior"


def main() -> int:
    """Run the Geneformer prior generation via Modal and persist the JSON."""
    glycocalyx_genes = get_glycocalyx_genes()
    mechano_genes = get_mechano_signature()

    print(
        f"[geneformer] panels: {len(glycocalyx_genes)} glycocalyx × "
        f"{len(mechano_genes)} mechano"
    )

    try:
        import modal
    except ImportError:
        print(
            "[geneformer] The 'modal' package is not installed. "
            "Install it with `pip install modal`, authenticate via "
            "`modal token new`, then retry.",
            file=sys.stderr,
        )
        return 1

    try:
        fn = modal.Function.from_name(MODAL_APP_NAME, MODAL_FUNCTION_NAME)
    except Exception as exc:  # noqa: BLE001
        print(
            f"[geneformer] Could not find the deployed Modal function "
            f"{MODAL_APP_NAME}/{MODAL_FUNCTION_NAME}: "
            f"{type(exc).__name__}: {exc}\n"
            f"Deploy it first with `bash scripts/deploy_modal.sh`.",
            file=sys.stderr,
        )
        return 2

    print(
        "[geneformer] dispatching synchronous call to Modal — "
        "this can take 20-30 min on an L4."
    )
    try:
        result = fn.remote(
            glycocalyx_genes=list(glycocalyx_genes),
            mechano_genes=list(mechano_genes),
        )
    except Exception as exc:  # noqa: BLE001
        print(
            f"[geneformer] Modal call failed: {type(exc).__name__}: {exc}",
            file=sys.stderr,
        )
        return 3

    if not isinstance(result, dict) or "genes" not in result:
        print(
            f"[geneformer] Modal function returned an unexpected shape: "
            f"{type(result).__name__}. "
            "Expected a dict with a 'genes' key.",
            file=sys.stderr,
        )
        return 4

    metadata = result.setdefault("metadata", {})
    metadata.setdefault(
        "generated_utc",
        datetime.now(tz=timezone.utc).isoformat(),
    )
    metadata.setdefault("runtime", "modal.L4")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(result, indent=2), encoding="utf-8")
    n_genes = len(result.get("genes", {}))
    print(
        f"[geneformer] wrote {OUTPUT_PATH.relative_to(_REPO_ROOT)} "
        f"({n_genes} genes). Tab 2 will pick it up on next /priors load."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
