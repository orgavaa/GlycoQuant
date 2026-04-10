"""Tests for glycoquant.predictor.prior_loader."""
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
import pytest

from glycoquant.predictor import (
    GeneRanking,
    PriorTable,
    build_ranking_dataframe,
    compute_divergence,
    load_prior,
)

# ---------------------------------------------------------------------------
# Synthetic prior JSON fixtures
# ---------------------------------------------------------------------------


def _write_synthetic_pathway_json(path: Path) -> None:
    payload = {
        "metadata": {
            "source": "STRING v12",
            "confidence_threshold": 0.7,
            "aggregation": "median_inverse_shortest_path",
        },
        "genes": {
            "SDC1": {
                "rank": 1,
                "score": 0.92,
                "per_mechano_gene": {
                    "YAP1": {"distance": 2.1, "inverse": 0.32, "path": ["SDC1", "ITGB1", "YAP1"]},
                    "RHOA": {"distance": 3.0, "inverse": 0.25, "path": []},
                },
            },
            "SDC4": {
                "rank": 2,
                "score": 0.88,
                "per_mechano_gene": {
                    "YAP1": {"distance": 2.5, "inverse": 0.28, "path": []},
                },
            },
            "EXT1": {
                "rank": 3,
                "score": 0.71,
                "per_mechano_gene": {},
            },
        },
    }
    path.write_text(json.dumps(payload, indent=2))


def _write_synthetic_geneformer_json(path: Path) -> None:
    payload = {
        "metadata": {
            "model": "ctheodoris/Geneformer",
            "version": "V2",
            "generated_utc": "2026-04-10T12:00:00+00:00",
        },
        "genes": {
            "SDC1": {
                "rank": 3,  # disagrees with pathway rank 1 → divergence 2
                "score": 0.71,
                "median_cosine_shift": 0.71,
                "per_mechano_gene": {"YAP1": 0.18, "RHOA": 0.12},
            },
            "SDC4": {
                "rank": 2,  # same as pathway → divergence 0
                "score": 0.83,
                "median_cosine_shift": 0.83,
                "per_mechano_gene": {"YAP1": 0.21},
            },
            "EXT1": {
                "rank": 1,  # disagrees with pathway rank 3 → divergence 2
                "score": 0.95,
                "median_cosine_shift": 0.95,
                "per_mechano_gene": {},
            },
        },
    }
    path.write_text(json.dumps(payload, indent=2))


# ---------------------------------------------------------------------------
# load_prior
# ---------------------------------------------------------------------------


def test_load_pathway_prior(tmp_path: Path) -> None:
    path = tmp_path / "pathway.json"
    _write_synthetic_pathway_json(path)

    table = load_prior(path, source="pathway")
    assert isinstance(table, PriorTable)
    assert table.available is True
    assert table.source == "pathway"
    assert set(table.rankings.keys()) == {"SDC1", "SDC4", "EXT1"}
    sdc1 = table.rankings["SDC1"]
    assert isinstance(sdc1, GeneRanking)
    assert sdc1.rank == 1
    assert sdc1.score == pytest.approx(0.92)
    # per_mechano values come from the "inverse" field in the nested dict
    assert sdc1.per_mechano["YAP1"] == pytest.approx(0.32)


def test_load_geneformer_prior(tmp_path: Path) -> None:
    path = tmp_path / "geneformer.json"
    _write_synthetic_geneformer_json(path)

    table = load_prior(path, source="geneformer")
    assert table.available is True
    assert table.metadata["version"] == "V2"
    sdc1 = table.rankings["SDC1"]
    assert sdc1.rank == 3
    assert sdc1.score == pytest.approx(0.71)
    # Geneformer per-mechano is a flat float dict, not the nested pathway format
    assert sdc1.per_mechano["YAP1"] == pytest.approx(0.18)


