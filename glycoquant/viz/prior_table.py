"""Plotly visualizations for the perturbation-prior ranking tab.

These figures intentionally frame STRING as an undirected
functional-association prior. They are hypothesis-prior views, not
causal pathway diagrams.
"""
from __future__ import annotations

import math
from typing import Any

import plotly.graph_objects as go

from glycoquant.predictor.ranking_metadata import (
    GENE_CLASS_LEGEND,
    SEMANTIC_COLORS,
    SIGNATURE_LAYERS,
    aliased_path,
    edge_cost_from_confidence,
    gene_class_label,
    semantic_color,
    target_alias,
    target_layer_label,
)


WARNING_TEXT = (
    "Undirected STRING functional association. Path layout, edge order, and "
    "shortest paths do not imply causal signalling, temporal order, or "
    "cell-type-specific mechanism."
)


def plot_drill_down_heatmap(
    geneformer_row: dict[str, float] | None = None,
    pathway_row: dict[str, float] | None = None,
    mechano_genes: list[str] | None = None,
    *,
    evidence_per_target: dict[str, dict[str, Any]] | None = None,
    title: str = "Per-target STRING proximity",
) -> go.Figure:
    """Compact per-gene heatmap grouped by signature layer.

    Grey cells denote unreachable targets under the retained graph, not
    low-but-real proximity.
    """
    if mechano_genes is None:
        return _placeholder("Select a gene to view proximity heatmap")

    rows: list[list[float]] = []
    reach_rows: list[list[bool]] = []
    row_labels: list[str] = []

    if pathway_row is not None:
        values = [float(pathway_row.get(g, 0.0) or 0.0) for g in mechano_genes]
        reachable = [_is_reachable(g, values[i], evidence_per_target) for i, g in enumerate(mechano_genes)]
        rows.append(values)
        reach_rows.append(reachable)
        row_labels.append("STRING functional-association prior")

    if geneformer_row is not None:
        rows.append([float(geneformer_row.get(g, 0.0) or 0.0) for g in mechano_genes])
        reach_rows.append([True for _ in mechano_genes])
        row_labels.append("Geneformer sensitivity prior")

    if not rows:
        return _placeholder("No STRING proximity data available for this gene")

    aliases = [target_alias(g) for g in mechano_genes]
    x_positions = list(range(len(mechano_genes)))
    z = []
    text = []
    customdata = []
    for row_i, row in enumerate(rows):
        z_row = []
        text_row = []
        custom_row = []
        for col_i, value in enumerate(row):
            target = mechano_genes[col_i]
            reachable = reach_rows[row_i][col_i]
            if row_labels[row_i].startswith("STRING") and not reachable:
                z_row.append(0.0)
                text_row.append("unreachable")
            else:
                z_row.append(value)
                text_row.append(f"{value:.2f}")
            entry = (evidence_per_target or {}).get(target, {})
            path = aliased_path(list(entry.get("path", [])))
            custom_row.append(
                [
                    target,
                    target_layer_label(target) or "unknown",
                    "reachable" if reachable else "unreachable",
                    entry.get("distance"),
                    len(path) - 1 if path else None,
                    " -- ".join(path) if path else "No retained path",
                ]
            )
        z.append(z_row)
        text.append(text_row)
        customdata.append(custom_row)

    fig = go.Figure(
        data=go.Heatmap(
            z=z,
            x=x_positions,
            y=row_labels,
            colorscale=_proximity_colorscale(),
            zmin=0,
            zmax=1,
            colorbar=dict(
                title=dict(text="STRING proximity", font=dict(size=11)),
                thickness=12,
                len=0.72,
                tickfont=dict(size=9),
                outlinewidth=0,
            ),
            customdata=customdata,
            hovertemplate=(
                "Target: %{customdata[0]}<br>"
                "Layer: %{customdata[1]}<br>"
                "Evidence mode: %{y}<br>"
                "Status: %{customdata[2]}<br>"
                "Proximity: %{z:.3f}<br>"
                "Network distance: %{customdata[3]}<br>"
                "Path length: %{customdata[4]}<br>"
                "Path: %{customdata[5]}<extra></extra>"
            ),
            text=text,
            texttemplate="%{text}",
            textfont=dict(size=9, color="#111827"),
        )
    )
    _add_signature_group_shapes(fig, mechano_genes, y=1.22)
    fig.update_layout(
        title=dict(
            text=f"{title}<br><sup>Darker = higher STRING proximity. Grey = unreachable under the retained confidence-threshold network.</sup>",
            font=dict(size=13, color="#111827"),
            x=0,
        ),
        template="plotly_white",
        font=dict(family="Inter, sans-serif", size=11, color="#111827"),
        margin=dict(l=165, r=20, t=72, b=78),
        height=max(170, 62 * len(rows) + 120),
        xaxis=dict(tickangle=-45, tickfont=dict(size=10), side="bottom", tickmode="array", tickvals=x_positions, ticktext=aliases),
        yaxis=dict(tickfont=dict(size=10)),
        plot_bgcolor="#fff",
        paper_bgcolor="#fff",
    )
    return fig


