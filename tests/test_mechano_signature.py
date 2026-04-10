"""Tests for glycoquant.predictor.mechano_signature."""
from __future__ import annotations

from glycoquant.predictor import (
    EXPECTED_GLYCOCALYX_COUNT,
    EXPECTED_MECHANO_COUNT,
    EXPECTED_METABOLIC_COUNT,
    get_glycocalyx_genes,
    get_mechano_signature,
    get_metabolic_inhibitors,
    validate_gene_panels,
)


def test_glycocalyx_panel_has_expected_size() -> None:
    genes = get_glycocalyx_genes()
    assert len(genes) == EXPECTED_GLYCOCALYX_COUNT
    assert all(isinstance(g, str) for g in genes)
    assert len(set(genes)) == len(genes), "duplicates in glycocalyx panel"


def test_mechano_signature_has_expected_size() -> None:
    genes = get_mechano_signature()
    assert len(genes) == EXPECTED_MECHANO_COUNT
    assert len(set(genes)) == len(genes)


def test_metabolic_inhibitors_have_expected_size() -> None:
    inhibitors = get_metabolic_inhibitors()
    assert len(inhibitors) == EXPECTED_METABOLIC_COUNT
    for name, entry in inhibitors.items():
        assert "target" in entry
        assert "pathway" in entry
        assert isinstance(name, str)


def test_validate_gene_panels_passes_on_current_config() -> None:
    validate_gene_panels()  # must not raise


def test_key_glycocalyx_genes_present() -> None:
    """A handful of canonical genes from the project's statement must be in the panel."""
    genes = set(get_glycocalyx_genes())
    for expected in ("SDC1", "SDC4", "EXT1", "HPSE", "GFPT1", "CD44"):
        assert expected in genes, f"{expected} missing from glycocalyx panel"


def test_key_mechano_signature_genes_present() -> None:
    """YAP1 / RHOA / PIEZO1 must be in the mechano signature."""
    genes = set(get_mechano_signature())
    for expected in ("YAP1", "WWTR1", "RHOA", "ROCK1", "ITGB1", "PTK2", "PIEZO1"):
        assert expected in genes, f"{expected} missing from mechano signature"


def test_metabolic_inhibitors_include_canonical_set() -> None:
    inhibitors = get_metabolic_inhibitors()
    assert "2-DG" in inhibitors
    assert "tunicamycin" in inhibitors


def test_mechano_signature_is_cached() -> None:
    """Second call returns the same list (lru_cache hit)."""
    a = get_mechano_signature()
    b = get_mechano_signature()
    assert a == b
