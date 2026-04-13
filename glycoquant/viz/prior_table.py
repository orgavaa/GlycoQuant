"""Plotly visualizations for the perturbation ranking tab.

Provides:
- ``plot_drill_down_heatmap``: 2-row heatmap (Geneformer vs Pathway scores per mechano target)
- ``plot_panel_summary``: Dot plot overview of all 22 glycocalyx genes
- ``plot_pathway_network``: Force-directed network graph for a gene's shortest paths
"""
from __future__ import annotations

import math

import numpy as np
import plotly.graph_objects as go


# Gene family classification for dot plot coloring
GENE_FAMILIES: dict[str, str] = {
    "SDC1": "Syndecans", "SDC2": "Syndecans", "SDC3": "Syndecans", "SDC4": "Syndecans",
    "GPC1": "Glypicans", "GPC3": "Glypicans", "GPC4": "Glypicans", "GPC6": "Glypicans",
    "CD44": "Hyaluronan receptors", "HMMR": "Hyaluronan receptors",
    "HAS1": "HAS enzymes", "HAS2": "HAS enzymes", "HAS3": "HAS enzymes",
    "GFPT1": "HBP enzymes", "GFPT2": "HBP enzymes", "OGT": "HBP enzymes",
    "MGAT5": "Glycosyltransferases", "B4GALT1": "Glycosyltransferases",
    "EXT1": "HS biosynthesis", "EXT2": "HS biosynthesis",
    "GALNT1": "O-glycosylation", "MUC1": "Mucins",
}

FAMILY_COLORS: dict[str, str] = {
    "Syndecans": "#2563eb",
    "Glypicans": "#059669",
    "Hyaluronan receptors": "#7c3aed",
    "HAS enzymes": "#d97706",
    "HBP enzymes": "#dc2626",
    "Glycosyltransferases": "#0891b2",
    "HS biosynthesis": "#4f46e5",
    "O-glycosylation": "#be185d",
    "Mucins": "#78716c",
}


def plot_drill_down_heatmap(
    geneformer_row: dict[str, float] | None = None,
    pathway_row: dict[str, float] | None = None,
    mechano_genes: list[str] | None = None,
    title: str = "Per-mechano-gene proximity",
) -> go.Figure:
    """1×15 or 2×15 heatmap showing per-target pathway proximity.

    Shows how close the selected glycocalyx gene is to each of the 15
    mechanotransduction targets. Dark blue = close (high score),
    light = far (low score). When Geneformer data is available, shows
    two rows for comparison.
    """
    if mechano_genes is None:
        return _placeholder("Select a gene to view proximity heatmap")

    rows = []
    row_labels = []

    if pathway_row is not None:
        rows.append([pathway_row.get(g, 0.0) for g in mechano_genes])
        row_labels.append("Pathway (STRING)")

    if geneformer_row is not None:
        rows.append([geneformer_row.get(g, 0.0) for g in mechano_genes])
        row_labels.append("Geneformer")

    if not rows:
        return _placeholder("No pathway data available for this gene")

    # Shorten mechano gene names for display
    short_names = [_shorten_gene(g) for g in mechano_genes]

    fig = go.Figure(
        data=go.Heatmap(
            z=rows,
            x=short_names,
            y=row_labels,
            colorscale="Blues",
            reversescale=False,
            zmin=0,
            zmax=1,
            colorbar=dict(
                title=dict(text="Proximity", font=dict(size=11)),
                thickness=12,
                len=0.6,
                tickfont=dict(size=9),
            ),
            hovertemplate="Target: %{x}<br>Source: %{y}<br>Score: %{z:.3f}<extra></extra>",
            text=[[f"{v:.2f}" for v in row] for row in rows],
            texttemplate="%{text}",
            textfont=dict(size=9, color="white"),
        )
    )
    fig.update_layout(
        title=None,
        template="plotly_white",
        font=dict(family="Inter, sans-serif", size=11),
        margin=dict(l=100, r=20, t=10, b=80),
        height=max(120, 60 * len(rows) + 80),
        xaxis=dict(tickangle=-45, tickfont=dict(size=10)),
        yaxis=dict(tickfont=dict(size=10)),
    )
    return fig


def plot_panel_summary(
    genes: list[dict],
    mechano_genes: list[str],
) -> go.Figure:
    """Dot plot: x=pathway score, y=gene name, size=reachable targets, color=family.

    Gives the PI an instant visual overview of the entire 22-gene panel.
    """
    if not genes:
        return _placeholder("No gene data available")

    # Sort by pathway score descending
    sorted_genes = sorted(genes, key=lambda g: g.get("pathway_score") or 0, reverse=True)

    names = []
    scores = []
    sizes = []
    colors = []
    families = []
    hover_texts = []

    for g in sorted_genes:
        gene = g["gene"]
        score = g.get("pathway_score") or 0.0
        names.append(gene)
        scores.append(score)

        # Count reachable targets (non-zero per_mechano entries)
        # This info isn't directly in the PriorGeneEntry, so estimate from score
        # A score > 0 means at least some targets are reachable
        n_reachable = max(1, int(score * 15)) if score > 0 else 0
        sizes.append(max(8, n_reachable * 3))

        family = GENE_FAMILIES.get(gene, "Other")
        families.append(family)
        colors.append(FAMILY_COLORS.get(family, "#9ca3af"))

        hover_texts.append(
            f"<b>{gene}</b><br>"
            f"Family: {family}<br>"
            f"Pathway score: {score:.3f}<br>"
            f"Rank: {g.get('pathway_rank', '—')}"
        )

    fig = go.Figure()

    # Group by family for legend
    seen_families: set[str] = set()
    for i, gene in enumerate(names):
        family = families[i]
        show_legend = family not in seen_families
        seen_families.add(family)

        fig.add_trace(go.Scatter(
            x=[scores[i]],
            y=[gene],
            mode="markers",
            marker=dict(size=sizes[i], color=colors[i], line=dict(width=0.5, color="white")),
            name=family,
            legendgroup=family,
            showlegend=show_legend,
            hovertemplate=hover_texts[i] + "<extra></extra>",
        ))

    fig.update_layout(
        template="plotly_white",
        font=dict(family="Inter, sans-serif", size=11),
        xaxis=dict(title="Pathway proximity score", range=[-0.05, 1.05], gridcolor="#f3f4f6"),
        yaxis=dict(autorange="reversed", tickfont=dict(size=10)),
        margin=dict(l=80, r=20, t=10, b=50),
        height=max(300, 24 * len(names) + 60),
        legend=dict(font=dict(size=10), bgcolor="rgba(255,255,255,0.9)"),
        plot_bgcolor="#fff",
        paper_bgcolor="#fff",
    )
    return fig