def plot_panel_summary(
    genes: list[dict[str, Any]],
    mechano_genes: list[str],
) -> go.Figure:
    """Lollipop ranking plot over current STRING proximity scores."""
    if not genes:
        return _placeholder("No gene data available")

    sorted_genes = sorted(
        genes,
        key=lambda g: (
            g.get("pathway_rank") is None,
            int(g.get("pathway_rank") or 10_000),
            str(g.get("gene", "")),
        ),
    )
    names = [str(g["gene"]) for g in sorted_genes]

    fig = go.Figure()

    for g in sorted_genes:
        gene = str(g["gene"])
        score = float(g.get("pathway_score") or 0.0)
        fig.add_trace(
            go.Scatter(
                x=[0, score],
                y=[gene, gene],
                mode="lines",
                line=dict(width=1.5, color="#e5e7eb"),
                hoverinfo="skip",
                showlegend=False,
            )
        )

    for legend in GENE_CLASS_LEGEND:
        label = legend["label"]
        class_genes = [g for g in sorted_genes if gene_class_label(str(g["gene"])) == label]
        if not class_genes:
            continue
        x = [float(g.get("pathway_score") or 0.0) for g in class_genes]
        y = [str(g["gene"]) for g in class_genes]
        sizes = []
        hover = []
        for g in class_genes:
            reachable = _reachable_count(g)
            sizes.append(9 + reachable * 1.6)
            hover.append(
                "<b>{gene}</b><br>"
                "Rank: {rank}<br>"
                "STRING proximity score: {score:.3f}<br>"
                "Gene class: {gene_class}<br>"
                "Reachable signature targets: {reachable}/{total}<br>"
                "Degree-matched null correction: off".format(
                    gene=g["gene"],
                    rank=g.get("pathway_rank", "NA"),
                    score=float(g.get("pathway_score") or 0.0),
                    gene_class=label,
                    reachable=reachable,
                    total=len(mechano_genes),
                )
            )
        fig.add_trace(
            go.Scatter(
                x=x,
                y=y,
                mode="markers",
                marker=dict(
                    size=sizes,
                    color=legend["color"],
                    line=dict(width=1, color="#ffffff"),
                    opacity=0.94,
                ),
                name=label,
                text=hover,
                hovertemplate="%{text}<extra></extra>",
            )
        )

    fig.add_annotation(
        text="Degree-matched null correction: not active.",
        x=0,
        y=1.08,
        xref="paper",
        yref="paper",
        xanchor="left",
        showarrow=False,
        font=dict(size=11, color="#92400e"),
        bgcolor="#fffbeb",
        bordercolor="#fcd34d",
        borderpad=5,
    )
    fig.update_layout(
        template="plotly_white",
        font=dict(family="Inter, sans-serif", size=11),
        xaxis=dict(
            title="STRING proximity score",
            range=[-0.03, 1.03],
            gridcolor="#f3f4f6",
            zeroline=False,
        ),
        yaxis=dict(
            categoryorder="array",
            categoryarray=list(reversed(names)),
            tickfont=dict(size=10),
        ),
        legend=dict(
            orientation="h",
            yanchor="bottom",
            y=1.12,
            xanchor="right",
            x=1,
            font=dict(size=10),
            title=None,
        ),
        margin=dict(l=92, r=20, t=88, b=54),
        height=max(430, 23 * len(names) + 120),
        plot_bgcolor="#fff",
        paper_bgcolor="#fff",
    )
    return fig


