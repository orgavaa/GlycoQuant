"""Gene panel constants loaded from ``configs/default.yaml``.

Tab 2 and the offline prior-generation scripts all consume the same
three panels via this module so they can never drift:

- ``glycocalyx_genes``: 22 perturbation targets (SDC1..4, GPC1/3/4/6,
  EXT1/2, NDST1/2, HPSE, GFPT1/2, OGT, MGAT5, B4GALT1, HAS1/2/3, CD44)
- ``mechano_signature``: 15 mechanotransduction readout genes across
  the YAP/TAZ, Rho/ROCK, integrin/FA, and mechanosensor axes
- ``metabolic_inhibitors``: 5 drug → target → pathway mappings
  (2-DG, DON, tunicamycin, benzyl-GalNAc, PUGNAc)
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

_CONFIG_PATH = Path(__file__).resolve().parents[2] / "configs" / "default.yaml"

EXPECTED_GLYCOCALYX_COUNT = 22
EXPECTED_MECHANO_COUNT = 15
EXPECTED_METABOLIC_COUNT = 5


@lru_cache(maxsize=1)
def _load_predictor_config() -> dict[str, Any]:
    """Load the ``predictor:`` block of ``default.yaml`` once per process."""
    with _CONFIG_PATH.open("r", encoding="utf-8") as fh:
        data = yaml.safe_load(fh)
    return data["predictor"]


def get_glycocalyx_genes() -> list[str]:
    """Return the 22 glycocalyx perturbation targets."""
    return list(_load_predictor_config()["glycocalyx_genes"])


def get_mechano_signature() -> list[str]:
    """Return the 15-gene mechanotransduction readout signature."""
    return list(_load_predictor_config()["mechano_signature"])


def get_metabolic_inhibitors() -> dict[str, dict[str, str]]:
    """Return the 5 metabolic inhibitor → target → pathway mapping."""
    return {
        name: dict(entry)
        for name, entry in _load_predictor_config()["metabolic_inhibitors"].items()
    }


def validate_gene_panels() -> None:
    """Assert each panel is the expected size; raise ``ValueError`` on drift.

    Called at Tab 2 render time to fail fast if the config has been
    edited without updating the downstream code.
    """
    gc = get_glycocalyx_genes()
    ms = get_mechano_signature()
    mi = get_metabolic_inhibitors()

    if len(gc) != EXPECTED_GLYCOCALYX_COUNT:
        raise ValueError(
            f"expected {EXPECTED_GLYCOCALYX_COUNT} glycocalyx genes, got {len(gc)}"
        )
    if len(ms) != EXPECTED_MECHANO_COUNT:
        raise ValueError(
            f"expected {EXPECTED_MECHANO_COUNT} mechano signature genes, got {len(ms)}"
        )
    if len(mi) != EXPECTED_METABOLIC_COUNT:
        raise ValueError(
            f"expected {EXPECTED_METABOLIC_COUNT} metabolic inhibitors, got {len(mi)}"
        )
