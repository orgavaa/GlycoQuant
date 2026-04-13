"""Generate the STRING v12 pathway prior for Tab 2.

Run locally (requires network access to ``string-db.org``):

    python scripts/generate_pathway_priors.py

Writes two committed JSON artifacts:

- ``data/priors/pathway_ranks.json`` — per-glycocalyx-gene median
  inverse shortest-path score against the 15-gene mechanotransduction
  signature, with per-target distances + paths.
- ``data/priors/pathway_evidence.json`` — drill-down data for the
  Tab 2 UI: for every (glycocalyx gene, mechano gene) pair, the
  shortest path and each edge's STRING confidence score.

The script is idempotent — re-running it overwrites the JSON files
and updates the ``metadata.generated_utc`` timestamp. It never
touches Geneformer; that prior is generated separately on Colab.
"""
from __future__ import annotations

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
CONFIDENCE_THRESHOLD = 400  # 0.4 * 1000 — medium confidence, captures hexosamine pathway edges
CALLER_IDENTITY = "glycoquant-pathway-prior"
OUTPUT_DIR = _REPO_ROOT / "data" / "priors"
REQUEST_TIMEOUT = 60.0


# ---------------------------------------------------------------------------
# STRING REST calls
# ---------------------------------------------------------------------------


def fetch_network(genes: list[str]) -> list[dict[str, Any]]:
    """Fetch the STRING network for a batch of gene symbols."""
    url = f"{STRING_API}/network"
    params = {
        "identifiers": "%0d".join(genes),
        "species": SPECIES,
        "required_score": CONFIDENCE_THRESHOLD,
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
    biological routes.
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
        else:
            graph.add_edge(a, b, weight=weight, confidence=score)
    return graph


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> int:
    glycocalyx_genes = get_glycocalyx_genes()
    mechano_genes = get_mechano_signature()
    all_genes = sorted(set(glycocalyx_genes) | set(mechano_genes))

    print(
        f"[pathway] fetching STRING v12 network for {len(all_genes)} genes "
        f"(confidence >= {CONFIDENCE_THRESHOLD / 1000:.2f}) ..."
    )
    try:
        edges = fetch_network(all_genes)
    except requests.RequestException as exc:
        print(f"[pathway] STRING request failed: {exc}", file=sys.stderr)
        return 1

    print(f"[pathway] received {len(edges)} edges")
    graph = build_graph(edges)

    # Add curated literature-backed edges that STRING may miss.
    # These are well-established biochemical connections from published
    # glycocalyx–mechanotransduction literature.
    CURATED_EDGES = [
        # GFPT1 → OGT: GFPT1 is the rate-limiting enzyme of the hexosamine
        # biosynthetic pathway; its product (UDP-GlcNAc) is the substrate
        # for OGT. Taparra et al. (2018) J Clin Invest.
        ("GFPT1", "OGT", 0.5),
        # OGT → YAP1: O-GlcNAcylation of YAP at Ser109 by OGT regulates
        # YAP transcriptional activity. Peng et al. (2017) PNAS.
        ("OGT", "YAP1", 0.5),
        # MGAT5 → ITGB1: MGAT5-mediated N-glycan branching on integrins
        # regulates integrin clustering and mechanosensing.
        # Lau et al. (2007) Cell 129:123-134.
        ("MGAT5", "ITGB1", 0.5),
        # B4GALT1 → ITGB1: beta-1,4-galactosyltransferase modifies integrin
        # N-glycans. Isaji et al. (2009) JBC 284:12207.
        ("B4GALT1", "ITGB1", 0.45),
        # GFPT1 → MGAT5: GFPT1-produced UDP-GlcNAc feeds into N-glycan
        # branching via the Golgi. Lau et al. (2007) Cell.
        ("GFPT1", "MGAT5", 0.45),
    ]
    n_curated = 0
    for a, b, conf in CURATED_EDGES:
        weight = -math.log(conf)
        if not graph.has_edge(a, b) or graph[a][b]["weight"] > weight:
            graph.add_edge(a, b, weight=weight, confidence=conf)
            n_curated += 1
    print(f"[pathway] added {n_curated} curated literature edges")

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

    # Rank glycocalyx genes by score, descending
    ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
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
            "confidence_threshold": CONFIDENCE_THRESHOLD / 1000.0,
            "species": SPECIES,
            "aggregation": "median_inverse_shortest_path",
            "generated_utc": datetime.now(tz=timezone.utc).isoformat(),
            "n_glycocalyx_genes": len(glycocalyx_genes),
            "n_mechano_genes": len(mechano_genes),
            "n_graph_nodes": graph.number_of_nodes(),
            "n_graph_edges": graph.number_of_edges(),
        },
        "genes": genes_payload,
    }

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    ranks_path = OUTPUT_DIR / "pathway_ranks.json"
    ranks_path.write_text(
        json.dumps(ranks_output, indent=2, sort_keys=False), encoding="utf-8"
    )
    print(f"[pathway] wrote {ranks_path.relative_to(_REPO_ROOT)}")

    # Assemble pathway_evidence.json: per (g, m) pair, edges along the path
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
                    path_edges.append(
                        {
                            "from": a,
                            "to": b,
                            "confidence": float(graph[a][b]["confidence"]),
                        }
                    )
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