def plot_signature_matrix(
    genes: list[dict[str, Any]],
    mechano_genes: list[str],
    evidence_by_gene: dict[str, dict[str, dict[str, Any]]] | None = None,
) -> go.Figure:
    """22 x 15 all-gene matrix of STRING proximity to signature targets."""
    if not genes:
        return _placeholder("No matrix data available")

    evidence_by_gene = evidence_by_gene or {}
    sorted_genes = sorted(
        genes,
        key=lambda g: (
            g.get("pathway_rank") is None,
            int(g.get("pathway_rank") or 10_000),
            str(g.get("gene", "")),
        ),
    )
    y_genes = [str(g["gene"]) for g in sorted_genes]
    target_labels = [target_alias(g) for g in mechano_genes]
    x_positions = list(range(len(mechano_genes)))

    z: list[list[float]] = []
    text: list[list[str]] = []
    customdata: list[list[list[Any]]] = []
    for g in sorted_genes:
        gene = str(g["gene"])
        per_target = g.get("per_target_scores", {}) or {}
        row = []
        text_row = []
        custom_row = []
        for target in mechano_genes:
            entry = evidence_by_gene.get(gene, {}).get(target, {})
            value = float(per_target.get(target, 0.0) or 0.0)
            reachable = bool(entry.get("path")) or value > 0
            if not reachable:
                row.append(0.0)
                text_row.append("unreachable")
            else:
                row.append(value)
                text_row.append(f"{value:.2f}")
            path = aliased_path(list(entry.get("path", [])))
            custom_row.append(
                [
                    gene,
                    target,
                    target_layer_label(target) or "unknown",
                    "reachable" if reachable else "unreachable",
                    entry.get("distance"),
                    len(path) - 1 if path else None,
                    " -- ".join(path) if path else "No retained path",
                    gene_class_label(gene),
                ]
            )
        z.append(row)
        text.append(text_row)
        customdata.append(custom_row)

    fig = go.Figure()
    fig.add_trace(
        go.Heatmap(
            z=z,
            x=x_positions,
            y=y_genes,
            colorscale=_proximity_colorscale(),
            zmin=0,
            zmax=1,
            colorbar=dict(
                title=dict(text="STRING proximity", font=dict(size=11)),
                thickness=12,
                len=0.82,
                tickfont=dict(size=9),
                outlinewidth=0,
            ),
            customdata=customdata,
            hovertemplate=(
                "Perturbation gene: %{customdata[0]}<br>"
                "Target gene: %{customdata[1]}<br>"
                "Signature layer: %{customdata[2]}<br>"
                "Gene class: %{customdata[7]}<br>"
                "Status: %{customdata[3]}<br>"
                "Proximity: %{z:.3f}<br>"
                "Network distance: %{customdata[4]}<br>"
                "Path length: %{customdata[5]}<br>"
                "Selected path: %{customdata[6]}<extra></extra>"
            ),
            text=text,
            texttemplate="%{text}",
            textfont=dict(size=8, color="#111827"),
        )
    )
    fig.add_trace(
        go.Scatter(
            x=[-0.7 for _ in y_genes],
            y=y_genes,
            mode="markers",
            marker=dict(
                symbol="square",
                size=12,
                color=[semantic_color(gene_class_label(g)) for g in y_genes],
                line=dict(width=0.5, color="#ffffff"),
            ),
            text=[gene_class_label(g) for g in y_genes],
            hovertemplate="Gene class: %{text}<extra></extra>",
            showlegend=False,
        )
    )
    _add_signature_group_shapes(fig, mechano_genes, y=1.09)
    fig.add_annotation(
        text="gene class",
        x=-0.7,
        y=1.025,
        xref="x",
        yref="paper",
        showarrow=False,
        font=dict(size=9, color="#6b7280"),
        textangle=-45,
    )
    fig.update_layout(
        template="plotly_white",
        font=dict(family="Inter, sans-serif", size=11, color="#111827"),
        xaxis=dict(
            tickangle=-45,
            tickfont=dict(size=9),
            tickmode="array",
            tickvals=x_positions,
            ticktext=target_labels,
            range=[-1.2, len(mechano_genes) - 0.35],
            gridcolor="#f3f4f6",
        ),
        yaxis=dict(
            categoryorder="array",
            categoryarray=list(reversed(y_genes)),
            tickfont=dict(size=10),
        ),
        margin=dict(l=94, r=20, t=82, b=86),
        height=max(520, 21 * len(y_genes) + 130),
        plot_bgcolor="#fff",
        paper_bgcolor="#fff",
    )
    return fig


