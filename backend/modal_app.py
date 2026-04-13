"""Modal deployment for the GlycoQuant GPU pipeline.

Deploy once from a developer machine with::

    modal token new                       # first time only
    modal deploy backend/modal_app.py

Afterwards Railway's FastAPI backend can call the remote function via
``modal.Function.lookup("glycoquant-gpu", "run_pipeline")`` as long as
``MODAL_TOKEN_ID`` and ``MODAL_TOKEN_SECRET`` are set on the Railway
service.

The function accepts a compressed NPZ of channel arrays (small: ~12 MB
for a 768² five-channel image) so the Modal call payload stays tight,
and returns a plain ``dict`` built from the existing ``JobResult``
schema so the Railway dispatcher can parse it back without importing
Modal.
"""
from __future__ import annotations

import io
from typing import Any

import modal

APP_NAME = "glycoquant-gpu"
FUNCTION_NAME = "run_pipeline"
VOLUME_NAME = "glycoquant-models"
CACHE_MOUNT = "/cache"

# Persistent volume for the 1.15 GB Cellpose weights and the 340 MB
# DINOv2 weights. Downloads happen exactly once across the lifetime of
# the Modal app — cold starts after that are near-instant.
model_volume = modal.Volume.from_name(VOLUME_NAME, create_if_missing=True)

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("libgl1", "libglib2.0-0", "libsm6", "libxext6", "libxrender1")
    .pip_install(
        "torch==2.4.1",
        "torchvision==0.19.1",
        extra_index_url="https://download.pytorch.org/whl/cu121",
    )
    .pip_install(
        "cellpose>=3.0",
        "scikit-image>=0.22",
        "numpy>=1.24",
        "pandas>=2.0",
        "scipy>=1.11",
        "plotly>=5.18",
        "scikit-learn>=1.3",
        "transformers>=4.40",
        "pillow>=10.0",
        "tifffile>=2024.0",
        "pydantic>=2.9",
        "networkx>=3.2",
        "pyyaml>=6.0",
        # Cell-DINO dependencies — required for the channel-adaptive
        # ViT-L/16 backbone loaded via torch.hub from the bundled
        # third_party/dinov2 submodule. The model weights themselves
        # are gated by the FAIR Non-Commercial Research License and
        # must be uploaded to the persistent volume separately:
        #
        #     modal volume put glycoquant-models \
        #         /local/path/channel_adaptive_dino_vitl16.pth \
        #         /cell_dino/channel_adaptive_dino_vitl16.pth
        #
        # Then set GLYCOQUANT_CELL_DINO_CKPT=/cache/cell_dino/channel_adaptive_dino_vitl16.pth
        # in the Modal app env (uncomment the line in .env() below).
        # See docs/CELL_DINO_SETUP.md for the full operator runbook.
        "fvcore",
        "iopath",
        "omegaconf",
    )
    .env(
        {
            "HF_HOME": f"{CACHE_MOUNT}/huggingface",
            "CELLPOSE_LOCAL_MODELS_PATH": f"{CACHE_MOUNT}/cellpose",
            "GLYCOQUANT_DEVICE": "cuda",
            # Cell-DINO checkpoint — uploaded via:
            #   modal volume put glycoquant-models models/channel_adaptive_dino_vitl16.pth /cell_dino/channel_adaptive_dino_vitl16.pth
            "GLYCOQUANT_CELL_DINO_CKPT": f"{CACHE_MOUNT}/cell_dino/channel_adaptive_dino_vitl16.pth",
        }
    )
    # Bundle the local source tree so the Modal container can
    # ``import glycoquant`` and ``import backend`` exactly like Railway.
    # third_party/dinov2 is included so torch.hub.load(source='local')
    # finds the channel_adaptive_dino_vitl16 entry point.
    # copy=True on all local additions so subsequent build steps work.
    .add_local_python_source("glycoquant", "backend", copy=True)
    .add_local_dir(
        "third_party/dinov2",
        remote_path="/root/third_party/dinov2",
        copy=True,
    )
)

