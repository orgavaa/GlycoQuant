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


def plot_drill_down_lollipop(
    pathway_row: dict[str, float] | None,
    mechano_genes: list[str],
    *,
    evidence_per_target: dict[str, dict[str, Any]] | None = None,
) -> go.Figure:
    """Horizontal lollipop of one gene's STRING proximity to each signature target.

    Replaces the dense per-gene heatmap. Targets are grouped by signature
    layer with subtle band labels on the right; reachable targets render
    as a colored lollipop (line + dot), unreachable targets render as a
    light dashed track with an "unreachable" tag, never as a 0.00 cell.
    """
    if not mechano_genes:
        return _placeholder("Select a gene to view proximity")
    if pathway_row is None:
        return _placeholder("No STRING proximity data available for this gene")

    evidence_per_target = evidence_per_target or {}

    # Walk the targets in signature-layer order so the y-axis groups
    # cleanly into Effectors / Response / Actomyosin / Adhesion / Ion
    # channel without us needing categorical row-band shapes.
    ordered_targets: list[tuple[dict[str, Any], str]] = []
    for layer in SIGNATURE_LAYERS:
        for target in layer["genes"]:
            if target in mechano_genes:
                ordered_targets.append((layer, target))
    if not ordered_targets:
        ordered_targets = [({"label": "unknown", "color": SEMANTIC_COLORS["intermediate"]}, t) for t in mechano_genes]

    n = len(ordered_targets)
    y_positions = list(range(n, 0, -1))  # top → bottom in display order
    aliases = [target_alias(t) for _, t in ordered_targets]

    fig = go.Figure()

    # Light "track" line behind every row so the eye can follow each
    # target across the [0, 1] x-axis even when the score is small.
    for y in y_positions:
        fig.add_shape(
            type="line",
            x0=0,
            x1=1,
            y0=y,
            y1=y,
            line=dict(width=1, color="#f1f5f9"),
            layer="below",
        )

    # Subtle horizontal band per signature layer.
    band_color = "#f8fafc"
    for layer in SIGNATURE_LAYERS:
        layer_targets = [t for lyr, t in ordered_targets if lyr["label"] == layer["label"]]
        if not layer_targets:
            continue
        y_top = max(y_positions[i] for i, (lyr, _) in enumerate(ordered_targets) if lyr["label"] == layer["label"]) + 0.45
        y_bottom = min(y_positions[i] for i, (lyr, _) in enumerate(ordered_targets) if lyr["label"] == layer["label"]) - 0.45
        fig.add_shape(
            type="rect",
            x0=-0.02,
            x1=1.02,
            y0=y_bottom,
            y1=y_top,
            fillcolor=band_color,
            line=dict(width=0),
            layer="below",
            opacity=0.6,
        )

    # Lollipops — one row per target. Reachable rows draw a stem and a
    # filled dot in the layer color; unreachable rows draw a faint
    # dashed segment and an outlined empty marker labelled "unreachable".
    reachable_x: list[float] = []
    reachable_y: list[float] = []
    reachable_color: list[str] = []
    reachable_hover: list[str] = []

    unreachable_y: list[float] = []
    unreachable_hover: list[str] = []

    for i, (layer, target) in enumerate(ordered_targets):
        y = y_positions[i]
        value = float(pathway_row.get(target, 0.0) or 0.0)
        entry = evidence_per_target.get(target, {})
        reachable = bool(entry.get("path")) or value > 0
        layer_label = str(layer.get("label", ""))
        layer_color = semantic_color(layer_label)

        path = aliased_path(list(entry.get("path", [])))
        path_text = " -- ".join(path) if path else "No retained STRING path"
        distance = entry.get("distance")
        path_length = (len(path) - 1) if path else None

        if reachable and value > 0:
            # Stem
            fig.add_shape(
                type="line",
                x0=0,
                x1=value,
                y0=y,
                y1=y,
                line=dict(width=2, color=layer_color),
                layer="above",
            )
            reachable_x.append(value)
            reachable_y.append(y)
            reachable_color.append(layer_color)
            reachable_hover.append(
                "<b>{alias}</b><br>"
                "Layer: {layer}<br>"
                "STRING proximity: {value:.3f}<br>"
                "Network distance: {dist}<br>"
                "Path length: {plen}<br>"
                "Path: {path}".format(
                    alias=target_alias(target),
                    layer=layer_label,
                    value=value,
                    dist=f"{distance:.3f}" if isinstance(distance, (int, float)) else "NA",
                    plen=path_length if path_length is not None else "NA",
                    path=path_text,
                )
            )
        else:
            # Dashed faint track for unreachable rows.
            fig.add_shape(
                type="line",
                x0=0,
                x1=1,
                y0=y,
                y1=y,
                line=dict(width=1, color="#cbd5e1", dash="dot"),
                layer="above",
            )
            unreachable_y.append(y)
            unreachable_hover.append(
                "<b>{alias}</b><br>"
                "Layer: {layer}<br>"
                "Status: unreachable<br>"
                "No retained STRING path at the current confidence threshold.".format(
                    alias=target_alias(target),
                    layer=layer_label,
                )
            )

    if reachable_x:
        fig.add_trace(
            go.Scatter(
                x=reachable_x,
                y=reachable_y,
                mode="markers+text",
                marker=dict(
                    size=14,
                    color=reachable_color,
                    line=dict(width=1.5, color="#ffffff"),
                ),
                text=[f"{v:.2f}" for v in reachable_x],
                textposition="middle right",
                textfont=dict(size=10, color="#0f172a"),
                hovertext=reachable_hover,
                hovertemplate="%{hovertext}<extra></extra>",
                showlegend=False,
                cliponaxis=False,
            )
        )

    if unreachable_y:
        fig.add_trace(
            go.Scatter(
                x=[0.5 for _ in unreachable_y],
                y=unreachable_y,
                mode="text",
                text=["unreachable" for _ in unreachable_y],
                textfont=dict(size=10, color="#94a3b8"),
                hovertext=unreachable_hover,
                hovertemplate="%{hovertext}<extra></extra>",
                showlegend=False,
                cliponaxis=False,
            )
        )

    # Right-margin layer labels (one per group, centered on the group's targets).
    seen_layers: set[str] = set()
    for i, (layer, _) in enumerate(ordered_targets):
        label = str(layer.get("label", ""))
        if label in seen_layers:
            continue
        seen_layers.add(label)
        rows = [j for j, (lyr, _) in enumerate(ordered_targets) if lyr["label"] == label]
        y_center = sum(y_positions[j] for j in rows) / len(rows)
        fig.add_annotation(
            x=1.16,
            y=y_center,
            xref="paper",
            yref="y",
            text=str(layer.get("short_label", label)),
            showarrow=False,
            font=dict(size=10, color="#475569"),
            xanchor="left",
        )

    fig.update_layout(
        template="plotly_white",
        font=dict(family="Inter, sans-serif", size=11, color="#111827"),
        xaxis=dict(
            title=dict(text="STRING proximity", font=dict(size=11, color="#475569")),
            range=[-0.02, 1.18],
            gridcolor="#f1f5f9",
            zeroline=False,
            tickvals=[0, 0.25, 0.5, 0.75, 1.0],
            tickfont=dict(size=10),
        ),
        yaxis=dict(
            tickmode="array",
            tickvals=y_positions,
            ticktext=aliases,
            tickfont=dict(size=11, color="#0f172a"),
            range=[0.4, n + 0.6],
            showgrid=False,
            zeroline=False,
        ),
        margin=dict(l=110, r=110, t=24, b=44),
        height=max(360, 36 * n + 80),
        plot_bgcolor="#ffffff",
        paper_bgcolor="#ffffff",
        showlegend=False,
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
    network_mode: str = "all",
) -> go.Figure:
    """GRN-style STRING functional-association proximity map.

    Always draws every reachable target path for the query gene. When a
    target is selected, edges and nodes on its shortest path render in
    full strength; everything else is dimmed but still visible so the
    reader sees the candidate's overall network neighbourhood. The map
    is undirected — no arrowheads, no implied temporal order.
    """
    if network_mode not in {"selected", "all"}:
        network_mode = "all"

    target_entries: list[tuple[str, dict[str, Any]]] = []
    for target in mechano_genes:
        entry = evidence_per_target.get(target, {})
        if entry.get("path"):
            target_entries.append((target, entry))

    if not target_entries:
        label = target_alias(selected_target or "")
        return _placeholder(
            f"No retained STRING path to {label} at the current confidence threshold."
            if label
            else "No retained STRING paths from this gene at the current confidence threshold."
        )

    if selected_target is None or selected_target not in {t for t, _ in target_entries}:
        selected_target = target_entries[0][0]

    edge_records: dict[tuple[str, str], dict[str, Any]] = {}
    node_targets: set[str] = set()
    nodes: set[str] = {gene}
    selected_edges: set[tuple[str, str]] = set()
    selected_path_nodes: set[str] = {gene}

    for target, entry in target_entries:
        path = list(entry.get("path", []))
        node_targets.add(target)
        nodes.update(path)
        is_selected = target == selected_target
        if is_selected:
            selected_path_nodes.update(path)
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

    positions, layer_y_centers = _grn_positions(
        gene,
        target_entries,
        node_targets,
    )

    fig = go.Figure()

    # Subtle layer band labels on the right margin so the network reads
    # as Effectors / Response / Actomyosin / Adhesion / Ion channel
    # without crowding the plot itself.
    for layer_label, y_center in layer_y_centers.items():
        layer_meta = next((lyr for lyr in SIGNATURE_LAYERS if lyr["label"] == layer_label), None)
        if layer_meta is None:
            continue
        fig.add_annotation(
            x=1.04,
            y=y_center,
            xref="paper",
            yref="y",
            text=str(layer_meta.get("short_label", layer_label)),
            showarrow=False,
            font=dict(size=10, color="#475569"),
            xanchor="left",
            align="left",
        )

    # Edges. Non-selected edges are drawn first, faintly, so the
    # selected path lays on top.
    def _draw_edge(key: tuple[str, str], edge: dict[str, Any], *, highlighted: bool) -> None:
        a, b = key
        if a not in positions or b not in positions:
            return
        conf = float(edge.get("confidence") or 0.0)
        x0, y0 = positions[a]
        x1, y1 = positions[b]
        clamped = max(0.0, min(1.0, conf))
        if highlighted:
            width = 1.4 + 3.4 * clamped
            color = "rgba(15,23,42,0.85)"
        else:
            width = 0.8 + 1.2 * clamped
            color = "rgba(148,163,184,0.45)"
        source = _edge_source_label(edge)
        cost = edge_cost_from_confidence(conf)
        cost_str = f"{cost:.3f}" if cost is not None else "NA"
        a_label = target_alias(a) if a in mechano_genes else a
        b_label = target_alias(b) if b in mechano_genes else b
        hover_text = (
            f"{a_label} -- {b_label}<br>"
            f"Confidence: {conf:.3f}<br>"
            f"Source: {source}<br>"
            f"Edge cost: {cost_str}"
        )
        fig.add_trace(
            go.Scatter(
                x=[x0, x1],
                y=[y0, y1],
                mode="lines",
                line=dict(width=width, color=color),
                text=[hover_text, hover_text],
                hovertemplate="%{text}<extra></extra>",
                showlegend=False,
                hoverinfo="text",
            )
        )

    for key, edge in edge_records.items():
        if key in selected_edges:
            continue
        _draw_edge(key, edge, highlighted=False)
    for key, edge in edge_records.items():
        if key in selected_edges:
            _draw_edge(key, edge, highlighted=True)

    # Nodes — query, intermediates, signature targets. Selected-path
    # members render at full opacity; everything else dims to ~0.55 so
    # the eye still sees the neighbourhood without being distracted.
    for node, (x, y) in positions.items():
        role, color = _node_role_and_color(node, gene, mechano_genes)
        label = target_alias(node) if node in mechano_genes else node
        on_selected_path = node in selected_path_nodes
        is_query = node == gene
        is_target = node in mechano_genes
        if is_query:
            size = 22
        elif is_target:
            size = 16 if on_selected_path else 13
        else:
            size = 11 if on_selected_path else 9
        opacity = 1.0 if on_selected_path else 0.6
        outline_color = "#0f172a" if (is_target and node == selected_target) else "#ffffff"
        outline_width = 2.2 if (is_target and node == selected_target) else 1.2
        fig.add_trace(
            go.Scatter(
                x=[x],
                y=[y],
                mode="markers+text",
                marker=dict(
                    size=size,
                    color=color,
                    opacity=opacity,
                    line=dict(width=outline_width, color=outline_color),
                ),
                text=[label],
                textposition="top center",
                textfont=dict(
                    size=11 if is_query or (is_target and on_selected_path) else 10,
                    color="#0f172a" if on_selected_path else "#64748b",
                ),
                hovertemplate=f"<b>{label}</b><br>Role/class: {role}<extra></extra>",
                showlegend=False,
            )
        )

    fig.add_annotation(
        text=(
            "Undirected STRING functional-association map. "
            "Layout is optimized for readability only; it is not causal direction."
        ),
        x=0.5,
        y=-0.05,
        xref="paper",
        yref="paper",
        showarrow=False,
        font=dict(size=10, color="#6b7280"),
        bgcolor="#ffffff",
    )

    height = max(520, 110 + 70 * max(1, len(node_targets)))
    fig.update_layout(
        template="plotly_white",
        font=dict(family="Inter, sans-serif", size=11),
        xaxis=dict(visible=False, range=[-0.05, 1.02], fixedrange=True),
        yaxis=dict(visible=False, range=[-0.04, 1.06], fixedrange=True),
        margin=dict(l=24, r=70, t=18, b=58),
        height=height,
        plot_bgcolor="#ffffff",
        paper_bgcolor="#ffffff",
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
        [0.0001, "#f1f5f9"],
        [0.25, "#cbd5e1"],
        [0.5, "#60a5fa"],
        [0.75, "#2563eb"],
        [1.0, "#0f172a"],
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


def _grn_positions(
    query_gene: str,
    target_entries: list[tuple[str, dict[str, Any]]],
    reachable_targets: set[str],
) -> tuple[dict[str, tuple[float, float]], dict[str, float]]:
    """GRN-style layout: query on the left, signature targets stacked on
    the right grouped by layer, intermediates in between.

    Intermediate placement averages the y-coordinate of the targets they
    connect to and the relative position along the path, so frequently
    co-used hubs naturally cluster near the targets they bridge instead
    of stacking in a single vertical line.
    """
    positions: dict[str, tuple[float, float]] = {}
    layer_y_centers: dict[str, float] = {}

    # 1. Group reachable targets by signature layer in the canonical order.
    layers_with_targets: list[tuple[dict[str, Any], list[str]]] = []
    for layer in SIGNATURE_LAYERS:
        in_layer = [g for g in layer["genes"] if g in reachable_targets]
        if in_layer:
            layers_with_targets.append((layer, in_layer))

    if not layers_with_targets:
        positions[query_gene] = (0.08, 0.5)
        return positions, layer_y_centers

    # 2. Distribute layers vertically, with a small gap between each band.
    n_layers = len(layers_with_targets)
    band_top = 0.96
    band_bottom = 0.06
    band_step = (band_top - band_bottom) / n_layers
    target_x = 0.93

    for li, (layer, targets) in enumerate(layers_with_targets):
        y_top = band_top - li * band_step
        y_bottom = y_top - band_step
        usable_top = y_top - 0.03
        usable_bottom = y_bottom + 0.03
        n = len(targets)
        for ti, target in enumerate(targets):
            if n == 1:
                y = (usable_top + usable_bottom) / 2
            else:
                y = usable_top - ti * (usable_top - usable_bottom) / (n - 1)
            positions[target] = (target_x, y)
        layer_y_centers[str(layer["label"])] = (usable_top + usable_bottom) / 2

    # 3. Query gene sits at left center, vertically aligned with the
    # midpoint of the target column so edges fan out symmetrically.
    target_ys = [y for _, y in (positions[t] for t in positions if t in reachable_targets)]
    query_y = sum(target_ys) / len(target_ys) if target_ys else 0.5
    query_x = 0.08
    positions[query_gene] = (query_x, query_y)

    # 4. Intermediates: collect each intermediate's path position(s) and
    # the targets it bridges, then place it accordingly.
    intermediate_targets: dict[str, list[str]] = {}
    intermediate_path_pos: dict[str, list[float]] = {}
    for target, entry in target_entries:
        path = list(entry.get("path", []))
        if len(path) < 2:
            continue
        # Hops 1..n-2 are the intermediates (path[0] = query, path[-1] = target).
        for i, node in enumerate(path):
            if node == query_gene or node in reachable_targets:
                continue
            intermediate_targets.setdefault(node, []).append(target)
            # Normalised position along this path, in (0, 1).
            intermediate_path_pos.setdefault(node, []).append(
                i / max(1, len(path) - 1)
            )

    intermediates = sorted(intermediate_targets.keys())

    # 5. For each intermediate compute base x/y, then resolve overlaps
    # with a small jitter pass so two distinct hubs sharing a target
    # don't collapse into the same dot.
    intermediate_positions: list[tuple[str, float, float]] = []
    for node in intermediates:
        targets = intermediate_targets[node]
        target_y_avg = sum(positions[t][1] for t in targets if t in positions) / max(1, len(targets))
        path_pos_avg = sum(intermediate_path_pos[node]) / max(1, len(intermediate_path_pos[node]))
        x = query_x + path_pos_avg * (target_x - query_x)
        intermediate_positions.append((node, x, target_y_avg))

    # Resolve y collisions inside each x-band.
    intermediate_positions.sort(key=lambda item: (round(item[1], 2), item[2]))
    placed: list[tuple[float, float]] = []
    for idx, (node, x, y) in enumerate(intermediate_positions):
        adjusted_y = y
        attempts = 0
        while any(abs(px - x) < 0.06 and abs(py - adjusted_y) < 0.05 for px, py in placed):
            attempts += 1
            adjusted_y = y + (0.06 * attempts * (1 if idx % 2 == 0 else -1))
            if attempts > 8:
                break
        adjusted_y = max(band_bottom + 0.03, min(band_top - 0.03, adjusted_y))
        positions[node] = (x, adjusted_y)
        placed.append((x, adjusted_y))

    return positions, layer_y_centers


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
