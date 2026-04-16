"""Generate the STRING v12 pathway prior for Tab 2.

Run locally (requires network access to ``string-db.org``):

    python scripts/generate_pathway_priors.py [--confidence-threshold 400]

Writes two committed JSON artifacts:

- ``data/priors/pathway_ranks.json`` — per-glycocalyx-gene median
  inverse shortest-path score against the 15-gene mechanotransduction
  signature, with per-target distances + paths.
- ``data/priors/pathway_evidence.json`` — drill-down data for the
  Tab 2 UI: for every (glycocalyx gene, mechano gene) pair, the
  shortest path, each edge's STRING confidence score, the edge's
  source (``"string"`` or ``"curated"``), and — for curated edges —
  the primary-literature PubMed DOI.

Confidence policy
-----------------
The default STRING confidence threshold is **0.40** (``400`` in
STRING's 0–1000 scale). This is the "medium" tier rather than the
"high" tier (0.70). The glycocalyx ↔ mechanotransduction biology
this platform targets — especially the hexosamine → O-GlcNAc → YAP
axis and N-glycan branching of integrins — is under-represented in
STRING's high-confidence subnetwork because the relevant primary
literature (Peng *et al.* 2017 PNAS; Taparra *et al.* 2018 JCI; Lau
*et al.* 2007 Cell; Isaji *et al.* 2009 JBC) is recent and STRING's
text-mined evidence has not fully caught up. A 0.70 cutoff would
exclude exactly the biology we need to rank against.

On top of the 0.40 STRING subnetwork we add a small number of
**curated literature edges** representing well-documented
biochemical connections that STRING may under-score. Each carries a
``source="curated"`` tag and a ``pubmed_doi`` so every ranking is
still traceable to primary literature in the drill-down UI.

The script is idempotent — re-running it overwrites the JSON files
and updates the ``metadata.generated_utc`` timestamp. It never
touches Geneformer; that prior is generated separately on Modal.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import networkx as nx
import requests

# Make the repo importable when the script is invoked as
# ``python scripts/generate_pathway_priors.py`` from the repo root.
_REPO_ROOT = Path(__file__).resolve().parents[1]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from glycoquant.predictor.mechano_signature import (  # noqa: E402
    get_glycocalyx_genes,
    get_mechano_signature,
)
from glycoquant.predictor.pathway_score import median_inverse_shortest_path  # noqa: E402

STRING_API = "https://string-db.org/api/json"
SPECIES = 9606  # Homo sapiens
DEFAULT_CONFIDENCE_THRESHOLD = 400  # 0.4 * 1000 — see module docstring for policy
CALLER_IDENTITY = "glycoquant-pathway-prior"
OUTPUT_DIR = _REPO_ROOT / "data" / "priors"
REQUEST_TIMEOUT = 60.0

CURATED_EDGE_POLICY = (
    "Literature-traceable edges added below the STRING cutoff where the "
    "primary literature is strong but STRING confidence has not caught up. "
    "Each curated edge carries source='curated' and pubmed_doi in "
    "pathway_evidence.json for full provenance. The glycocalyx <-> "
    "mechanotransduction axis (hexosamine -> O-GlcNAc -> YAP; N-glycan "
    "branching of integrins) is the specific biology being bridged."
)

# Curated literature edges. Each dict has:
#   a, b          : gene symbols
#   confidence    : float in [0, 1] — matches STRING's scoring scheme
#   pubmed_doi    : primary literature DOI (single most direct reference)
#   reason        : one-line biochemical rationale surfaced in the drill-down
CURATED_EDGES: list[dict[str, Any]] = [
    {
        "a": "GFPT1",
        "b": "OGT",
        "confidence": 0.50,
        "pubmed_doi": "10.1172/JCI94844",
        "reason": (
            "GFPT1 is the rate-limiting enzyme of the hexosamine biosynthetic "
            "pathway; its product UDP-GlcNAc is the substrate for OGT "
            "(Taparra et al. 2018, JCI)."
        ),
    },
    {
        "a": "OGT",
        "b": "YAP1",
        "confidence": 0.50,
        "pubmed_doi": "10.1073/pnas.1619889114",
        "reason": (
            "O-GlcNAcylation of YAP at Ser109 by OGT regulates YAP "
            "transcriptional activity (Peng et al. 2017, PNAS)."
        ),
    },
    {
        "a": "MGAT5",
        "b": "ITGB1",
        "confidence": 0.50,
        "pubmed_doi": "10.1016/j.cell.2007.01.049",
        "reason": (
            "MGAT5-mediated N-glycan branching on integrins regulates "
            "integrin clustering and mechanosensing (Lau et al. 2007, Cell)."
        ),
    },
    {
        "a": "B4GALT1",
        "b": "ITGB1",
        "confidence": 0.45,
        "pubmed_doi": "10.1074/jbc.M807059200",
        "reason": (
            "Beta-1,4-galactosyltransferase modifies integrin N-glycans, "
            "altering integrin function (Isaji et al. 2009, JBC)."
        ),
    },
    {
        "a": "GFPT1",
        "b": "MGAT5",
        "confidence": 0.45,
        "pubmed_doi": "10.1016/j.cell.2007.01.049",
        "reason": (
            "GFPT1-produced UDP-GlcNAc feeds into Golgi N-glycan branching "
            "via MGAT5 (Lau et al. 2007, Cell)."
        ),
    },
]


# ---------------------------------------------------------------------------
# STRING REST calls
# ---------------------------------------------------------------------------


def fetch_network(genes: list[str], confidence_threshold: int) -> list[dict[str, Any]]:
    """Fetch the STRING network for a batch of gene symbols.

    Parameters
    ----------
    genes : list[str]
        Gene symbols to query.
    confidence_threshold : int
        STRING ``required_score`` in the 0–1000 scale (STRING multiplies
        the 0–1 confidence by 1000 internally).
    """
    url = f"{STRING_API}/network"
    params = {
        "identifiers": "%0d".join(genes),
        "species": SPECIES,
        "required_score": confidence_threshold,
        "caller_identity": CALLER_IDENTITY,
    }
    resp = requests.get(url, params=params, timeout=REQUEST_TIMEOUT)
    resp.raise_for_status()
    data = resp.json()
    if not isinstance(data, list):
        raise RuntimeError(
            f"unexpected STRING response format: {type(data).__name__}"
        )
    return data


# ---------------------------------------------------------------------------
# Graph construction
# ---------------------------------------------------------------------------


def build_graph(edges: list[dict[str, Any]]) -> nx.Graph:
    """Build a weighted networkx graph from STRING network rows.

    Edge weight = ``-log(confidence)`` (confidence in ``[0, 1]``),
    so Dijkstra shortest paths correspond to highest-confidence
    biological routes. Every STRING edge is tagged
    ``source="string"`` so downstream consumers (evidence JSON,
    drill-down UI) can distinguish STRING edges from curated
    literature edges inserted by :func:`add_curated_edges`.
    """
    graph = nx.Graph()
    for edge in edges:
        a = edge["preferredName_A"]
        b = edge["preferredName_B"]
        score = float(edge.get("score", 0.0))
        if score <= 0.0:
            continue
        weight = -math.log(score)
        if graph.has_edge(a, b):
            if weight < graph[a][b]["weight"]:
                graph[a][b]["weight"] = weight
                graph[a][b]["confidence"] = score
                graph[a][b]["source"] = "string"
                graph[a][b].pop("pubmed_doi", None)
                graph[a][b].pop("reason", None)
        else:
            graph.add_edge(a, b, weight=weight, confidence=score, source="string")
    return graph


def add_curated_edges(graph: nx.Graph) -> int:
    """Overlay curated literature edges onto the STRING graph.

    A curated edge replaces the corresponding STRING edge only when
    its confidence is strictly higher (lower `-log(confidence)`
    weight) — we never weaken STRING evidence with curated text.
    Returns the number of edges actually added or upgraded.
    """
    n_added = 0
    for entry in CURATED_EDGES:
        a, b = entry["a"], entry["b"]
        conf = float(entry["confidence"])
        if conf <= 0.0:
            continue
        weight = -math.log(conf)
        if graph.has_edge(a, b) and graph[a][b]["weight"] <= weight:
            # Existing STRING edge is equally or more confident — leave it
            continue
        graph.add_edge(
            a,
            b,
            weight=weight,
            confidence=conf,
            source="curated",
            pubmed_doi=entry["pubmed_doi"],
            reason=entry["reason"],
        )
        n_added += 1
    return n_added


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """CLI for the pathway-prior generator.

    The only tunable is ``--confidence-threshold`` because every other
    knob (species, aggregation method, curated-edge list) is policy
    that lives in this file, not something a user should twist at the
    command line without also updating SCIENCE.md.
    """
    parser = argparse.ArgumentParser(
        description="Regenerate data/priors/pathway_ranks.json and pathway_evidence.json from STRING v12.",
    )
    parser.add_argument(
        "--confidence-threshold",
        type=int,
        default=DEFAULT_CONFIDENCE_THRESHOLD,
        metavar="N",
        help=(
            "STRING required_score in the 0-1000 scale. Default 400 (=0.40, medium tier) "
            "per the policy documented in this file. Raising to 700 reproduces the "
            "STRING high-confidence subnetwork but will likely exclude curated edges."
        ),
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    confidence_threshold = int(args.confidence_threshold)
    if not 0 <= confidence_threshold <= 1000:
        print(
            f"[pathway] --confidence-threshold must be in [0, 1000], got {confidence_threshold}",
            file=sys.stderr,
        )
        return 1

    glycocalyx_genes = get_glycocalyx_genes()
    mechano_genes = get_mechano_signature()
    all_genes = sorted(set(glycocalyx_genes) | set(mechano_genes))

    print(
        f"[pathway] STRING threshold = {confidence_threshold / 1000:.2f} "
        f"({confidence_threshold}/1000)"
    )
    print(
        f"[pathway] fetching STRING v12 network for {len(all_genes)} genes ..."
    )
    try:
        edges = fetch_network(all_genes, confidence_threshold=confidence_threshold)
    except requests.RequestException as exc:
        print(f"[pathway] STRING request failed: {exc}", file=sys.stderr)
        return 1

    print(f"[pathway] received {len(edges)} STRING edges")
    graph = build_graph(edges)
    n_curated = add_curated_edges(graph)
    print(
        f"[pathway] overlaid {n_curated}/{len(CURATED_EDGES)} curated "
        f"literature edges (the rest were already covered by STRING at "
        f"equal or higher confidence)"
    )

    print(
        f"[pathway] graph: {graph.number_of_nodes()} nodes, "
        f"{graph.number_of_edges()} edges"
    )

    # Compute per-source scores
    scores: dict[str, float] = {}
    details_all: dict[str, dict[str, dict[str, Any]]] = {}
    for gene in glycocalyx_genes:
        score, details = median_inverse_shortest_path(graph, gene, mechano_genes)
        scores[gene] = score
        details_all[gene] = details

    # Rank glycocalyx genes by score, descending; break ties alphabetically
    # so the ranking is deterministic across reruns.
    ranked = sorted(scores.items(), key=lambda kv: (-kv[1], kv[0]))
    ranks = {gene: i + 1 for i, (gene, _) in enumerate(ranked)}

    # Assemble pathway_ranks.json payload
    genes_payload: dict[str, Any] = {}
    for gene in glycocalyx_genes:
        per_target: dict[str, Any] = {}
        for target, detail in details_all[gene].items():
            per_target[target] = {
                "distance": detail["distance"],
                "inverse": detail["inverse"],
                "path": detail["path"],
            }
        genes_payload[gene] = {
            "rank": ranks[gene],
            "score": scores[gene],
            "per_mechano_gene": per_target,
        }

    ranks_output = {
        "metadata": {
            "source": "STRING v12",
            "string_confidence_threshold": confidence_threshold / 1000.0,
            # Kept for backward-compat with earlier consumers that look
            # for the generic key; new consumers should prefer
            # ``string_confidence_threshold``.
            "confidence_threshold": confidence_threshold / 1000.0,
            "species": SPECIES,
            "aggregation": "median_inverse_shortest_path",
            "generated_utc": datetime.now(tz=timezone.utc).isoformat(),
            "n_glycocalyx_genes": len(glycocalyx_genes),
            "n_mechano_genes": len(mechano_genes),
            "n_graph_nodes": graph.number_of_nodes(),
            "n_graph_edges": graph.number_of_edges(),
            "curated_edge_count": len(CURATED_EDGES),
            "curated_edges_overlaid": n_curated,
            "curated_edge_policy": CURATED_EDGE_POLICY,
        },
        "genes": genes_payload,
    }

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    ranks_path = OUTPUT_DIR / "pathway_ranks.json"
    ranks_path.write_text(
        json.dumps(ranks_output, indent=2, sort_keys=False), encoding="utf-8"
    )
    print(f"[pathway] wrote {ranks_path.relative_to(_REPO_ROOT)}")

    # Assemble pathway_evidence.json: per (g, m) pair, edges along the
    # path. Every edge carries its source (``string`` or ``curated``);
    # curated edges additionally carry ``pubmed_doi`` and ``reason`` so
    # the drill-down UI can surface the primary literature directly.
    evidence: dict[str, Any] = {}
    for gene in glycocalyx_genes:
        evidence[gene] = {}
        for target in mechano_genes:
            detail = details_all[gene][target]
            path = detail["path"]
            path_edges = []
            for i in range(len(path) - 1):
                a, b = path[i], path[i + 1]
                if graph.has_edge(a, b):
                    attrs = graph[a][b]
                    edge_entry: dict[str, Any] = {
                        "from": a,
                        "to": b,
                        "confidence": float(attrs["confidence"]),
                        "source": str(attrs.get("source", "string")),
                    }
                    if attrs.get("source") == "curated":
                        edge_entry["pubmed_doi"] = str(attrs.get("pubmed_doi", ""))
                        edge_entry["reason"] = str(attrs.get("reason", ""))
                    path_edges.append(edge_entry)
            evidence[gene][target] = {
                "distance": detail["distance"],
                "path": path,
                "path_edges": path_edges,
            }

    evidence_path = OUTPUT_DIR / "pathway_evidence.json"
    evidence_path.write_text(
        json.dumps(evidence, indent=2, sort_keys=False), encoding="utf-8"
    )
    print(f"[pathway] wrote {evidence_path.relative_to(_REPO_ROOT)}")

    # Summary print — top 5 and bottom 5 by score
    print("\n[pathway] Top 5 glycocalyx genes by pathway score:")
    for gene, score in ranked[:5]:
        print(f"  {gene:10s}  rank {ranks[gene]:2d}  score {score:.4f}")
    print("[pathway] Bottom 5:")
    for gene, score in ranked[-5:]:
        print(f"  {gene:10s}  rank {ranks[gene]:2d}  score {score:.4f}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
