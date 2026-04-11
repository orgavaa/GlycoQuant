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
    )
    .env(
        {
            "HF_HOME": f"{CACHE_MOUNT}/huggingface",
            "CELLPOSE_LOCAL_MODELS_PATH": f"{CACHE_MOUNT}/cellpose",
            "GLYCOQUANT_DEVICE": "cuda",
        }
    )
    # Bundle the local source tree so the Modal container can
    # ``import glycoquant`` and ``import backend`` exactly like Railway.
    .add_local_python_source("glycoquant", "backend")
)

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
        config=AssemblerConfig(include_deep_features=include_deep_features),
        dinov2_embedder=embedder,
    )
    features_df = assembler.process_image(
        channels, cell_mask=cell_mask, nuclear_mask=nuclear_mask
    )

    result = _build_result_payload(
        channels=channels,
        cell_mask=cell_mask,
        nuclear_mask=nuclear_mask,
        features_df=features_df,
        include_deep_features=include_deep_features,
    )
    # Pydantic v2 — prefer model_dump, fall back to dict() for v1.
    dump = getattr(result, "model_dump", None)
    return dump() if dump else result.dict()  # type: ignore[return-value]
