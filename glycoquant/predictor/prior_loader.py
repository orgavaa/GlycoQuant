"""Load pre-computed Geneformer and STRING functional-association priors for Tab 2.

Tab 2 never runs Geneformer inference at runtime. Instead, two
committed JSON files in ``data/priors/`` hold the precomputed rankings:

- ``geneformer_ranks.json`` — produced once on Modal L4 GPU via
  ``backend/modal_app.py::generate_geneformer_prior``
- ``pathway_ranks.json`` — produced locally via
  ``scripts/generate_pathway_priors.py`` (STRING v12 REST API)

This module loads those files into lightweight immutable dataclasses,
computes the divergence column, and assembles the combined dataframe
that Tab 2's ``tab_prioritization.py`` renders. It gracefully handles
missing Geneformer files (pathway-only fallback) so the platform is
shippable even before the Modal run completes.

Reproducibility hardening (Fix H2):
- :func:`prior_status` returns a structured ``PriorStatus`` for any
  loaded ``PriorTable``: ``MISSING``, ``INVALID`` (schema problem),
  ``STALE`` (older than the configurable freshness window), or ``READY``.
- :data:`GENEFORMER_FRESHNESS_DAYS` defaults to 180 days. Older priors
  are surfaced as STALE rather than silently consumed.
- :data:`MIN_GENEFORMER_GENE_COUNT` rejects partially-built JSONs that
  contain fewer than the expected 22 glycocalyx genes.
"""
from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum
from pathlib import Path
from typing import Any

import pandas as pd

# Geneformer prior is treated as STALE after ~6 months — long enough
# that an HF model card update or a Tabula Sapiens revision could
# meaningfully change the cosine-shift output, short enough that a
# committed prior reflects roughly contemporary knowledge.
GENEFORMER_FRESHNESS_DAYS: int = 180

# A complete Geneformer prior covers all 22 glycocalyx genes from the
# config panel. Anything below 80% (i.e. 17 genes) is flagged INVALID.
MIN_GENEFORMER_GENE_COUNT: int = 17

# Per-gene fields that must all be present and finite for a gene
# entry to count as well-formed.
_REQUIRED_GENE_FIELDS: tuple[str, ...] = ("rank", "score")


class PriorStatus(str, Enum):
    """Reproducibility status of a prior JSON on disk.

    Mapped to a string enum so it serialises naturally onto pydantic
    response models without a custom encoder.
    """

    MISSING = "missing"
    INVALID = "invalid"
    STALE = "stale"
    READY = "ready"


@dataclass(frozen=True)
class PriorStatusReport:
    """Detailed status for one prior, surfaced on the /priors response."""

    status: PriorStatus
    detail: str
    n_genes: int
    generated_utc: str | None
    age_days: float | None


@dataclass(frozen=True)
class GeneRanking:
    """Per-gene entry in a :class:`PriorTable`."""

    gene: str
    rank: int
    score: float
    per_mechano: dict[str, float] = field(default_factory=dict)


@dataclass(frozen=True)
class PriorTable:
    """One source's worth of precomputed perturbation rankings.

    Attributes
    ----------
    source : str
        ``"geneformer"`` or ``"pathway"``.
    metadata : dict
        The ``metadata`` block from the source JSON (model name,
        generation timestamp, STRING confidence threshold, etc.).
    rankings : dict[str, GeneRanking]
        Keyed by glycocalyx gene symbol.
    available : bool
        ``False`` if the source file was missing at load time; Tab 2
        degrades gracefully to pathway-only mode in that case.
    """

    source: str
    metadata: dict[str, Any]
    rankings: dict[str, GeneRanking]
    available: bool


