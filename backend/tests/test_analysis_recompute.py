"""Integration tests for POST /analysis/jobs/{job_id}/recompute-correlation.

The recompute endpoint (Fix 8 frontend surfacing, commit B6 on
feat/ui-surface-dynamic-fields) lets the UI flip between the
parametric Spearman null and the opt-in permutation null without
re-uploading the image. The backend reads the cached per-cell
DataFrame from job.meta and re-runs the correlation only — every
other payload field is passed through.
"""
from __future__ import annotations

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


def _build_features_df_json() -> str:
    """Tiny per-cell DataFrame with enough structure for the correlation to fire."""
    rng = np.random.default_rng(42)
    n = 60
    latent = rng.normal(0.0, 1.0, size=n)
    data: dict[str, np.ndarray] = {
        "cell_id": np.arange(1, n + 1, dtype=np.float64),
    }
    for c in (
        "glycocalyx_mean_intensity",
        "glycocalyx_integrated_intensity",
        "glycocalyx_pericellular_ratio",
        "glycocalyx_coverage",
        "glycocalyx_heterogeneity",
        "glycocalyx_shannon_entropy",
        "glycocalyx_radial_decay_rate",
        "glycocalyx_haralick_contrast",
        "glycocalyx_haralick_homogeneity",
        "glycocalyx_haralick_correlation",
        "glycocalyx_haralick_energy",
        "glycocalyx_moran_i",
    ):
        data[c] = rng.normal(0.0, 1.0, size=n)
    for c in (
        "mechano_score",
        "yap_nc_ratio_size_corrected",
        "yap_nuclear_intensity",
        "fa_density_per_um2",
        "fa_mature_fraction",
        "fa_total_area_um2",
        "fa_mean_orientation_alignment",
        "actin_stress_fiber_coherence",
        "actin_cortical_ratio",
        "nuclear_aspect_ratio",
        "nuclear_solidity",
        "nuclear_to_cell_area_ratio",
    ):
        data[c] = rng.normal(0.0, 1.0, size=n)
    # One strong engineered pair
    data["glycocalyx_haralick_contrast"] = 0.5 + 0.4 * latent + rng.normal(0.0, 0.05, size=n)
    data["fa_mature_fraction"] = 0.5 + 0.4 * latent + rng.normal(0.0, 0.05, size=n)
    return pd.DataFrame(data).to_json(orient="records")


def _seed_complete_job(df_json: str) -> str:
    """Register a complete job in the in-memory store and cache the DataFrame."""
    store = get_job_store()
    job = store.create(meta={})
    store.update(
        job.id,
        status="complete",
        phase="done",
        pct=100,
        message="Test job",
        result=JobResult(
            image_hash="test-hash",
            cell_count=60,
            features_df_json=df_json,
            segmentation_figure_json="{}",
            radial_profile_figure_json="{}",
            correlation_figure_json="{}",
            glyco_mechano_correlation_figure_json="{}",
            mechano_score_distribution_figure_json="{}",
            mechano_score_summary=MechanoScoreSummary(
                mode="pca",
                n_cells_used=60,
                n_features_used=12,
                pc1_variance_explained=0.35,
                loadings={},
                mean=0.0,
                std=1.0,
                n_significant_pairs_fdr=0,
            ),
            hero_metrics={"cell_count": 60.0, "mean_mechano_score": 0.0},
        ),
    )
    # Explicitly cache the DataFrame the endpoint will read
    live_job = store.get(job.id)
    assert live_job is not None
    live_job.meta["_features_df_full_json"] = df_json
    live_job.progress = JobProgress(phase="done", pct=100, message="ok")
    live_job.finished_at = datetime.now(tz=timezone.utc)
    return job.id


def test_recompute_correlation_parametric_roundtrip(client: TestClient) -> None:
    """n_permutations=0 should return a valid JobResult with the parametric figure."""
    job_id = _seed_complete_job(_build_features_df_json())
    resp = client.post(
        f"/analysis/jobs/{job_id}/recompute-correlation",
        params={"n_permutations": 0},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "glyco_mechano_correlation_figure_json" in data
    assert data["glyco_mechano_correlation_figure_json"]
    summary = data.get("mechano_score_summary")
    assert summary is not None
    # n_significant_pairs_fdr is refreshed from the new computation
    assert isinstance(summary.get("n_significant_pairs_fdr"), int)


def test_recompute_correlation_permutation_changes_figure(client: TestClient) -> None:
    """n_permutations=200 should produce a different figure than the parametric one.

    The r-matrix is identical (correlation is deterministic) but the
    title/subtitle and p-matrix change under the empirical null, so the
    JSON differs.
    """
    job_id = _seed_complete_job(_build_features_df_json())

    resp_parametric = client.post(
        f"/analysis/jobs/{job_id}/recompute-correlation",
        params={"n_permutations": 0},
    )
    assert resp_parametric.status_code == 200
    fig_parametric = resp_parametric.json()["glyco_mechano_correlation_figure_json"]

    resp_permutation = client.post(
        f"/analysis/jobs/{job_id}/recompute-correlation",
        params={"n_permutations": 200},
    )
    assert resp_permutation.status_code == 200
    fig_permutation = resp_permutation.json()["glyco_mechano_correlation_figure_json"]

    # The figures share r-values but differ because p-based star annotations,
    # titles, and subtitle-level counts change under the different null.
    assert fig_parametric != fig_permutation


def test_recompute_correlation_rejects_out_of_range(client: TestClient) -> None:
    """n_permutations must be in [0, 10_000]."""
    job_id = _seed_complete_job(_build_features_df_json())
    for bad in (-1, 10_001):
        resp = client.post(
            f"/analysis/jobs/{job_id}/recompute-correlation",
            params={"n_permutations": bad},
        )
        assert resp.status_code == 422, (bad, resp.text)


def test_recompute_correlation_404_on_missing_job(client: TestClient) -> None:
    resp = client.post(
        "/analysis/jobs/does-not-exist/recompute-correlation",
        params={"n_permutations": 0},
    )
    assert resp.status_code == 404