def plot_pathway_network(
    gene: str,
    evidence_per_target: dict[str, dict[str, Any]],
    mechano_genes: list[str],
    *,
    selected_target: str | None = None,
    network_mode: str = "selected",
) -> go.Figure:
    """STRING functional-association proximity map.

    Default mode draws only the selected target path to avoid implying a
    dense causal mechanism. The all-path mode is still undirected.
    """
    selected_target = selected_target or (mechano_genes[0] if mechano_genes else None)
    if network_mode not in {"selected", "all"}:
        network_mode = "selected"

    target_entries: list[tuple[str, dict[str, Any], bool]] = []
    for target in mechano_genes:
        entry = evidence_per_target.get(target, {})
        if not entry.get("path"):
            continue
        include = network_mode == "all" or target == selected_target
        if include:
            target_entries.append((target, entry, target == selected_target))

    if not target_entries:
        label = target_alias(selected_target or "")
        return _placeholder(f"No retained STRING path to {label} at the current confidence threshold.")

    edge_records: dict[tuple[str, str], dict[str, Any]] = {}
    node_targets: set[str] = set()
    nodes: set[str] = {gene}
    selected_edges: set[tuple[str, str]] = set()
    for target, entry, is_selected in target_entries:
        path = list(entry.get("path", []))
        node_targets.add(target)
        nodes.update(path)
        for edge in entry.get("path_edges", []):
            a = str(edge.get("from", ""))
            b = str(edge.get("to", ""))
            if not a or not b:
                continue
            key = tuple(sorted((a, b)))
            conf = float(edge.get("confidence") or 0.0)
            prev = edge_records.get(key)
            if prev is None or conf > float(prev.get("confidence") or 0.0):
                edge_records[key] = edge
            if is_selected:
                selected_edges.add(key)

    positions = _network_positions(gene, nodes, mechano_genes, node_targets)
    fig = go.Figure()

    for key, edge in edge_records.items():
        a, b = key
        if a not in positions or b not in positions:
            continue
        conf = float(edge.get("confidence") or 0.0)
        x0, y0 = positions[a]
        x1, y1 = positions[b]
        highlighted = network_mode == "selected" or key in selected_edges
        opacity = (0.18 + 0.72 * max(0.0, min(1.0, conf))) if highlighted else 0.16
        width = (0.8 + 4.6 * max(0.0, min(1.0, conf))) if highlighted else 1.0
        source = _edge_source_label(edge)
        cost = edge_cost_from_confidence(conf)
        if cost is not None:
            hover_text = (
                f"{a} -- {b}<br>"
                f"Confidence: {conf:.3f}<br>"
                f"Source: {source}<br>"
                f"Edge cost: {cost:.3f}"
            )
        else:
            hover_text = (
                f"{a} -- {b}<br>"
                f"Confidence: {conf:.3f}<br>"
                f"Source: {source}<br>"
                "Edge cost: NA"
            )
        fig.add_trace(
            go.Scatter(
                x=[x0, x1],
                y=[y0, y1],
                mode="lines",
                line=dict(width=width, color=f"rgba(100,116,139,{opacity})"),
                text=[hover_text],
                hovertemplate="%{text}<extra></extra>",
                showlegend=False,
            )
        )

    for node, (x, y) in positions.items():
        role, color = _node_role_and_color(node, gene, mechano_genes)
        label = target_alias(node) if node in mechano_genes else node
        fig.add_trace(
            go.Scatter(
                x=[x],
                y=[y],
                mode="markers+text",
                marker=dict(
                    size=18 if node == gene else 13 if node in mechano_genes else 10,
                    color=color,
                    line=dict(width=1.2, color="#ffffff"),
                ),
                text=[label],
                textposition="top center",
                textfont=dict(size=9, color="#111827"),
                hovertemplate=f"<b>{label}</b><br>Role/class: {role}<extra></extra>",
                showlegend=False,
            )
        )

    fig.add_annotation(
        text="Undirected STRING functional-association map. Layout is optimized for readability only; it is not causal direction.",
        x=0.5,
        y=-0.1,
        xref="paper",
        yref="paper",
        showarrow=False,
        font=dict(size=10, color="#6b7280"),
        bgcolor="#ffffff",
    )
    fig.update_layout(
        template="plotly_white",
        font=dict(family="Inter, sans-serif", size=11),
        xaxis=dict(visible=False, range=[-0.08, 1.08]),
        yaxis=dict(visible=False, range=[-0.08, 1.08]),
        margin=dict(l=20, r=20, t=18, b=54),
        height=max(330, 18 * len(nodes) + 150),
        plot_bgcolor="#fff",
        paper_bgcolor="#fff",
    )
    return fig


def plot_prior_ranking_table(
    ranking_df=None,
    title: str = "Perturbation prioritization",
) -> go.Figure:
    """Legacy table figure, kept for backward compatibility."""
    if ranking_df is None:
        return _placeholder("No ranking data")
    required = {"gene", "pathway_rank", "pathway_score"}
    missing = required - set(ranking_df.columns)
    if missing:
        raise ValueError(f"missing required columns: {sorted(missing)}")
    columns = ["gene", "pathway_rank", "pathway_score"]
    if "geneformer_rank" in ranking_df.columns:
        columns.insert(1, "geneformer_rank")
    if "geneformer_score" in ranking_df.columns:
        insert_at = columns.index("pathway_rank")
        columns.insert(insert_at, "geneformer_score")
    fig = go.Figure(
        data=[
            go.Table(
                header=dict(values=columns, fill_color="#f9fafb", align="left"),
                cells=dict(values=[ranking_df[col].tolist() for col in columns], align="left"),
            )
        ]
    )
    fig.update_layout(title=title, template="plotly_white", height=320)
    return fig