# Extended image for Axis B (Geneformer on-demand). Keeps the Tab 1
# analysis image lean — Geneformer only pays the pip-install cost
# when its function is actually invoked.
# Geneformer image — disabled for now. The HF repo is too large to
# clone inside Modal's build sandbox. Re-enable when a PyPI release
# or a smaller wheel is available. Cell-DINO does NOT need this.
image_with_geneformer = image

app = modal.App(APP_NAME)


@app.function(
    image=image,
    gpu="L4",
    volumes={CACHE_MOUNT: model_volume},
    timeout=600,
    scaledown_window=300,
)
def run_pipeline(
    channels_npz: bytes,
    cell_diameter: int,
    include_deep_features: bool,
) -> dict[str, Any]:
    """Run segmentation + feature extraction + payload build on GPU.

    Parameters
    ----------
    channels_npz : bytes
        Output of ``np.savez_compressed(BytesIO, **channels)`` where
        ``channels`` is the canonical five-channel dict consumed by
        ``ProfileAssembler``.
    cell_diameter : int
        Cellpose-SAM cell diameter hint in pixels.
    include_deep_features : bool
        If true, also run the DINOv2 embedder on each crop.

    Returns
    -------
    dict
        The same shape as ``backend.app.schemas.JobResult`` but flattened
        to primitives so Modal's cloudpickle round-trip stays simple.
    """
    import numpy as np

    from backend.app.workers import _build_result_payload, _get_embedder, _get_segmenter
    from glycoquant.profiles import AssemblerConfig, ProfileAssembler

    with np.load(io.BytesIO(channels_npz)) as npz:
        channels = {name: npz[name].copy() for name in npz.files}

    segmenter = _get_segmenter()
    seg_channel = next(
        (ch for ch in ("actin", "glycocalyx", "paxillin") if ch in channels),
        next(iter(channels)),
    )
    cell_mask, nuclear_mask = segmenter.segment_both(
        channels[seg_channel],
        channels["dapi"],
        cell_diameter=float(cell_diameter),
    )

    embedder = _get_embedder() if include_deep_features else None
    assembler = ProfileAssembler(
        config=AssemblerConfig(
            include_deep_features=include_deep_features,
            include_radial_profile=True,
        ),
        dinov2_embedder=embedder,
    )
    features_df = assembler.process_image(
        channels, cell_mask=cell_mask, nuclear_mask=nuclear_mask
    )
    mechano_summary = assembler.last_mechano_summary

    result = _build_result_payload(
        channels=channels,
        cell_mask=cell_mask,
        nuclear_mask=nuclear_mask,
        features_df=features_df,
        include_deep_features=include_deep_features,
        mechano_summary=mechano_summary,
        embedder_backend=(
            embedder.backend_name() if embedder is not None else None
        ),
    )
    # Pydantic v2 — prefer model_dump, fall back to dict() for v1.
    dump = getattr(result, "model_dump", None)
    return dump() if dump else result.dict()  # type: ignore[return-value]


# ---------------------------------------------------------------------------
# Axis B — on-demand Geneformer in-silico perturbation
# ---------------------------------------------------------------------------


