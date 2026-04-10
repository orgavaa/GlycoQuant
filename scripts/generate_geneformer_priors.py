"""Generate the Geneformer transcriptomic prior for Tab 2.

Runs **once** on a Google Colab GPU runtime (or any machine with a
CUDA GPU + enough RAM). Writes
``data/priors/geneformer_ranks.json`` which Tab 2 then loads at
runtime with zero model loading.

Fallback ladder (matches SPEC.md Phase 6):
1. Geneformer V2 via ``ctheodoris/Geneformer`` + ``InSilicoPerturber``
2. If V2 tokenization fails → retry with Geneformer V1
3. If both fail → skip writing the file; Tab 2 ships in pathway-only
   mode with a banner explaining the absence

Usage on Colab:

    !pip install geneformer anndata scanpy cellxgene-census
    !git clone https://github.com/VUzan-bio/glycoquant
    %cd glycoquant
    !python scripts/generate_geneformer_priors.py

This script is network-dependent (HuggingFace + cellxgene-census) and
GPU-dependent (1.5B-param transformer). It is NOT imported at runtime
by the Streamlit app — only ``glycoquant.predictor.prior_loader`` reads
the committed JSON.
"""
from __future__ import annotations

import json
import sys
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_REPO_ROOT = Path(__file__).resolve().parents[1]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from glycoquant.predictor.mechano_signature import (  # noqa: E402
    get_glycocalyx_genes,
    get_mechano_signature,
)

OUTPUT_DIR = _REPO_ROOT / "data" / "priors"
OUTPUT_PATH = OUTPUT_DIR / "geneformer_ranks.json"

# Reference scRNA-seq dataset for tokenization. Tabula Sapiens
# fibroblast subset is a good default — adjust on Colab if you
# already have AnnData in memory.
REFERENCE_DATASET = "tabula_sapiens_fibroblast"
N_REFERENCE_CELLS = 5000


def _run_geneformer_v2(
    glycocalyx_genes: list[str],
    mechano_genes: list[str],
) -> dict[str, Any] | None:
    """Attempt Geneformer V2 in silico perturbation. Returns None on failure."""
    try:
        import scanpy as sc  # noqa: F401
        from geneformer import InSilicoPerturber  # noqa: F401
    except ImportError as exc:
        print(f"[geneformer] V2 import failed: {exc}", file=sys.stderr)
        return None

    try:
        # High-level sketch of the expected InSilicoPerturber workflow.
        # Fill in the concrete calls on Colab against the current
        # Geneformer API — the package has evolved across releases.
        print("[geneformer] loading reference fibroblast dataset ...")
        # adata = load_tabula_sapiens_fibroblast(N_REFERENCE_CELLS)
        # isp = InSilicoPerturber(model_version="V2", ...)
        # results = isp.perturb_genes(adata, glycocalyx_genes, target_genes=mechano_genes)

        # The following is a stub that should be replaced by the real
        # Colab pipeline; it returns None so the fallback ladder
        # advances to V1.
        print(
            "[geneformer] V2 InSilicoPerturber stub — implement against "
            "the current Geneformer API on Colab"
        )
        return None
    except Exception:  # noqa: BLE001 - we intentionally catch everything
        traceback.print_exc()
        return None


def _run_geneformer_v1(
    glycocalyx_genes: list[str],
    mechano_genes: list[str],
) -> dict[str, Any] | None:
    """Fallback to Geneformer V1 if V2 tokenization blew up."""
    try:
        from geneformer import TranscriptomeTokenizer  # noqa: F401
    except ImportError as exc:
        print(f"[geneformer] V1 import failed: {exc}", file=sys.stderr)
        return None
    print("[geneformer] V1 fallback stub — implement on Colab")
    return None


def _assemble_payload(
    gene_shifts: dict[str, dict[str, float]],
    glycocalyx_genes: list[str],
    mechano_genes: list[str],
    model_version: str,
) -> dict[str, Any]:
    """Sort, rank, and format the Geneformer results for JSON output."""
    import numpy as np

    scores: dict[str, float] = {}
    for gene in glycocalyx_genes:
        per_target = gene_shifts.get(gene, {})
        values = [float(per_target.get(m, 0.0)) for m in mechano_genes]
        scores[gene] = float(np.median(values)) if values else 0.0

    ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
    ranks = {gene: i + 1 for i, (gene, _) in enumerate(ranked)}

    genes_payload: dict[str, Any] = {}
    for gene in glycocalyx_genes:
        per_target = {
            m: float(gene_shifts.get(gene, {}).get(m, 0.0)) for m in mechano_genes
        }
        genes_payload[gene] = {
            "rank": ranks[gene],
            "score": scores[gene],
            "median_cosine_shift": scores[gene],
            "per_mechano_gene": per_target,
        }

    return {
        "metadata": {
            "model": "ctheodoris/Geneformer",
            "version": model_version,
            "dataset": REFERENCE_DATASET,
            "n_cells": N_REFERENCE_CELLS,
            "aggregation": "median_cosine_shift",
            "generated_utc": datetime.now(tz=timezone.utc).isoformat(),
        },
        "genes": genes_payload,
    }


def main() -> int:
    glycocalyx_genes = get_glycocalyx_genes()
    mechano_genes = get_mechano_signature()

    print(
        f"[geneformer] target panels: {len(glycocalyx_genes)} glycocalyx, "
        f"{len(mechano_genes)} mechano"
    )

    # Try V2, then V1, then give up.
    results = _run_geneformer_v2(glycocalyx_genes, mechano_genes)
    model_version = "V2"
    if results is None:
        print("[geneformer] V2 path returned None — trying V1")
        results = _run_geneformer_v1(glycocalyx_genes, mechano_genes)
        model_version = "V1"

    if results is None:
        print(
            "[geneformer] Both V2 and V1 failed; skipping JSON write. "
            "Tab 2 will ship in pathway-only mode with a banner.",
            file=sys.stderr,
        )
        return 2

    payload = _assemble_payload(
        results, glycocalyx_genes, mechano_genes, model_version
    )
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"[geneformer] wrote {OUTPUT_PATH.relative_to(_REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
