"""Integration tests for Axis B — /priors/geneformer/{generate,status}.

All Modal calls are monkeypatched so the tests are fast, deterministic,
and runnable in CI without network access or a Modal account.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.app import gpu_client
from backend.app.main import app
from backend.app.routers import priors as priors_router


def _fake_geneformer_payload() -> dict:
    """Minimal valid geneformer_ranks.json shape."""
    return {
        "metadata": {
            "source": "fake-test-run",
            "model": "ctheodoris/Geneformer",
            "n_reference_cells": 100,
        },
        "genes": {
            "SDC1": {"rank": 1, "score": 0.9, "per_mechano_gene": {"YAP1": 0.8}},
            "CD44": {"rank": 2, "score": 0.8, "per_mechano_gene": {"YAP1": 0.7}},
        },
    }


@pytest.fixture
def fake_modal_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Enable the Modal provider path without actually calling Modal."""
    monkeypatch.setenv("GLYCOQUANT_GPU_PROVIDER", "modal")


@pytest.fixture
def tmp_geneformer_path(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> Path:
    """Point the router at a tmp dir so tests don't clobber data/priors/."""
    new_path = tmp_path / "geneformer_ranks.json"
    monkeypatch.setattr(priors_router, "GENEFORMER_PRIOR_PATH", new_path)
    return new_path


@pytest.fixture
def client(
    fake_modal_env: None,
    tmp_geneformer_path: Path,
) -> TestClient:
    return TestClient(app)


def test_generate_requires_modal_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GLYCOQUANT_GPU_PROVIDER", "local")
    client = TestClient(app)
    resp = client.post("/priors/geneformer/generate")
    assert resp.status_code == 400
    assert "GLYCOQUANT_GPU_PROVIDER" in resp.json()["detail"]


def test_generate_then_poll_to_completion(
    monkeypatch: pytest.MonkeyPatch,
    client: TestClient,
    tmp_geneformer_path: Path,
) -> None:
    """End-to-end happy path: spawn → running → complete → disk write."""

    # --- Spawn returns a deterministic call id
    monkeypatch.setattr(
        gpu_client, "spawn_geneformer_generation", lambda: "fake-call-id"
    )

    resp = client.post("/priors/geneformer/generate")
    assert resp.status_code == 200
    spawn_data = resp.json()
    job_id = spawn_data["job_id"]
    assert spawn_data["modal_call_id"] == "fake-call-id"

    # --- First poll: still running
    monkeypatch.setattr(
        gpu_client,
        "poll_geneformer_call",
        lambda call_id: ("running", None),
    )
    resp = client.get(f"/priors/geneformer/status/{job_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["state"] == "running"
    assert data["elapsed_sec"] >= 0
    assert tmp_geneformer_path.exists() is False

    # --- Second poll: complete, dict returned
    payload = _fake_geneformer_payload()
    monkeypatch.setattr(
        gpu_client,
        "poll_geneformer_call",
        lambda call_id: ("complete", payload),
    )
    resp = client.get(f"/priors/geneformer/status/{job_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["state"] == "complete"
    assert tmp_geneformer_path.exists()
    on_disk = json.loads(tmp_geneformer_path.read_text(encoding="utf-8"))
    assert on_disk["metadata"]["source"] == "fake-test-run"
    assert "SDC1" in on_disk["genes"]


def test_poll_failure_surfaces_error(
    monkeypatch: pytest.MonkeyPatch,
    client: TestClient,
) -> None:
    monkeypatch.setattr(
        gpu_client, "spawn_geneformer_generation", lambda: "fake-id"
    )
    resp = client.post("/priors/geneformer/generate")
    job_id = resp.json()["job_id"]

    monkeypatch.setattr(
        gpu_client,
        "poll_geneformer_call",
        lambda call_id: ("failed", None),
    )
    resp = client.get(f"/priors/geneformer/status/{job_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["state"] == "failed"
    assert data["error"]


def test_poll_unknown_job_returns_404(
    fake_modal_env: None,
) -> None:
    client = TestClient(app)
    resp = client.get("/priors/geneformer/status/does-not-exist")
    assert resp.status_code == 404


def test_priors_reports_can_generate_flag(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """GET /priors must tell the frontend whether Axis B is available."""
    monkeypatch.setenv("GLYCOQUANT_GPU_PROVIDER", "modal")
    client = TestClient(app)
    resp = client.get("/priors")
    assert resp.status_code == 200
    assert resp.json()["can_generate_geneformer"] is True

    monkeypatch.setenv("GLYCOQUANT_GPU_PROVIDER", "local")
    client = TestClient(app)
    resp = client.get("/priors")
    assert resp.json()["can_generate_geneformer"] is False
