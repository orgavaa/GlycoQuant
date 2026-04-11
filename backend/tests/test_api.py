"""Smoke tests for the FastAPI backend.

Uses ``fastapi.testclient.TestClient`` which runs the app in-process.
Each test is fast and offline; the heavy Cellpose / DINOv2 inference
is gated behind the ``slow`` marker so the main CI loop stays under
15 seconds.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.app.main import app


@pytest.fixture(scope="module")
def client() -> TestClient:
    return TestClient(app)


# ---------------------------------------------------------------------------
# Meta endpoints
# ---------------------------------------------------------------------------


def test_health_endpoint(client: TestClient) -> None:
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "version" in data


def test_root_endpoint(client: TestClient) -> None:
    resp = client.get("/")
    assert resp.status_code == 200
    assert resp.json()["service"] == "glycoquant-api"


def test_openapi_schema_available(client: TestClient) -> None:
    resp = client.get("/openapi.json")
    assert resp.status_code == 200
    schema = resp.json()
    assert "paths" in schema
    assert "/analysis/analyze" in schema["paths"]
    assert "/priors" in schema["paths"]
    assert "/demo" in schema["paths"]


# ---------------------------------------------------------------------------
# Demo metadata
# ---------------------------------------------------------------------------


def test_demo_list(client: TestClient) -> None:
    resp = client.get("/demo")
    assert resp.status_code == 200
    data = resp.json()
    names = {c["name"] for c in data["conditions"]}
    # At least the three HPA datasets should be present
    assert {
        "HPA_SDC1_U2OS",
        "HPA_CD44_U251MG",
        "HPA_YAP1_U2OS",
    }.issubset(names)
    # Every dataset must carry real attribution so the UI can show it
    for c in data["conditions"]:
        assert c["is_real_microscopy"] is True
        assert c["source"] == "Human Protein Atlas"
        assert c["license"]
        assert c["attribution"]


# ---------------------------------------------------------------------------
# Tab 2 priors
# ---------------------------------------------------------------------------


def test_priors_endpoint_returns_ranked_genes(client: TestClient) -> None:
    resp = client.get("/priors")
    assert resp.status_code == 200
    data = resp.json()
    assert data["pathway_available"] is True
    # 22 glycocalyx genes
    assert len(data["genes"]) == 22
    # First entry should have a pathway rank of 1
    assert data["genes"][0]["pathway_rank"] == 1
    # Mechano signature is the 15 canonical genes
    assert len(data["mechano_signature"]) == 15
    # 5 metabolic inhibitors
    assert len(data["metabolic_inhibitors"]) == 5


def test_priors_drill_down_returns_figure(client: TestClient) -> None:
    resp = client.get("/priors/drill/SDC1")
    assert resp.status_code == 200
    data = resp.json()
    assert data["gene"] == "SDC1"
    # Plotly figure JSON is a non-empty string
    assert isinstance(data["heatmap_figure_json"], str)
    assert len(data["heatmap_figure_json"]) > 10


# ---------------------------------------------------------------------------
# Analysis job submission (fast path: no actual Cellpose run)
# ---------------------------------------------------------------------------


def test_analyze_rejects_missing_inputs(client: TestClient) -> None:
    resp = client.post("/analysis/analyze")
    assert resp.status_code == 400


@pytest.mark.slow
def test_analyze_submits_demo_job_end_to_end(client: TestClient) -> None:
    """Submit a demo job and verify it runs end-to-end via the job store.

    WARNING — this test is marked ``slow`` because FastAPI's
    ``TestClient`` runs ``BackgroundTasks`` synchronously after the
    response is sent. Submitting the job therefore triggers a full
    Cellpose-SAM segmentation (~6 minutes on CPU). In the fast CI loop
    we skip this via ``pytest -m "not slow"``.
    """
    resp = client.post(
        "/analysis/analyze",
        data={
            "demo_condition": "HPA_SDC1_U2OS",
            "cell_diameter": "80",
            "include_deep_features": "false",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "job_id" in data
    assert data["status"] in ("queued", "running", "complete")

    # GET /jobs/{id} returns a status row for the newly submitted job
    job_id = data["job_id"]
    status_resp = client.get(f"/analysis/jobs/{job_id}")
    assert status_resp.status_code == 200
    status_data = status_resp.json()
    assert status_data["job_id"] == job_id
    assert "progress" in status_data
    assert "phase" in status_data["progress"]
    # After TestClient has drained BackgroundTasks, the job should
    # have reached a terminal state
    assert status_data["status"] in ("complete", "failed")
    if status_data["status"] == "complete":
        assert status_data["result"] is not None
        assert status_data["result"]["cell_count"] >= 4


def test_job_status_404_for_unknown_id(client: TestClient) -> None:
    resp = client.get("/analysis/jobs/nonexistent-job-id")
    assert resp.status_code == 404
