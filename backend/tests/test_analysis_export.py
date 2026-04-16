"""Integration tests for GET /analysis/jobs/{job_id}/export.

Fix C7 on feat/ui-surface-dynamic-fields wires the previously-stub
Export button. The endpoint returns a zip bundle containing the
per-cell features, a results summary, and a provenance manifest —
the machine-readable sidecar to the figure-level Plotly downloads.
"""
from __future__ import annotations

import io
import json
import zipfile
from datetime import datetime, timezone

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.schemas import JobProgress, JobResult, MechanoScoreSummary
from backend.app.workers import get_job_store


@pytest.fixture(scope="module")
def client() -> TestClient:
    return TestClient(app)


def _seed_complete_job() -> str:
    store = get_job_store()
    job = store.create(meta={"pixel_size_um": 0.325})
    rng = np.random.default_rng(7)
    n = 30
    # Include a deep_* column to verify it's dropped from the CSV
    df = pd.DataFrame(
        {
            "cell_id": np.arange(1, n + 1, dtype=np.float64),
            "mechano_score": rng.normal(0.0, 1.0, size=n),
            "yap_nc_ratio": rng.normal(1.0, 0.2, size=n),
            "deep_000": rng.normal(0.0, 1.0, size=n),
            "deep_001": rng.normal(0.0, 1.0, size=n),
        }
    )
    features_json = df.to_json(orient="records")
    store.update(
        job.id,
        status="complete",
        phase="done",
        pct=100,
        message="Test job",
        result=JobResult(
            image_hash="export-hash",
            cell_count=n,
            features_df_json=features_json,
            segmentation_figure_json="{}",
            radial_profile_figure_json="{}",
            correlation_figure_json="{}",
            mechano_score_summary=MechanoScoreSummary(
                mode="pca",
                n_cells_used=n,
                n_features_used=3,
                pc1_variance_explained=0.3,
                loadings={"mechano_score": 0.5},
                mean=0.0,
                std=1.0,
                n_significant_pairs_fdr=2,
                yap_size_correction_applied=True,
                yap_size_correction_r2=0.42,
            ),
            hero_metrics={"cell_count": float(n)},
        ),
    )
    live_job = store.get(job.id)
    assert live_job is not None
    live_job.meta["_features_df_full_json"] = features_json
    live_job.progress = JobProgress(phase="done", pct=100, message="ok")
    live_job.finished_at = datetime.now(tz=timezone.utc)
    return job.id


def test_export_returns_zip_with_three_expected_members(client: TestClient) -> None:
    job_id = _seed_complete_job()
    resp = client.get(f"/analysis/jobs/{job_id}/export")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/zip"
    assert "attachment" in resp.headers.get("content-disposition", "")

    buf = io.BytesIO(resp.content)
    with zipfile.ZipFile(buf, "r") as zf:
        names = set(zf.namelist())
        assert names == {
            "features_per_cell.csv",
            "results_summary.json",
            "provenance.json",
        }


def test_export_csv_drops_deep_columns(client: TestClient) -> None:
    """deep_* embedding columns are not useful in a methods bundle."""
    job_id = _seed_complete_job()
    resp = client.get(f"/analysis/jobs/{job_id}/export")
    assert resp.status_code == 200
    buf = io.BytesIO(resp.content)
    with zipfile.ZipFile(buf, "r") as zf:
        csv_text = zf.read("features_per_cell.csv").decode("utf-8")
    header = csv_text.splitlines()[0]
    assert "deep_000" not in header
    assert "deep_001" not in header
    assert "mechano_score" in header
    assert "cell_id" in header


def test_export_results_summary_carries_yap_diagnostic(client: TestClient) -> None:
    """Fix 7 fields (yap_size_correction_*) must reach the summary."""
    job_id = _seed_complete_job()
    resp = client.get(f"/analysis/jobs/{job_id}/export")
    buf = io.BytesIO(resp.content)
    with zipfile.ZipFile(buf, "r") as zf:
        summary = json.loads(zf.read("results_summary.json"))
    assert summary["cell_count"] == 30
    mss = summary["mechano_score_summary"]
    assert mss["yap_size_correction_applied"] is True
    assert mss["yap_size_correction_r2"] == pytest.approx(0.42)
    assert mss["n_significant_pairs_fdr"] == 2


def test_export_provenance_has_expected_keys(client: TestClient) -> None:
    """Provenance carries the methods-section essentials."""
    job_id = _seed_complete_job()
    resp = client.get(f"/analysis/jobs/{job_id}/export")
    buf = io.BytesIO(resp.content)
    with zipfile.ZipFile(buf, "r") as zf:
        prov = json.loads(zf.read("provenance.json"))
    # Always present
    for key in (
        "generated_utc",
        "job_id",
        "schema_version",
        "seed",
        "pixel_size_um",
    ):
        assert key in prov
    assert prov["schema_version"] == "v1"
    assert prov["seed"] == 42
    assert prov["pixel_size_um"] == pytest.approx(0.325)
    # Pathway policy keys appear when data/priors/pathway_ranks.json is present;
    # tolerate missing files (test-only environments without the committed JSON).
    # The keys are still in the dict, just may carry None.
    assert "string_confidence_threshold" in prov
    assert "curated_edge_count" in prov


def test_export_404_on_missing_job(client: TestClient) -> None:
    resp = client.get("/analysis/jobs/does-not-exist/export")
    assert resp.status_code == 404


def test_export_409_on_incomplete_job(client: TestClient) -> None:
    store = get_job_store()
    job = store.create(meta={})
    # Leave it in 'queued' state
    resp = client.get(f"/analysis/jobs/{job.id}/export")
    assert resp.status_code == 409
