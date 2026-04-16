"""Tests for the H2 reproducibility-hardening helpers in prior_loader.

The prior_status() function classifies each loaded PriorTable as
MISSING / INVALID / STALE / READY so the UI can badge prior provenance
honestly. These tests cover every status branch on minimal synthetic
PriorTable / metadata combinations — no disk I/O.
"""
from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone

import pytest

from glycoquant.predictor import (
    PriorStatus,
    PriorStatusReport,
    PriorTable,
    prior_status,
)
from glycoquant.predictor.prior_loader import (
    GENEFORMER_FRESHNESS_DAYS,
    GeneRanking,
    MIN_GENEFORMER_GENE_COUNT,
)


def _gene_dict(n_genes: int) -> dict[str, GeneRanking]:
    """Synthetic well-formed gene rankings."""
    return {
        f"GENE{i:02d}": GeneRanking(
            gene=f"GENE{i:02d}", rank=i + 1, score=0.5 + i * 0.01, per_mechano={}
        )
        for i in range(n_genes)
    }


def _build_prior(
    *,
    available: bool = True,
    metadata: dict | None = None,
    rankings: dict[str, GeneRanking] | None = None,
) -> PriorTable:
    return PriorTable(
        source="geneformer",
        metadata=metadata or {},
        rankings=rankings or {},
        available=available,
    )


# ---------------------------------------------------------------------------
# MISSING
# ---------------------------------------------------------------------------


def test_status_missing_when_prior_unavailable() -> None:
    prior = _build_prior(available=False)
    report = prior_status(prior)
    assert report.status == PriorStatus.MISSING
    assert report.n_genes == 0
    assert "not present" in report.detail.lower()


# ---------------------------------------------------------------------------
# INVALID
# ---------------------------------------------------------------------------


def test_status_invalid_when_zero_genes() -> None:
    prior = _build_prior(rankings={})
    report = prior_status(prior)
    assert report.status == PriorStatus.INVALID
    assert "zero gene" in report.detail.lower()


def test_status_invalid_when_metadata_carries_error() -> None:
    """Modal Geneformer dispatcher writes metadata.error on failure."""
    prior = _build_prior(
        rankings=_gene_dict(MIN_GENEFORMER_GENE_COUNT),
        metadata={"error": "OSError: model checkpoint not found"},
    )
    report = prior_status(prior)
    assert report.status == PriorStatus.INVALID
    assert "error" in report.detail.lower()


def test_status_invalid_when_below_min_gene_count() -> None:
    prior = _build_prior(rankings=_gene_dict(MIN_GENEFORMER_GENE_COUNT - 1))
    report = prior_status(prior)
    assert report.status == PriorStatus.INVALID
    assert "covers only" in report.detail.lower()


def test_status_invalid_on_non_finite_score() -> None:
    rankings = _gene_dict(MIN_GENEFORMER_GENE_COUNT)
    rankings["GENE00"] = GeneRanking(gene="GENE00", rank=1, score=math.nan, per_mechano={})
    prior = _build_prior(rankings=rankings)
    report = prior_status(prior)
    assert report.status == PriorStatus.INVALID
    assert "non-finite" in report.detail.lower()


def test_status_invalid_on_non_positive_rank() -> None:
    rankings = _gene_dict(MIN_GENEFORMER_GENE_COUNT)
    rankings["GENE00"] = GeneRanking(gene="GENE00", rank=0, score=0.5, per_mechano={})
    prior = _build_prior(rankings=rankings)
    report = prior_status(prior)
    assert report.status == PriorStatus.INVALID
    assert "non-positive rank" in report.detail.lower()


# ---------------------------------------------------------------------------
# STALE
# ---------------------------------------------------------------------------


def test_status_stale_when_older_than_freshness_window() -> None:
    now = datetime(2026, 5, 1, tzinfo=timezone.utc)
    old = now - timedelta(days=GENEFORMER_FRESHNESS_DAYS + 30)
    prior = _build_prior(
        rankings=_gene_dict(MIN_GENEFORMER_GENE_COUNT),
        metadata={"generated_utc": old.isoformat()},
    )
    report = prior_status(prior, now=now)
    assert report.status == PriorStatus.STALE
    assert report.age_days is not None
    assert report.age_days > GENEFORMER_FRESHNESS_DAYS
    assert "exceeds" in report.detail.lower()


def test_status_ready_within_freshness_window() -> None:
    now = datetime(2026, 5, 1, tzinfo=timezone.utc)
    recent = now - timedelta(days=10)
    prior = _build_prior(
        rankings=_gene_dict(MIN_GENEFORMER_GENE_COUNT),
        metadata={"generated_utc": recent.isoformat()},
    )
    report = prior_status(prior, now=now)
    assert report.status == PriorStatus.READY
    assert report.age_days is not None
    assert report.age_days < GENEFORMER_FRESHNESS_DAYS


def test_status_ready_with_no_generated_utc() -> None:
    """Missing generated_utc is allowed — we just can't assess freshness.

    Status falls through to READY when nothing else is wrong; the UI
    shows no badge. This matches the committed pathway_ranks.json's
    behaviour today.
    """
    prior = _build_prior(rankings=_gene_dict(MIN_GENEFORMER_GENE_COUNT))
    report = prior_status(prior)
    assert report.status == PriorStatus.READY
    assert report.age_days is None
    assert report.generated_utc is None


# ---------------------------------------------------------------------------
# Future-stamped freshness — defensive parsing
# ---------------------------------------------------------------------------


def test_status_handles_z_suffix_iso_timestamp() -> None:
    """Geneformer dispatcher writes generated_utc with a trailing 'Z'."""
    now = datetime(2026, 5, 1, tzinfo=timezone.utc)
    recent = (now - timedelta(days=2)).strftime("%Y-%m-%dT%H:%M:%S.%fZ")
    prior = _build_prior(
        rankings=_gene_dict(MIN_GENEFORMER_GENE_COUNT),
        metadata={"generated_utc": recent},
    )
    report = prior_status(prior, now=now)
    assert report.status == PriorStatus.READY
    assert report.generated_utc is not None


def test_status_handles_unparseable_timestamp_gracefully() -> None:
    """Garbage timestamp → can't compute age, but rest of validation still runs.

    Status falls through to READY (the rest of the schema is fine) but
    age_days stays None and the UI doesn't show a freshness badge.
    """
    prior = _build_prior(
        rankings=_gene_dict(MIN_GENEFORMER_GENE_COUNT),
        metadata={"generated_utc": "not a real timestamp"},
    )
    report = prior_status(prior)
    assert report.status == PriorStatus.READY
    assert report.age_days is None
