"""Shared biology metadata for the perturbation-prior ranking.

The ranking tab is a hypothesis-prior view over an undirected STRING
functional-association graph. Keep display aliases, biological layers,
gene classes, and semantic colors in one place so backend figures and
frontend labels do not drift.
"""
from __future__ import annotations

import math
from typing import Any


SEMANTIC_COLORS: dict[str, str] = {
    # Monochromatic grey + blue palette aligned with the rest of the UI.
    # Gene classes step through slate; signature layers step through blue;
    # query is near-black so it always reads as the focal node.
    "query": "#111827",                                       # gray-900
    "HA/CD44 axis": "#475569",                                # slate-600
    "HSPG core proteins": "#64748b",                          # slate-500
    "HS biosynthesis/remodeling": "#94a3b8",                  # slate-400
    "N/O-glycosylation and HBP/O-GlcNAc": "#cbd5e1",          # slate-300
    "intermediate": "#cbd5e1",                                # slate-300
    "Mechanosensitive transcriptional effectors": "#1e3a8a",  # blue-900
    "YAP/TAZ-response genes": "#1d4ed8",                      # blue-700
    "Actomyosin tension": "#3b82f6",                          # blue-500
    "Adhesion clutch": "#60a5fa",                             # blue-400
    "Mechanosensitive ion channel": "#93c5fd",                # blue-300
    "unreachable": "#e5e7eb",                                 # gray-200
}

SIGNATURE_LAYERS: list[dict[str, Any]] = [
    {
        "id": "effectors",
        "label": "Mechanosensitive transcriptional effectors",
        "short_label": "Effectors",
        "genes": ["YAP1", "WWTR1"],
        "color": SEMANTIC_COLORS["Mechanosensitive transcriptional effectors"],
    },
    {
        "id": "response",
        "label": "YAP/TAZ-response genes",
        "short_label": "Response",
        "genes": ["CTGF", "CYR61", "ANKRD1"],
        "color": SEMANTIC_COLORS["YAP/TAZ-response genes"],
    },
    {
        "id": "actomyosin",
        "label": "Actomyosin tension",
        "short_label": "Actomyosin",
        "genes": ["RHOA", "ROCK1", "ROCK2", "MYL9"],
        "color": SEMANTIC_COLORS["Actomyosin tension"],
    },
    {
        "id": "adhesion",
        "label": "Adhesion clutch",
        "short_label": "Adhesion",
        "genes": ["ITGB1", "PTK2", "VCL", "PXN", "TLN1"],
        "color": SEMANTIC_COLORS["Adhesion clutch"],
    },
    {
        "id": "ion_channel",
        "label": "Mechanosensitive ion channel",
        "short_label": "Ion channel",
        "genes": ["PIEZO1"],
        "color": SEMANTIC_COLORS["Mechanosensitive ion channel"],
    },
]

TARGET_ALIASES: dict[str, str] = {
    "YAP1": "YAP1",
    "WWTR1": "WWTR1/TAZ",
    "TAZ": "WWTR1/TAZ",
    "CTGF": "CCN2/CTGF",
    "CCN2": "CCN2/CTGF",
    "CYR61": "CYR61/CCN1",
    "CCN1": "CYR61/CCN1",
    "ANKRD1": "ANKRD1",
    "RHOA": "RHOA",
    "ROCK1": "ROCK1",
    "ROCK2": "ROCK2",
    "MYL9": "MYL9",
    "ITGB1": "ITGB1",
    "PTK2": "PTK2/FAK",
    "FAK": "PTK2/FAK",
    "VCL": "VCL",
    "PXN": "PXN",
    "TLN1": "TLN1",
    "PIEZO1": "PIEZO1",
}

GENE_CLASS_MEMBERS: dict[str, list[str]] = {
    "HA/CD44 axis": ["CD44", "HAS1", "HAS2", "HAS3"],
    "HSPG core proteins": ["SDC1", "SDC2", "SDC3", "SDC4", "GPC1", "GPC3", "GPC4", "GPC6"],
    "HS biosynthesis/remodeling": ["EXT1", "EXT2", "NDST1", "NDST2", "HPSE"],
    "N/O-glycosylation and HBP/O-GlcNAc": ["MGAT5", "B4GALT1", "GFPT1", "GFPT2", "OGT"],
}

GENE_CLASS_LEGEND: list[dict[str, str]] = [
    {
        "label": label,
        "color": SEMANTIC_COLORS[label],
        "genes": ", ".join(genes),
    }
    for label, genes in GENE_CLASS_MEMBERS.items()
]

TARGET_LAYER_BY_GENE: dict[str, dict[str, Any]] = {
    gene: layer for layer in SIGNATURE_LAYERS for gene in layer["genes"]
}
GENE_CLASS_BY_GENE: dict[str, str] = {
    gene: label for label, genes in GENE_CLASS_MEMBERS.items() for gene in genes
}


def target_alias(gene: str) -> str:
    """Return the display alias for a mechanosensitive-signature target."""
    return TARGET_ALIASES.get(gene, gene)


def target_layer_label(gene: str) -> str | None:
    """Return the signature-layer label for a canonical target symbol."""
    layer = TARGET_LAYER_BY_GENE.get(gene)
    if layer is None:
        return None
    return str(layer["label"])


def gene_class_label(gene: str) -> str:
    """Return the biological perturbation class for a ranking gene."""
    return GENE_CLASS_BY_GENE.get(gene, "Other")


def semantic_color(label: str, fallback: str = "#64748b") -> str:
    return SEMANTIC_COLORS.get(label, fallback)


def target_metadata() -> dict[str, dict[str, Any]]:
    """Metadata keyed by canonical signature target symbol."""
    return {
        gene: {
            "gene": gene,
            "alias": target_alias(gene),
            "signature_layer": layer["label"],
            "signature_layer_id": layer["id"],
            "color": layer["color"],
        }
        for layer in SIGNATURE_LAYERS
        for gene in layer["genes"]
    }


def aliased_path(path: list[str]) -> list[str]:
    """Alias signature targets in a path while leaving intermediates unchanged."""
    return [target_alias(node) if node in TARGET_ALIASES else node for node in path]


def edge_cost_from_confidence(confidence: float | int | None) -> float | None:
    """Return STRING edge cost used by the shortest-path display.

    STRING confidence should be in (0, 1]. The lower clamp avoids
    ``log(0)`` for malformed or missing confidence values while keeping
    edge costs finite and auditable.
    """
    if confidence is None:
        return None
    try:
        conf = float(confidence)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(conf):
        return None
    conf = min(1.0, max(1e-6, conf))
    return -math.log(conf)
