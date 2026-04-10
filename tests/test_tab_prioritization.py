"""Tests for glycoquant.app.tab_prioritization."""
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
import plotly.graph_objects as go
import pytest

from glycoquant.app.tab_prioritization import (
    build_drill_down_heatmap,
    build_pathway_evidence_lines,
    format_ranking_table,
)
from glycoquant.predictor import (
    build_ranking_dataframe,
    load_prior,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _write_pathway_json(path: Path) -> None:
    payload = {
        "metadata": {
            "source": "STRING v12",
            "confidence_threshold": 0.7,
        },
        "genes": {
            "SDC1": {
                "rank": 1,
                "score": 0.92,
                "per_mechano_gene": {
                    "YAP1": {"distance": 2.1, "inverse": 0.32, "path": ["SDC1", "ITGB1", "YAP1"]},
                    "RHOA": {"distance": 3.0, "inverse": 0.25, "path": ["SDC1", "ITGB1", "RHOA"]},
                },
            },
            "SDC4": {
                "rank": 2,
                "score": 0.88,
                "per_mechano_gene": {
                    "YAP1": {"distance": 2.5, "inverse": 0.28, "path": []},
                    "RHOA": {"distance": 2.8, "inverse": 0.26, "path": []},
                },
            },
            "EXT1": {
                "rank": 3,
                "score": 0.71,
                "per_mechano_gene": {
                    "YAP1": {"distance": 4.0, "inverse": 0.20, "path": []},
                    "RHOA": {"distance": 4.5, "inverse": 0.18, "path": []},
                },
            },
        },
    }
    path.write_text(json.dumps(payload))


def _write_geneformer_json(path: Path) -> None:
    payload = {
        "metadata": {
            "model": "ctheodoris/Geneformer",
            "version": "V2",
        },
        "genes": {
            "SDC1": {
                "rank": 3,
                "score": 0.71,
                "median_cosine_shift": 0.71,
                "per_mechano_gene": {"YAP1": 0.18, "RHOA": 0.12},
            },
            "SDC4": {
                "rank": 2,
                "score": 0.83,
                "median_cosine_shift": 0.83,
                "per_mechano_gene": {"YAP1": 0.21, "RHOA": 0.19},
            },
            "EXT1": {
                "rank": 1,
                "score": 0.95,
                "median_cosine_shift": 0.95,
                "per_mechano_gene": {"YAP1": 0.30, "RHOA": 0.25},
            },
        },
    }
    path.write_text(json.dumps(payload))


@pytest.fixture
def priors_pair(tmp_path: Path):
    pathway_path = tmp_path / "pathway.json"
    geneformer_path = tmp_path / "geneformer.json"
    _write_pathway_json(pathway_path)
    _write_geneformer_json(geneformer_path)
    pathway = load_prior(pathway_path, source="pathway")
    geneformer = load_prior(geneformer_path, source="geneformer")
    return geneformer, pathway


@pytest.fixture
def pathway_only(tmp_path: Path):
    pathway_path = tmp_path / "pathway.json"
    _write_pathway_json(pathway_path)
    pathway = load_prior(pathway_path, source="pathway")
    # Missing Geneformer file
    geneformer = load_prior(tmp_path / "missing.json", source="geneformer")
    return geneformer, pathway


# ---------------------------------------------------------------------------
# format_ranking_table
# ---------------------------------------------------------------------------


def test_format_ranking_table_full_has_six_columns(priors_pair) -> None:
    geneformer, pathway = priors_pair
    df = build_ranking_dataframe(geneformer, pathway)
    display = format_ranking_table(df, geneformer_available=True)
    assert list(display.columns) == [
        "Gene",
        "Geneformer rank",
        "Geneformer score",
        "Pathway rank",
        "Pathway score",
        "|ΔRank|",
    ]


def test_format_ranking_table_pathway_only_drops_geneformer_cols(
    pathway_only,
) -> None:
    geneformer, pathway = pathway_only
    df = build_ranking_dataframe(geneformer, pathway)
    display = format_ranking_table(df, geneformer_available=False)
    assert "Geneformer rank" not in display.columns
    assert "Geneformer score" not in display.columns
    assert "|ΔRank|" not in display.columns
    assert "Pathway rank" in display.columns
    assert "Gene" in display.columns


def test_format_ranking_table_sorted_by_pathway_rank(priors_pair) -> None:
    geneformer, pathway = priors_pair
    df = build_ranking_dataframe(geneformer, pathway)
    display = format_ranking_table(df, geneformer_available=True)
    pathway_ranks = display["Pathway rank"].tolist()
    assert pathway_ranks == sorted(pathway_ranks)


def test_format_ranking_table_scores_rounded(priors_pair) -> None:
    geneformer, pathway = priors_pair
    df = build_ranking_dataframe(geneformer, pathway)
    display = format_ranking_table(df, geneformer_available=True)
    # All score values should be 3 decimals or fewer
    for col in ("Pathway score", "Geneformer score"):
        for val in display[col]:
            if pd.notna(val):
                assert abs(val - round(val, 3)) < 1e-9


# ---------------------------------------------------------------------------
# build_drill_down_heatmap
# ---------------------------------------------------------------------------


def test_drill_down_heatmap_returns_plotly_with_two_rows(priors_pair) -> None:
    geneformer, pathway = priors_pair
    fig = build_drill_down_heatmap(
        "SDC1", geneformer, pathway, mechano_genes=["YAP1", "RHOA"]
    )
    assert isinstance(fig, go.Figure)
    assert fig.data[0].type == "heatmap"
    assert list(fig.data[0].y) == ["Geneformer", "Pathway"]
    assert list(fig.data[0].x) == ["YAP1", "RHOA"]


def test_drill_down_heatmap_handles_missing_gene(priors_pair) -> None:
    """A gene not in either prior should produce an all-zero heatmap."""
    geneformer, pathway = priors_pair
    fig = build_drill_down_heatmap(
        "NONEXISTENT", geneformer, pathway, mechano_genes=["YAP1", "RHOA"]
    )
    z = fig.data[0].z
    assert all(cell == 0.0 for row in z for cell in row)


def test_drill_down_heatmap_pathway_only_still_renders(pathway_only) -> None:
    geneformer, pathway = pathway_only
    fig = build_drill_down_heatmap(
        "SDC1", geneformer, pathway, mechano_genes=["YAP1", "RHOA"]
    )
    assert isinstance(fig, go.Figure)
    # Geneformer row should be all zeros
    z = fig.data[0].z
    assert all(v == 0.0 for v in z[0])
    # Pathway row has real values
    assert any(v != 0.0 for v in z[1])


# ---------------------------------------------------------------------------
# build_pathway_evidence_lines
# ---------------------------------------------------------------------------


def test_evidence_lines_include_path_and_edges() -> None:
    evidence = {
        "SDC1": {
            "YAP1": {
                "distance": 2.1,
                "path": ["SDC1", "ITGB1", "YAP1"],
                "path_edges": [
                    {"from": "SDC1", "to": "ITGB1", "confidence": 0.92},
                    {"from": "ITGB1", "to": "YAP1", "confidence": 0.84},
                ],
            }
        }
    }
    lines = build_pathway_evidence_lines("SDC1", "YAP1", evidence)
    joined = "\n".join(lines)
    assert "SDC1 → ITGB1 → YAP1" in joined
    assert "0.920" in joined or "0.92" in joined
    assert "0.840" in joined or "0.84" in joined


def test_evidence_lines_missing_pair_returns_fallback() -> None:
    evidence = {"SDC1": {}}
    lines = build_pathway_evidence_lines("SDC1", "YAP1", evidence)
    assert any("No pathway evidence" in line for line in lines)


def test_evidence_lines_unreachable_pair() -> None:
    evidence = {
        "SDC1": {
            "YAP1": {
                "distance": None,
                "path": [],
                "path_edges": [],
            }
        }
    }
    lines = build_pathway_evidence_lines("SDC1", "YAP1", evidence)
    assert any("unreachable" in line for line in lines)


# ---------------------------------------------------------------------------
# Streamlit app-level smoke test (AppTest)
# ---------------------------------------------------------------------------


def _apptest_available() -> bool:
    try:
        from streamlit.testing.v1 import AppTest  # noqa: F401
    except ImportError:
        return False
    return True


@pytest.mark.skipif(
    not _apptest_available(),
    reason="streamlit.testing.v1.AppTest not importable",
)
def test_main_app_still_boots_with_tab2_wired() -> None:
    """After wiring Tab 2, main.py should still boot via AppTest."""
    from streamlit.testing.v1 import AppTest

    main_path = Path(__file__).resolve().parents[1] / "glycoquant" / "app" / "main.py"
    at = AppTest.from_file(str(main_path), default_timeout=60)
    at.run()
    assert not at.exception, f"App raised: {[str(e) for e in at.exception]}"
