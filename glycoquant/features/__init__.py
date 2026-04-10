"""Per-cell feature extractors for GlycoQuant.

Each extractor takes raw channel arrays plus a labeled cell mask and
returns a flat ``dict[str, float | list[float]]`` per cell. The
assembler in ``glycoquant.profiles`` concatenates these into a
per-cell DataFrame.
"""

from glycoquant.features.glycocalyx import (
    GlycocalyxParams,
    extract_glycocalyx_features,
)

__all__ = [
    "GlycocalyxParams",
    "extract_glycocalyx_features",
]
