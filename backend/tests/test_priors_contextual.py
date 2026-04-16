"""Integration tests for POST /priors/contextual (Axis A)."""
from __future__ import annotations

import json

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from backend.app.main import app


@pytest.fixture(scope="module")
def client() -> TestClient:
    return TestClient(app)


def _feature_df_json(**overrides) -> str:
    """Build a per-cell feature DataFrame JSON with sensible defaults."""
    df = pd.DataFrame(
        {
            "cell_id": [1.0, 2.0, 3.0, 4.0, 5.0],
            "yap_nc_ratio": [0.5, 0.6, 0.5, 0.55, 0.48],
            "yap_nuclear_fraction": [0.3, 0.4, 0.35, 0.32, 0.38],
            "fa_count": [90.0, 100.0, 95.0, 98.0, 110.0],
            "fa_mean_elongation": [1.9, 2.0, 1.95, 2.1, 1.85],
            "fa_peripheral_fraction": [0.3, 0.4, 0.35, 0.38, 0.42],
            "fa_mean_area": [24.0, 26.0, 22.0, 25.0, 28.0],
            "actin_stress_fiber_coherence": [0.52, 0.54, 0.51, 0.53, 0.55],
            "actin_cortical_ratio": [0.9, 1.1, 1.0, 0.95, 1.05],
            "nuclear_solidity": [0.95, 0.96, 0.94, 0.95, 0.96],
            "nuclear_to_cell_area_ratio": [0.18, 0.20, 0.19, 0.18, 0.21],
        }
    )
    for col, vals in overrides.items():
        df[col] = vals
    return df.to_json(orient="records")


def test_contextual_priors_happy_path(client: TestClient) -> None:
    resp = client.post(
        "/priors/contextual",
        json={
            "features_df_json": _feature_df_json(),
            "cell_count": 5,
            "dataset_label": "test",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["dynamic"] is True
    assert data["pathway_available"] is True
    assert data["mechano_weights"] is not None
    # All 15 mechano genes present in the weights
    assert len(data["mechano_weights"]) == 15
    # Weights sum to ~1
    assert abs(sum(data["mechano_weights"].values()) - 1.0) < 1e-6
    assert len(data["genes"]) == 22
    assert data["used_fallback_reference"] is True  # no reference cohort committed yet


def test_contextual_priors_elevated_yap_reorders_ranking(client: TestClient) -> None:
    """A synthetic YAP-dominant phenotype should promote at least one SDC/CD44."""
    elevated_yap_df = _feature_df_json(yap_nc_ratio=[2.8, 3.0, 2.9, 3.1, 3.2])
    resp = client.post(
        "/priors/contextual",
        json={"features_df_json": elevated_yap_df, "cell_count": 5},
    )
    assert resp.status_code == 200
    data = resp.json()
    # YAP1 and WWTR1 should get the largest shares of the weight vector
    weights = data["mechano_weights"]
    assert weights["YAP1"] > weights["RHOA"]
    assert weights["WWTR1"] > weights["ROCK1"]
    # Top 5 must still include at least one SDC/CD44 (they are close to YAP1)
    top_5 = sorted(data["genes"], key=lambda g: g["pathway_rank"] or 999)[:5]
    top_5_names = {g["gene"] for g in top_5}
    assert top_5_names & {"CD44", "SDC4", "SDC2", "SDC1"}, (
        f"Expected a syndecan/CD44 in top 5, got {top_5_names}"
    )


def test_contextual_priors_rejects_malformed_json(client: TestClient) -> None:
    resp = client.post(
        "/priors/contextual",
        json={"features_df_json": "not a json at all", "cell_count": 0},
    )
    assert resp.status_code == 422
    assert "features_df_json" in resp.json()["detail"] or "parse" in resp.json()["detail"]


def test_contextual_priors_empty_df_returns_static_ranking(client: TestClient) -> None:
    """An empty DataFrame → uniform weights → static ranking, marked dynamic.

    This is the "Tab 1 was clicked but extracted zero cells" edge case.
    The response should still be valid and the ranking should match
    the static pathway ranking (because uniform weights reproduce it).
    """
    resp = client.post(
        "/priors/contextual",
        json={"features_df_json": json.dumps([]), "cell_count": 0},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["dynamic"] is True
    static_resp = client.get("/priors")
    static_data = static_resp.json()
    static_top3 = [
        g["gene"] for g in sorted(static_data["genes"], key=lambda g: g["pathway_rank"] or 999)
    ][:3]
    dynamic_top3 = [
        g["gene"] for g in sorted(data["genes"], key=lambda g: g["pathway_rank"] or 999)
    ][:3]
    assert static_top3 == dynamic_top3


def test_contextual_priors_exposes_signed_direction(client: TestClient) -> None:
    """Elevated YAP → response carries mechano_signed_z with YAP1 > 0.

    Also verifies every per-gene entry has a populated
    ``pathway_signed_score`` (the directionally-aware sidecar on the
    dynamic ranking).
    """
    elevated_yap_df = _feature_df_json(yap_nc_ratio=[2.8, 3.0, 2.9, 3.1, 3.2])
    resp = client.post(
        "/priors/contextual",
        json={"features_df_json": elevated_yap_df, "cell_count": 5},
    )
    assert resp.status_code == 200
    data = resp.json()

    # Top-level signed-z vector covers the full signature
    signed_z = data.get("mechano_signed_z")
    assert signed_z is not None, "mechano_signed_z missing from dynamic response"
    assert len(signed_z) == 15
    assert signed_z["YAP1"] > 0.0
    assert signed_z["WWTR1"] > 0.0

    # Every gene has a finite pathway_signed_score
    for g in data["genes"]:
        score = g.get("pathway_signed_score")
        assert score is not None, f"{g['gene']} missing pathway_signed_score"
        assert isinstance(score, (int, float))


def test_static_priors_do_not_expose_signed_sidecar(client: TestClient) -> None:
    """GET /priors is the static endpoint — no direction information."""
    resp = client.get("/priors")
    assert resp.status_code == 200
    data = resp.json()
    assert data["dynamic"] is False
    assert data.get("mechano_signed_z") is None
    # Individual genes also have no signed score on the static endpoint
    for g in data["genes"]:
        assert g.get("pathway_signed_score") is None