def load_prior(path: str | Path, source: str) -> PriorTable:
    """Load one prior JSON. Returns ``available=False`` if the file is missing.

    Parameters
    ----------
    path : str or Path
        Path to the JSON file on disk.
    source : str
        ``"geneformer"`` or ``"pathway"``. Stored on the returned
        :class:`PriorTable` so Tab 2 can label the columns correctly.
    """
    path = Path(path)
    if not path.is_file():
        return PriorTable(source=source, metadata={}, rankings={}, available=False)

    data = json.loads(path.read_text(encoding="utf-8"))
    rankings: dict[str, GeneRanking] = {}
    for gene_name, g_data in data.get("genes", {}).items():
        score = float(
            g_data.get("score", g_data.get("median_cosine_shift", 0.0))
        )
        per_mechano_raw = g_data.get("per_mechano_gene", {})
        per_mechano: dict[str, float] = {}
        for target, val in per_mechano_raw.items():
            if isinstance(val, dict):
                # Pathway format: {distance, inverse, path}
                per_mechano[target] = float(
                    val.get("inverse", val.get("distance", 0.0))
                )
            else:
                per_mechano[target] = float(val)
        rankings[gene_name] = GeneRanking(
            gene=gene_name,
            rank=int(g_data["rank"]),
            score=score,
            per_mechano=per_mechano,
        )

    return PriorTable(
        source=source,
        metadata=dict(data.get("metadata", {})),
        rankings=rankings,
        available=True,
    )


def compute_divergence(
    geneformer: PriorTable,
    pathway: PriorTable,
) -> dict[str, int]:
    """Per-gene ``|rank_geneformer − rank_pathway|``.

    Returns an empty dict if either prior is unavailable; the Tab 2 UI
    interprets that as "pathway-only mode" and omits the divergence
    column entirely.
    """
    if not (geneformer.available and pathway.available):
        return {}
    out: dict[str, int] = {}
    for gene, gf in geneformer.rankings.items():
        if gene in pathway.rankings:
            out[gene] = abs(int(gf.rank) - int(pathway.rankings[gene].rank))
    return out


def build_ranking_dataframe(
    geneformer: PriorTable,
    pathway: PriorTable,
) -> pd.DataFrame:
    """Combine both priors into the dataframe consumed by Tab 2.

    Columns: ``gene``, ``geneformer_rank``, ``geneformer_score``,
    ``pathway_rank``, ``pathway_score``, ``abs_rank_divergence``.
    Missing values (one source unavailable, or a gene absent from one
    side) are left as ``NaN`` so pandas sorting still works.
    """
    all_genes = sorted(set(geneformer.rankings) | set(pathway.rankings))
    divergence = compute_divergence(geneformer, pathway)

    rows: list[dict[str, Any]] = []
    for gene in all_genes:
        gf = geneformer.rankings.get(gene)
        pw = pathway.rankings.get(gene)
        rows.append(
            {
                "gene": gene,
                "geneformer_rank": gf.rank if gf else None,
                "geneformer_score": gf.score if gf else None,
                "pathway_rank": pw.rank if pw else None,
                "pathway_score": pw.score if pw else None,
                "abs_rank_divergence": divergence.get(gene),
            }
        )
    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# H2 — Reproducibility hardening: schema validation + freshness check
# ---------------------------------------------------------------------------