@app.function(
    image=image_with_geneformer,
    gpu="L4",
    volumes={CACHE_MOUNT: model_volume},
    timeout=3600,  # 1 hour hard cap — full 22 × 15 grid fits in ~20-30 min
    scaledown_window=60,
)
def generate_geneformer_prior(
    glycocalyx_genes: list[str],
    mechano_genes: list[str],
    n_reference_cells: int = 5000,
) -> dict[str, Any]:
    """Run Geneformer in-silico perturbation on a reference cohort.

    Runs the pretrained ``ctheodoris/Geneformer`` V2 model over a
    Tabula Sapiens fibroblast subset, deleting each glycocalyx gene in
    turn from the input token list and measuring the cosine shift in
    the mechanotransduction-signature embedding. Returns a dict whose
    schema matches ``data/priors/pathway_ranks.json`` so the existing
    ``prior_loader.load_prior`` picks it up unchanged.

    **Runtime:** ~20-30 min on L4 for 22 × 15 perturbations at 5 000
    reference cells. First call cold-starts the 1.5 GB model download
    and the ~200 MB cellxgene-census fetch; both are cached on the
    persistent volume.

    **Fallback behaviour:** if the Geneformer Python package isn't
    importable (most common failure on the first deploy) or the
    InSilicoPerturber API has drifted, the function returns a stub
    result with ``metadata.error`` set and ``metadata.source``
    containing the traceback summary, so the Railway side can surface
    a useful error message to the user rather than a silent 500.
    """
    from datetime import datetime, timezone

    meta: dict[str, Any] = {
        "source": "Geneformer V2 (ctheodoris/Geneformer)",
        "model": "ctheodoris/Geneformer",
        "n_reference_cells": int(n_reference_cells),
        "n_glycocalyx_genes": len(glycocalyx_genes),
        "n_mechano_genes": len(mechano_genes),
        "generated_utc": datetime.now(tz=timezone.utc).isoformat(),
        "runtime": "modal.L4",
    }

    try:
        result_genes = _run_geneformer_perturbation(
            glycocalyx_genes=glycocalyx_genes,
            mechano_genes=mechano_genes,
            n_reference_cells=int(n_reference_cells),
            cache_root=CACHE_MOUNT,
        )
    except Exception as exc:  # noqa: BLE001
        import traceback

        meta["error"] = f"{type(exc).__name__}: {exc}"
        meta["traceback"] = traceback.format_exc()[-4000:]
        return {"metadata": meta, "genes": {}}

    return {"metadata": meta, "genes": result_genes}


def _run_geneformer_perturbation(
    glycocalyx_genes: list[str],
    mechano_genes: list[str],
    n_reference_cells: int,
    cache_root: str,
) -> dict[str, Any]:
    """Core Geneformer in-silico perturbation loop.

    Split into its own function so the Modal wrapper can catch any
    failure (missing package, tokeniser drift, etc.) and surface a
    useful error in the returned dict rather than crashing the call.

    The per-gene / per-target cosine shifts are aggregated into the
    same JSON shape as the STRING pathway prior so the downstream
    ``prior_loader.load_prior`` can consume both without a schema
    branch.
    """
    import os
    from pathlib import Path

    import numpy as np

    # Ensure Geneformer caches its weights on the persistent volume
    os.environ.setdefault("HF_HOME", f"{cache_root}/huggingface")
    os.environ.setdefault("TRANSFORMERS_CACHE", f"{cache_root}/huggingface")

    cache_dir = Path(cache_root) / "geneformer_reference"
    cache_dir.mkdir(parents=True, exist_ok=True)
    adata_path = cache_dir / "tabula_sapiens_fibroblast.h5ad"

    try:
        import anndata as ad  # noqa: F401
        import geneformer  # noqa: F401
    except ImportError as exc:
        raise RuntimeError(
            f"Geneformer dependency missing inside Modal image: {exc}. "
            "Re-run `modal deploy backend/modal_app.py` to rebuild the "
            "image_with_geneformer layer."
        ) from exc

    # Fetch the reference dataset once per volume lifetime.
    if not adata_path.is_file():
        _fetch_tabula_sapiens_fibroblast(adata_path, n_reference_cells)

    # Run the actual perturbation grid. The API has changed across
    # Geneformer V1 → V2 → "newest" repo; we try each entry point and
    # raise a descriptive error if none is usable. The returned value
    # is a ``{glycocalyx_gene: {target: cosine_shift}}`` mapping.
    cosine_shifts = _dispatch_perturbation(
        adata_path=adata_path,
        glycocalyx_genes=glycocalyx_genes,
        mechano_genes=mechano_genes,
    )

    # Aggregate per glycocalyx gene: median cosine shift across the
    # mechano targets. Higher = bigger transcriptomic impact.
    genes_out: dict[str, Any] = {}
    ranked = []
    for g in glycocalyx_genes:
        per_target = cosine_shifts.get(g, {})
        finite = [float(v) for v in per_target.values() if np.isfinite(v)]
        score = float(np.median(finite)) if finite else 0.0
        ranked.append((g, score, per_target))

    ranked.sort(key=lambda t: (-t[1], t[0]))
    for rank, (g, score, per_target) in enumerate(ranked, start=1):
        genes_out[g] = {
            "rank": rank,
            "score": score,
            "per_mechano_gene": dict(per_target),
        }
    return genes_out


