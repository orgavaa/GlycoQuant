"""Per-cell feature extractors for GlycoQuant.

Each extractor takes raw channel arrays plus a labeled cell mask and
returns a flat ``dict[str, float | list[float]]`` per cell. The
assembler in ``glycoquant.profiles`` concatenates these into a
per-cell DataFrame.
"""

from glycoquant.features.actin import ActinParams, extract_actin_features
from glycoquant.features.deep_embedding import (
    DinoV2Embedder,
    DinoV2Params,
    build_cell_crop,
)
from glycoquant.features.focal_adhesions import (
    FocalAdhesionParams,
    extract_fa_features,
)
from glycoquant.features.glycocalyx import (
    GlycocalyxParams,
    extract_glycocalyx_features,
)
from glycoquant.features.morphology import extract_morphology_features
from glycoquant.features.yap import extract_yap_features

__all__ = [
    "ActinParams",
    "DinoV2Embedder",
    "DinoV2Params",
    "FocalAdhesionParams",
    "GlycocalyxParams",
    "build_cell_crop",
    "extract_actin_features",
    "extract_fa_features",
    "extract_glycocalyx_features",
    "extract_morphology_features",
    "extract_yap_features",
]