def _parse_generated_utc(metadata: dict[str, Any]) -> datetime | None:
    """Best-effort ISO-8601 parse of ``metadata.generated_utc``."""
    raw = metadata.get("generated_utc")
    if not isinstance(raw, str):
        return None
    try:
        # Python 3.10 fromisoformat accepts the trailing 'Z' from 3.11+
        if raw.endswith("Z"):
            raw = raw[:-1] + "+00:00"
        dt = datetime.fromisoformat(raw)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def prior_status(
    prior: PriorTable,
    *,
    expected_min_genes: int = MIN_GENEFORMER_GENE_COUNT,
    freshness_days: int = GENEFORMER_FRESHNESS_DAYS,
    now: datetime | None = None,
) -> PriorStatusReport:
    """Validate a loaded :class:`PriorTable` and report its reproducibility status.

    Status ladder, in order of preference for the surfacing UI:

    - ``MISSING`` — file did not exist on disk; ``prior.available`` is False.
    - ``INVALID`` — file present but failed schema validation: a known
      Modal error stub ``metadata.error`` is set, ``rankings`` is
      empty, fewer than ``expected_min_genes`` covered, or any per-gene
      entry has a non-finite ``score``/``rank``.
    - ``STALE`` — schema valid but ``metadata.generated_utc`` is older
      than ``freshness_days`` (default 180 days). The prior is still
      consumed, just labelled.
    - ``READY`` — schema valid AND fresh.

    The motivation is publishable reproducibility: a paper that
    references ``geneformer_ranks.json`` should know whether the file
    was generated with this commit's model version, recently, and over
    the full panel — or whether the displayed ranking is partial or
    stale enough that the divergence column may be misleading.
    """
    now = now or datetime.now(tz=timezone.utc)

    if not prior.available:
        return PriorStatusReport(
            status=PriorStatus.MISSING,
            detail="Prior JSON not present on disk.",
            n_genes=0,
            generated_utc=None,
            age_days=None,
        )

    metadata = prior.metadata or {}
    n_genes = len(prior.rankings)
    generated_dt = _parse_generated_utc(metadata)
    generated_iso = (
        generated_dt.isoformat() if generated_dt is not None else None
    )
    age_days = (
        (now - generated_dt).total_seconds() / 86400.0
        if generated_dt is not None
        else None
    )

    # The Modal Geneformer dispatcher writes ``metadata.error`` on
    # failure (with the traceback in ``metadata.traceback``). Surface
    # that explicitly — silent consumption hides a broken run.
    if "error" in metadata:
        return PriorStatusReport(
            status=PriorStatus.INVALID,
            detail=f"Prior generator reported an error: {metadata['error']}",
            n_genes=n_genes,
            generated_utc=generated_iso,
            age_days=age_days,
        )

    if n_genes == 0:
        return PriorStatusReport(
            status=PriorStatus.INVALID,
            detail="Prior file has zero gene entries — likely a generator stub or partial run.",
            n_genes=0,
            generated_utc=generated_iso,
            age_days=age_days,
        )

    if n_genes < expected_min_genes:
        return PriorStatusReport(
            status=PriorStatus.INVALID,
            detail=(
                f"Prior covers only {n_genes} genes, below the minimum "
                f"{expected_min_genes}. Re-run the generator on the full panel."
            ),
            n_genes=n_genes,
            generated_utc=generated_iso,
            age_days=age_days,
        )

    # Any per-gene entry with a non-finite score → INVALID.
    for gene, ranking in prior.rankings.items():
        if not math.isfinite(ranking.score):
            return PriorStatusReport(
                status=PriorStatus.INVALID,
                detail=f"Gene {gene} has non-finite score {ranking.score!r}.",
                n_genes=n_genes,
                generated_utc=generated_iso,
                age_days=age_days,
            )
        if ranking.rank <= 0:
            return PriorStatusReport(
                status=PriorStatus.INVALID,
                detail=f"Gene {gene} has non-positive rank {ranking.rank}.",
                n_genes=n_genes,
                generated_utc=generated_iso,
                age_days=age_days,
            )
        for required in _REQUIRED_GENE_FIELDS:
            if not hasattr(ranking, required):
                return PriorStatusReport(
                    status=PriorStatus.INVALID,
                    detail=f"Gene {gene} missing required field {required!r}.",
                    n_genes=n_genes,
                    generated_utc=generated_iso,
                    age_days=age_days,
                )

    if age_days is not None and age_days > freshness_days:
        return PriorStatusReport(
            status=PriorStatus.STALE,
            detail=(
                f"Prior generated {age_days:.0f} days ago, exceeds "
                f"{freshness_days}-day freshness window. Regenerate to refresh."
            ),
            n_genes=n_genes,
            generated_utc=generated_iso,
            age_days=age_days,
        )

    return PriorStatusReport(
        status=PriorStatus.READY,
        detail="Schema valid and within freshness window.",
        n_genes=n_genes,
        generated_utc=generated_iso,
        age_days=age_days,
    )