def plot_pathway_network(
    gene: str,
    evidence_per_target: dict[str, dict],
    mechano_genes: list[str],
) -> go.Figure:
    """Network graph showing shortest paths from a glycocalyx gene to all reachable mechano targets.

    Nodes: source gene (left), intermediates (middle), mechano targets (right).
    Edges: thickness proportional to STRING confidence.
    """
    # Collect all unique nodes and edges across all reachable targets
    all_nodes: set[str] = {gene}
    edge_set: dict[tuple[str, str], float] = {}  # (a, b) -> max confidence

    for target in mechano_genes:
        ev = evidence_per_target.get(target, {})
        path_edges = ev.get("path_edges", [])
        path = ev.get("path", [])
        for node in path:
            all_nodes.add(node)
        for edge in path_edges:
            a, b = edge.get("from", ""), edge.get("to", "")
            conf = edge.get("confidence", 0.0)
            key = (min(a, b), max(a, b))
            edge_set[key] = max(edge_set.get(key, 0.0), conf)

    if len(all_nodes) <= 1:
        return _placeholder(f"No reachable targets from {gene} in STRING")

    # Assign positions: source left, targets right, intermediates middle
    mechano_set = set(mechano_genes)
    source_nodes = [gene]
    target_nodes = [n for n in all_nodes if n in mechano_set and n != gene]
    intermediate_nodes = [n for n in all_nodes if n not in mechano_set and n != gene]

    # Sort for consistent layout
    target_nodes.sort()
    intermediate_nodes.sort()

    positions: dict[str, tuple[float, float]] = {}

    # Source on left
    positions[gene] = (0.0, 0.5)

    # Targets on right
    for i, t in enumerate(target_nodes):
        y = (i + 0.5) / max(len(target_nodes), 1)
        positions[t] = (1.0, y)

    # Intermediates in middle
    for i, m in enumerate(intermediate_nodes):
        y = (i + 0.5) / max(len(intermediate_nodes), 1)
        positions[m] = (0.5, y)

    fig = go.Figure()

    # Draw edges
    for (a, b), conf in edge_set.items():
        if a not in positions or b not in positions:
            continue
        x0, y0 = positions[a]
        x1, y1 = positions[b]
        width = max(0.5, conf * 4)
        opacity = max(0.2, conf * 0.8)
        fig.add_trace(go.Scatter(
            x=[x0, x1, None], y=[y0, y1, None],
            mode="lines",
            line=dict(width=width, color=f"rgba(37,99,235,{opacity})"),
            hoverinfo="skip",
            showlegend=False,
        ))

    # Draw nodes
    for node, (x, y) in positions.items():
        is_source = node == gene
        is_target = node in mechano_set
        color = "#dc2626" if is_source else "#2563eb" if is_target else "#6b7280"
        size = 16 if is_source else 12 if is_target else 8

        fig.add_trace(go.Scatter(
            x=[x], y=[y],
            mode="markers+text",
            marker=dict(size=size, color=color, line=dict(width=1, color="white")),
            text=[node],
            textposition="top center" if is_source else "bottom center" if is_target else "top center",
            textfont=dict(size=9, color=color),
            hovertemplate=f"<b>{node}</b><extra></extra>",
            showlegend=False,
        ))

    fig.update_layout(
        template="plotly_white",
        font=dict(family="Inter, sans-serif", size=11),
        xaxis=dict(visible=False, range=[-0.15, 1.15]),
        yaxis=dict(visible=False, range=[-0.1, 1.1]),
        margin=dict(l=20, r=20, t=10, b=20),
        height=max(250, 20 * len(all_nodes) + 80),
        plot_bgcolor="#fff",
        paper_bgcolor="#fff",
    )
    return fig


def plot_prior_ranking_table(
    ranking_df=None,
    title: str = "Perturbation prioritization",
) -> go.Figure:
    """Legacy table figure — kept for backward compatibility."""
    if ranking_df is None:
        return _placeholder("No ranking data")
    return _placeholder("Use the React table component instead")


def _shorten_gene(name: str) -> str:
    """Shorten mechano gene names for heatmap x-axis labels."""
    short = {
        "WWTR1": "TAZ",
        "CTGF": "CTGF",
        "CYR61": "CYR61",
        "ANKRD1": "ANKRD1",
        "PIEZO1": "PIEZO1",
    }
    return short.get(name, name)


def _placeholder(text: str) -> go.Figure:
    fig = go.Figure()
    fig.add_annotation(
        text=text, x=0.5, y=0.5,
        xref="paper", yref="paper",
        showarrow=False,
        font=dict(size=14, color="#9ca3af"),
    )
    fig.update_layout(
        template="plotly_white",
        xaxis=dict(visible=False),
        yaxis=dict(visible=False),
        height=120,
    )
    return fig