def test_load_missing_file_returns_unavailable(tmp_path: Path) -> None:
    table = load_prior(tmp_path / "does_not_exist.json", source="geneformer")
    assert table.available is False
    assert table.rankings == {}
    assert table.metadata == {}
    assert table.source == "geneformer"


# ---------------------------------------------------------------------------
# compute_divergence
# ---------------------------------------------------------------------------


def test_compute_divergence_basic(tmp_path: Path) -> None:
    p_path = tmp_path / "p.json"
    g_path = tmp_path / "g.json"
    _write_synthetic_pathway_json(p_path)
    _write_synthetic_geneformer_json(g_path)

    pathway = load_prior(p_path, source="pathway")
    geneformer = load_prior(g_path, source="geneformer")

    divergence = compute_divergence(geneformer, pathway)
    # SDC1: |3 - 1| = 2
    # SDC4: |2 - 2| = 0
    # EXT1: |1 - 3| = 2
    assert divergence == {"SDC1": 2, "SDC4": 0, "EXT1": 2}


def test_compute_divergence_empty_when_geneformer_unavailable(
    tmp_path: Path,
) -> None:
    p_path = tmp_path / "p.json"
    _write_synthetic_pathway_json(p_path)
    pathway = load_prior(p_path, source="pathway")
    geneformer = load_prior(tmp_path / "missing.json", source="geneformer")

    assert compute_divergence(geneformer, pathway) == {}


def test_compute_divergence_ignores_genes_absent_from_one_side(
    tmp_path: Path,
) -> None:
    p_path = tmp_path / "p.json"
    _write_synthetic_pathway_json(p_path)
    pathway = load_prior(p_path, source="pathway")

    # Construct a geneformer prior with only SDC1 (missing SDC4 and EXT1)
    g_path = tmp_path / "g.json"
    g_path.write_text(
        json.dumps(
            {
                "metadata": {},
                "genes": {
                    "SDC1": {
                        "rank": 5,
                        "score": 0.5,
                        "per_mechano_gene": {},
                    }
                },
            }
        )
    )
    geneformer = load_prior(g_path, source="geneformer")
    divergence = compute_divergence(geneformer, pathway)
    assert divergence == {"SDC1": 4}


# ---------------------------------------------------------------------------
# build_ranking_dataframe
# ---------------------------------------------------------------------------


def test_build_ranking_dataframe_full(tmp_path: Path) -> None:
    p_path = tmp_path / "p.json"
    g_path = tmp_path / "g.json"
    _write_synthetic_pathway_json(p_path)
    _write_synthetic_geneformer_json(g_path)

    pathway = load_prior(p_path, source="pathway")
    geneformer = load_prior(g_path, source="geneformer")

    df = build_ranking_dataframe(geneformer, pathway)
    assert isinstance(df, pd.DataFrame)
    assert set(df.columns) == {
        "gene",
        "geneformer_rank",
        "geneformer_score",
        "pathway_rank",
        "pathway_score",
        "abs_rank_divergence",
    }
    assert len(df) == 3
    assert set(df["gene"]) == {"SDC1", "SDC4", "EXT1"}

    sdc1_row = df[df["gene"] == "SDC1"].iloc[0]
    assert int(sdc1_row["geneformer_rank"]) == 3
    assert int(sdc1_row["pathway_rank"]) == 1
    assert int(sdc1_row["abs_rank_divergence"]) == 2


def test_build_ranking_dataframe_pathway_only(tmp_path: Path) -> None:
    """When Geneformer is missing, the dataframe has NaN in those columns."""
    p_path = tmp_path / "p.json"
    _write_synthetic_pathway_json(p_path)
    pathway = load_prior(p_path, source="pathway")
    geneformer = load_prior(tmp_path / "missing.json", source="geneformer")

    df = build_ranking_dataframe(geneformer, pathway)
    assert len(df) == 3
    assert df["geneformer_rank"].isna().all()
    assert df["geneformer_score"].isna().all()
    assert df["pathway_rank"].notna().all()
    assert df["abs_rank_divergence"].isna().all()