def _reachable_count(gene_entry: dict[str, Any]) -> int:
    names = gene_entry.get("reachable_signature_target_names")
    if isinstance(names, list):
        return len({str(v) for v in names})
    raw = gene_entry.get("reachable_signature_targets")
    if isinstance(raw, (int, float)) and math.isfinite(float(raw)):
        return max(0, int(raw))
    per_target = gene_entry.get("per_target_scores", {}) or {}
    return sum(1 for value in per_target.values() if isinstance(value, (int, float)) and value > 0)


def _is_reachable(target: str, value: float, evidence: dict[str, dict[str, Any]] | None) -> bool:
    if evidence is not None and target in evidence:
        return bool(evidence[target].get("path")) or bool(evidence[target].get("distance") is not None)
    return value > 0


def _proximity_colorscale() -> list[list[Any]]:
    return [
        [0.0, SEMANTIC_COLORS["unreachable"]],
        [0.0001, "#f8fafc"],
        [0.25, "#dbeafe"],
        [0.5, "#93c5fd"],
        [0.75, "#3b82f6"],
        [1.0, "#1e3a8a"],
    ]


def _add_signature_group_shapes(fig: go.Figure, mechano_genes: list[str], *, y: float) -> None:
    start = 0
    for layer in SIGNATURE_LAYERS:
        genes = [g for g in layer["genes"] if g in mechano_genes]
        if not genes:
            continue
        indices = [mechano_genes.index(g) for g in genes]
        x0 = min(indices) - 0.5
        x1 = max(indices) + 0.5
        if x0 > -0.5:
            fig.add_vline(x=x0, line_width=1, line_color="#e5e7eb")
        fig.add_annotation(
            text=str(layer["short_label"]),
            x=(x0 + x1) / 2,
            y=y,
            xref="x",
            yref="paper",
            showarrow=False,
            font=dict(size=9, color="#6b7280"),
        )
        start += len(genes)
    if start:
        fig.add_vline(x=start - 0.5, line_width=1, line_color="#e5e7eb")


def _network_positions(
    gene: str,
    nodes: set[str],
    mechano_genes: list[str],
    reachable_targets: set[str],
) -> dict[str, tuple[float, float]]:
    positions: dict[str, tuple[float, float]] = {gene: (0.16, 0.5)}
    targets_by_layer: list[str] = [g for layer in SIGNATURE_LAYERS for g in layer["genes"] if g in reachable_targets]
    for i, target in enumerate(targets_by_layer):
        y = 0.88 - i * (0.76 / max(1, len(targets_by_layer) - 1))
        positions[target] = (0.84, y)

    intermediates = sorted(n for n in nodes if n != gene and n not in reachable_targets)
    for i, node in enumerate(intermediates):
        y = 0.84 - i * (0.68 / max(1, len(intermediates) - 1))
        positions[node] = (0.5, y)
    return positions


def _node_role_and_color(node: str, query_gene: str, mechano_genes: list[str]) -> tuple[str, str]:
    if node == query_gene:
        return "query gene", SEMANTIC_COLORS["query"]
    if node in mechano_genes:
        layer = target_layer_label(node) or "signature target"
        return layer, semantic_color(layer)
    cls = gene_class_label(node)
    if cls != "Other":
        return cls, semantic_color(cls)
    return "intermediate association node", SEMANTIC_COLORS["intermediate"]


def _edge_source_label(edge: dict[str, Any]) -> str:
    source = str(edge.get("source") or "").strip().lower()
    if source == "curated":
        return "CURATED"
    if source == "string":
        return "STRING combined"
    return "STRING combined"


def _placeholder(text: str) -> go.Figure:
    fig = go.Figure()
    fig.add_annotation(
        text=text,
        x=0.5,
        y=0.5,
        xref="paper",
        yref="paper",
        showarrow=False,
        font=dict(size=14, color="#6b7280"),
    )
    fig.update_layout(
        template="plotly_white",
        xaxis=dict(visible=False),
        yaxis=dict(visible=False),
        height=160,
        plot_bgcolor="#fff",
        paper_bgcolor="#fff",
    )
    return fig
