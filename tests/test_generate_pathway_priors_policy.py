"""Policy tests for the committed pathway prior artefacts.

These are regression guards on the *contents* of
``data/priors/pathway_ranks.json`` and ``data/priors/pathway_evidence.json``
so that a future regenerator — whether a developer or CI — cannot
silently drift the documented policy from what is actually on disk.

The policy under test (see SCIENCE.md §10):

- STRING v12 at confidence threshold 0.40 (medium tier).
- Five curated literature edges overlaid with primary-literature DOIs.
- Every curated edge must carry ``source="curated"`` and a non-empty
  ``pubmed_doi`` in the evidence JSON.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

_REPO_ROOT = Path(__file__).resolve().parents[1]
RANKS_PATH = _REPO_ROOT / "data" / "priors" / "pathway_ranks.json"
EVIDENCE_PATH = _REPO_ROOT / "data" / "priors" / "pathway_evidence.json"


@pytest.fixture(scope="module")
def ranks_metadata() -> dict:
    if not RANKS_PATH.is_file():
        pytest.skip(
            f"{RANKS_PATH} not present — regenerate with "
            "`python scripts/generate_pathway_priors.py`."
        )
    return json.loads(RANKS_PATH.read_text(encoding="utf-8"))["metadata"]


@pytest.fixture(scope="module")
def evidence_blob() -> dict:
    if not EVIDENCE_PATH.is_file():
        pytest.skip(
            f"{EVIDENCE_PATH} not present — regenerate with "
            "`python scripts/generate_pathway_priors.py`."
        )
    return json.loads(EVIDENCE_PATH.read_text(encoding="utf-8"))


def test_string_confidence_threshold_is_policy_default(ranks_metadata: dict) -> None:
    """The committed artefact must record the 0.40 policy default.

    If someone regenerates with ``--confidence-threshold 700`` this test
    catches the drift and forces SCIENCE.md to be updated in the same
    commit.
    """
    assert ranks_metadata["string_confidence_threshold"] == pytest.approx(0.40)
    # Legacy alias must stay in sync
    assert ranks_metadata["confidence_threshold"] == pytest.approx(0.40)


def test_curated_edge_count_matches_policy(ranks_metadata: dict) -> None:
    """Five curated edges are declared and tracked in metadata."""
    assert ranks_metadata["curated_edge_count"] == 5
    overlaid = int(ranks_metadata["curated_edges_overlaid"])
    # Overlaid count is bounded by the total; STRING may already cover
    # one or two of them at a higher confidence, which is fine.
    assert 0 <= overlaid <= 5
    assert "curated_edge_policy" in ranks_metadata
    assert "curated" in ranks_metadata["curated_edge_policy"].lower()


def test_evidence_contains_traceable_curated_edges(evidence_blob: dict) -> None:
    """At least one curated edge must appear on a shortest path with full provenance."""
    n_curated_seen = 0
    for _gene, per_target in evidence_blob.items():
        for _target, detail in per_target.items():
            for edge in detail.get("path_edges", []):
                if edge.get("source") == "curated":
                    n_curated_seen += 1
                    # Curated edges carry primary-literature provenance
                    assert edge.get("pubmed_doi"), (
                        f"curated edge {edge['from']}→{edge['to']} missing pubmed_doi"
                    )
                    assert edge.get("reason"), (
                        f"curated edge {edge['from']}→{edge['to']} missing reason"
                    )
    assert n_curated_seen >= 1, (
        "No curated edge appeared on any shortest path. Either STRING v12 now "
        "covers the hexosamine axis at ≥0.5 confidence (worth documenting) or "
        "the curated overlay logic has regressed."
    )


def test_every_string_edge_has_source_tag(evidence_blob: dict) -> None:
    """Every edge in the evidence JSON carries a provenance tag."""
    for _gene, per_target in evidence_blob.items():
        for _target, detail in per_target.items():
            for edge in detail.get("path_edges", []):
                source = edge.get("source")
                assert source in {"string", "curated"}, (
                    f"edge {edge.get('from')}→{edge.get('to')} has unexpected "
                    f"source={source!r}"
                )
