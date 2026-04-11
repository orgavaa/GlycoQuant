"""Dispatcher tests for ``run_analysis_job``.

When ``GLYCOQUANT_GPU_PROVIDER=modal`` the worker must skip its local
Cellpose/DINOv2 code path entirely and instead call
``backend.app.gpu_client.run_pipeline_remote``. These tests monkeypatch
that function so the test stays offline and completes in milliseconds
while still exercising the real FastAPI + BackgroundTasks plumbing.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.app import gpu_client
from backend.app.main import app
from backend.app.schemas import JobResult


def _fake_job_result(cell_count: int = 5) -> JobResult:
    return JobResult(
        image_hash="fake-hash",
        cell_count=cell_count,
        features_df_json="[]",
        segmentation_figure_json="{}",
        radial_profile_figure_json="{}",
        correlation_figure_json="{}",
        hero_metrics={
            "cell_count": float(cell_count),
            "mean_yap_nc": 0.5,
            "mean_fa_count": 80.0,
            "mean_actin_coherence": 0.5,
            "mean_glycocalyx_ratio": 1.2,
        },
        has_deep_features=False,
    )


@pytest.fixture
def modal_client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    """TestClient with the Modal provider wired to a fake remote call."""
    monkeypatch.setenv("GLYCOQUANT_GPU_PROVIDER", "modal")

    def fake_remote(*, channels, cell_diameter, include_deep_features):  # noqa: ANN001, ARG001
        return _fake_job_result(cell_count=5)

    # Patch the symbol in its source module. ``run_analysis_job`` uses a
    # local ``from backend.app.gpu_client import run_pipeline_remote``
    # at call time, which re-reads this attribute on every invocation.
    monkeypatch.setattr(gpu_client, "run_pipeline_remote", fake_remote)
    return TestClient(app)


def test_dispatch_routes_to_modal(modal_client: TestClient) -> None:
    resp = modal_client.post(
        "/analysis/analyze",
        data={
            "demo_condition": "HPA_SDC1_U2OS",
            "cell_diameter": "80",
            "include_deep_features": "false",
        },
    )
    assert resp.status_code == 200
    job_id = resp.json()["job_id"]

    status_resp = modal_client.get(f"/analysis/jobs/{job_id}")
    assert status_resp.status_code == 200
    status = status_resp.json()
    assert status["status"] == "complete"
    assert status["result"]["cell_count"] == 5
    assert status["result"]["image_hash"] == "fake-hash"
    # Progress snapped directly to 100 after the remote call
    assert status["progress"]["pct"] == 100
    assert status["progress"]["phase"] == "done"