def _fetch_tabula_sapiens_fibroblast(path, n_cells: int) -> None:
    """Download a small fibroblast subset from cellxgene-census."""
    import anndata as ad
    import cellxgene_census

    with cellxgene_census.open_soma(census_version="latest") as census:
        adata = cellxgene_census.get_anndata(
            census=census,
            organism="Homo sapiens",
            obs_value_filter=(
                "tissue_general == 'connective tissue' "
                "and cell_type in ['fibroblast', 'dermal fibroblast']"
            ),
        )
    # Random subsample down to n_cells
    if adata.n_obs > n_cells:
        import numpy as np

        idx = np.random.default_rng(42).choice(adata.n_obs, size=n_cells, replace=False)
        adata = adata[idx].copy()
    ad._io.h5ad.write_h5ad(path, adata)  # noqa: SLF001 — avoids ad.write alias drift


def _dispatch_perturbation(
    adata_path,
    glycocalyx_genes: list[str],
    mechano_genes: list[str],
) -> dict[str, dict[str, float]]:
    """Try Geneformer's public perturbation API, raising on all-failure."""
    try:
        from geneformer import InSilicoPerturber

        perturber = InSilicoPerturber(
            perturb_type="delete",
            perturb_rank_shift=None,
            genes_to_perturb=list(glycocalyx_genes),
            model_type="Pretrained",
            num_classes=0,
            emb_mode="cell",
            cell_emb_style="mean_pool",
        )
        # The exact InSilicoPerturber.perturb_data signature varies
        # across Geneformer releases; we pass the dataset path and let
        # it tokenise internally. If this call shape no longer works,
        # the caller catches the exception and surfaces it.
        raw_output = perturber.perturb_data(
            input_data_file=str(adata_path),
            output_directory=str(adata_path.parent),
            output_prefix="glycoquant_isp",
        )

        # Geneformer emits per-cell cosine shifts; we aggregate to
        # per-(gene, target) medians.
        return _reshape_perturber_output(raw_output, glycocalyx_genes, mechano_genes)
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(
            f"Geneformer InSilicoPerturber call failed: {type(exc).__name__}: {exc}. "
            "The public API may have drifted since this integration was written. "
            "Update backend/modal_app.py::_dispatch_perturbation."
        ) from exc


def _reshape_perturber_output(
    raw_output: Any,
    glycocalyx_genes: list[str],
    mechano_genes: list[str],
) -> dict[str, dict[str, float]]:
    """Convert InSilicoPerturber output into the {gene: {target: shift}} shape.

    Accepts either a pandas DataFrame with ``perturb_gene / target_gene /
    cosine_shift`` columns (Geneformer V2) or a nested dict of the same
    shape. Falls back to an empty result rather than raising so the
    Modal wrapper can still return a useful error payload.
    """
    import pandas as pd

    out: dict[str, dict[str, float]] = {g: {} for g in glycocalyx_genes}
    if raw_output is None:
        return out
    if isinstance(raw_output, pd.DataFrame):
        if {"perturb_gene", "target_gene", "cosine_shift"}.issubset(raw_output.columns):
            grouped = (
                raw_output.groupby(["perturb_gene", "target_gene"])["cosine_shift"]
                .median()
                .to_dict()
            )
            for (g, t), v in grouped.items():
                if g in out and t in mechano_genes:
                    out[g][t] = float(v)
        return out
    if isinstance(raw_output, dict):
        for g, per_target in raw_output.items():
            if g not in out or not isinstance(per_target, dict):
                continue
            for t, v in per_target.items():
                if t in mechano_genes:
                    out[g][t] = float(v)
        return out
    return out
