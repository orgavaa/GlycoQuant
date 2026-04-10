"""Tab 2 — Perturbation Prioritization (Streamlit).

Pure rendering layer over the library surface in
``glycoquant.predictor``. No model loading, no network calls, no
inference — only JSON loads + pandas + Plotly.

The tab is a hypothesis-ranking tool, **not** a mechanistic predictor.
Two complementary precomputed priors (Geneformer transcriptomic
co-regulation + STRING/Reactome pathway proximity) are displayed
side-by-side with a ``|ΔRank|`` divergence column that highlights
exactly the experiments where the two priors disagree — the most
informative cells to perturb in the wet lab.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from glycoquant.predictor import (
    PriorTable,
    build_ranking_dataframe,
    get_mechano_signature,
    get_metabolic_inhibitors,
    load_prior,
    validate_gene_panels,
)

_REPO_ROOT = Path(__file__).resolve().parents[2]
PATHWAY_PRIOR_PATH = _REPO_ROOT / "data" / "priors" / "pathway_ranks.json"
GENEFORMER_PRIOR_PATH = _REPO_ROOT / "data" / "priors" / "geneformer_ranks.json"
PATHWAY_EVIDENCE_PATH = _REPO_ROOT / "data" / "priors" / "pathway_evidence.json"

DISCLAIMER = (
    "These rankings reflect transcriptomic co-regulation (Geneformer, "
    "~104 M cells) and curated pathway proximity (STRING v12). They "
    "generate hypotheses for experimental validation — not mechanistic "
    "predictions. When the two priors disagree, the divergence is the "
    "most informative signal on this page."
)


# ---------------------------------------------------------------------------
# Cached loaders
# ---------------------------------------------------------------------------


@st.cache_data(show_spinner="Loading priors…")
def load_priors_cached() -> tuple[PriorTable, PriorTable, dict[str, Any]]:
    """Load both prior JSONs once per session and return them together."""
    geneformer = load_prior(GENEFORMER_PRIOR_PATH, source="geneformer")
    pathway = load_prior(PATHWAY_PRIOR_PATH, source="pathway")
    evidence: dict[str, Any] = {}
    if PATHWAY_EVIDENCE_PATH.is_file():
        import json

        evidence = json.loads(PATHWAY_EVIDENCE_PATH.read_text(encoding="utf-8"))
    return geneformer, pathway, evidence


# ---------------------------------------------------------------------------
# Table rendering
# ---------------------------------------------------------------------------


def format_ranking_table(
    df: pd.DataFrame, geneformer_available: bool
) -> pd.DataFrame:
    """Prepare the ranking dataframe for display: sort, rename, round.

    Sort key: pathway_rank ascending (breaks ties on gene name). When
    the Geneformer prior is unavailable, the Geneformer columns and
    the divergence column are dropped entirely.
    """
    display = df.copy()
    display = display.sort_values(
        by=["pathway_rank", "gene"], ascending=[True, True], na_position="last"
    )

    columns = [
        "gene",
        "geneformer_rank",
        "geneformer_score",
        "pathway_rank",
        "pathway_score",
        "abs_rank_divergence",
    ]
    if not geneformer_available:
        columns = [c for c in columns if not c.startswith("geneformer_") and c != "abs_rank_divergence"]

    display = display[columns]
    # Round scores to 3 decimals for readability
    for col in ("geneformer_score", "pathway_score"):
        if col in display.columns:
            display[col] = display[col].round(3)

    rename = {
        "gene": "Gene",
        "geneformer_rank": "Geneformer rank",
        "geneformer_score": "Geneformer score",
        "pathway_rank": "Pathway rank",
        "pathway_score": "Pathway score",
        "abs_rank_divergence": "|ΔRank|",
    }
    display = display.rename(columns=rename)
    return display


def build_drill_down_heatmap(
    gene: str,
    geneformer: PriorTable,
    pathway: PriorTable,
    mechano_genes: list[str],
) -> go.Figure:
    """2-row heatmap (Geneformer vs pathway) of per-mechano-gene scores for one gene."""
    from glycoquant.app.styles import get_plotly_layout_template

    gf_row = (
        [geneformer.rankings[gene].per_mechano.get(m, 0.0) for m in mechano_genes]
        if gene in geneformer.rankings
        else [0.0] * len(mechano_genes)
    )
    pw_row = (
        [pathway.rankings[gene].per_mechano.get(m, 0.0) for m in mechano_genes]
        if gene in pathway.rankings
        else [0.0] * len(mechano_genes)
    )
    fig = go.Figure(
        data=go.Heatmap(
            z=[gf_row, pw_row],
            x=mechano_genes,
            y=["Geneformer", "Pathway"],
            colorscale=[
                [0.0, "#141829"],
                [0.5, "#4F8FFF"],
                [1.0, "#00E0B8"],
            ],
            colorbar={
                "title": {"text": "Score", "font": {"color": "#8B92A8", "size": 10}},
                "tickfont": {"color": "#8B92A8", "size": 9},
                "outlinecolor": "#1F2437",
                "outlinewidth": 1,
            },
            hovertemplate="<b>%{y}</b><br>%{x}: %{z:.3f}<extra></extra>",
        )
    )
    layout = get_plotly_layout_template()
    layout.update(
        {
            "title": f"Per-mechano-gene scores · {gene}",
            "height": 240,
            "margin": {"l": 90, "r": 30, "t": 45, "b": 70},
            "xaxis": {"tickangle": 45, "tickfont": {"size": 9, "color": "#8B92A8"}},
            "yaxis": {"tickfont": {"size": 11, "color": "#E8EBF5"}},
        }
    )
    fig.update_layout(**layout)
    return fig


def build_pathway_evidence_lines(
    gene: str,
    mechano_gene: str,
    evidence: dict[str, Any],
) -> list[str]:
    """Format the STRING shortest-path edges for a (gene, target) pair as readable lines."""
    if gene not in evidence or mechano_gene not in evidence[gene]:
        return [f"No pathway evidence for {gene} → {mechano_gene}"]
    entry = evidence[gene][mechano_gene]
    path = entry.get("path", [])
    edges = entry.get("path_edges", [])
    distance = entry.get("distance")

    lines: list[str] = []
    if not path:
        lines.append(f"{gene} → {mechano_gene}: unreachable in STRING v12 at confidence ≥ 0.7")
        return lines

    lines.append(f"**Path:** {' → '.join(path)}  (Dijkstra distance = {distance:.3f})")
    lines.append("")
    lines.append("**Edges along the path:**")
    for edge in edges:
        lines.append(
            f"- `{edge['from']}` ↔ `{edge['to']}` (STRING confidence = {edge['confidence']:.3f})"
        )
    return lines


# ---------------------------------------------------------------------------
# Main render
# ---------------------------------------------------------------------------


def render(config: dict[str, Any] | None = None) -> None:  # noqa: ARG001
    """Render Tab 2. Called from main.py inside its tab container."""
    from glycoquant.app.styles import (
        render_metric_cards,
        render_section_header,
    )

    # Hard gate: fail fast if the config drifted from the expected panel sizes
    try:
        validate_gene_panels()
    except ValueError as exc:
        st.error(f"Gene panel config is invalid: {exc}")
        return

    geneformer, pathway, evidence = load_priors_cached()

    _render_disclaimer_banner(geneformer.available, pathway.available)

    if not pathway.available:
        st.error(
            "Pathway prior missing. Run `python scripts/generate_pathway_priors.py` "
            "to generate `data/priors/pathway_ranks.json`."
        )
        return

    df = build_ranking_dataframe(geneformer, pathway)

    # Hero: top-3 glycocalyx genes by pathway rank
    render_section_header(
        "Top candidates", meta="ranked by pathway proximity to mechano signature"
    )
    top3 = df.sort_values(by="pathway_rank", ascending=True, na_position="last").head(3)
    metrics = []
    for _, row in top3.iterrows():
        score = row.get("pathway_score")
        metrics.append(
            {
                "label": f"Rank #{int(row['pathway_rank'])} · Pathway",
                "value": str(row["gene"]),
                "unit": f"s={score:.3f}" if score is not None and not pd.isna(score) else "",
            }
        )
    # Pad to 4 cards with a summary metric
    metrics.append(
        {
            "label": "Panel size",
            "value": f"{len(df)}",
            "unit": "genes ranked",
        }
    )
    render_metric_cards(metrics)

    display_df = format_ranking_table(df, geneformer.available)

    _render_ranking_table(display_df)
    _render_drill_down_section(df, geneformer, pathway, evidence)
    _render_metabolic_inhibitor_panel(df)
    _render_metadata_footer(geneformer, pathway)


def _render_disclaimer_banner(
    geneformer_available: bool, pathway_available: bool
) -> None:
    if not geneformer_available:
        st.warning(
            "Geneformer prior not found at `data/priors/geneformer_ranks.json`. "
            "Running in **pathway-only mode**. To enable the dual-prior view, "
            "run `scripts/generate_geneformer_priors.py` on a Colab GPU runtime "
            "and commit the resulting JSON."
        )
    st.info(DISCLAIMER)


def _render_ranking_table(display_df: pd.DataFrame) -> None:
    from glycoquant.app.styles import render_section_header

    render_section_header(
        "Ranked perturbations",
        meta=f"{len(display_df)} genes · sortable · full table",
    )
    st.dataframe(
        display_df,
        use_container_width=True,
        hide_index=True,
        height=500,
        column_config={
            "Pathway score": st.column_config.ProgressColumn(
                "Pathway score",
                help="Median inverse shortest-path score in STRING v12.",
                min_value=0.0,
                max_value=1.0,
                format="%.3f",
            ),
            "Geneformer score": st.column_config.ProgressColumn(
                "Geneformer score",
                help="Median cosine shift across the mechanotransduction signature.",
                min_value=0.0,
                max_value=1.0,
                format="%.3f",
            )
            if "Geneformer score" in display_df.columns
            else None,
            "|ΔRank|": st.column_config.NumberColumn(
                "|ΔRank|",
                help="Absolute rank disagreement between Geneformer and pathway priors. Higher = more informative experiment.",
                format="%d",
            )
            if "|ΔRank|" in display_df.columns
            else None,
        },
    )


def _render_drill_down_section(
    df: pd.DataFrame,
    geneformer: PriorTable,
    pathway: PriorTable,
    evidence: dict[str, Any],
) -> None:
    from glycoquant.app.styles import render_section_header

    render_section_header(
        "Per-gene drill-down",
        meta="click a gene → see its per-mechano-target scores + STRING shortest path",
    )
    gene = st.selectbox(
        "Select a glycocalyx gene",
        sorted(df["gene"].tolist()),
        key="tab2_drill_gene",
    )

    col_heatmap, col_evidence = st.columns([1, 1])
    with col_heatmap:
        fig = build_drill_down_heatmap(
            gene, geneformer, pathway, get_mechano_signature()
        )
        st.plotly_chart(fig, use_container_width=True)

    with col_evidence:
        st.markdown(f"**STRING evidence for {gene}**")
        mechano_gene = st.selectbox(
            "Mechano target",
            get_mechano_signature(),
            key="tab2_drill_target",
        )
        for line in build_pathway_evidence_lines(gene, mechano_gene, evidence):
            st.markdown(line)


def _render_metabolic_inhibitor_panel(df: pd.DataFrame) -> None:
    from glycoquant.app.styles import render_section_header

    render_section_header(
        "Metabolic inhibitors",
        meta="drug → primary target gene → position in the ranked panel",
    )
    st.caption(
        "How the 5 metabolic inhibitors in `default.yaml` map onto the "
        "ranked glycocalyx panel via their primary target genes."
    )
    inhibitors = get_metabolic_inhibitors()
    rows = []
    df_indexed = df.set_index("gene")
    for inhibitor_name, entry in inhibitors.items():
        target = entry.get("target", "")
        pathway_name = entry.get("pathway", "")
        # Exact-match: only direct targets in the ranked panel
        target_row = df_indexed.loc[target] if target in df_indexed.index else None
        rows.append(
            {
                "Inhibitor": inhibitor_name,
                "Pathway": pathway_name,
                "Primary target": target,
                "In glycocalyx panel?": "✓" if target_row is not None else "—",
                "Pathway rank": int(target_row["pathway_rank"])
                if target_row is not None and pd.notna(target_row["pathway_rank"])
                else None,
                "Pathway score": round(float(target_row["pathway_score"]), 3)
                if target_row is not None and pd.notna(target_row["pathway_score"])
                else None,
            }
        )
    st.dataframe(pd.DataFrame(rows), use_container_width=True, hide_index=True)


def _render_metadata_footer(
    geneformer: PriorTable, pathway: PriorTable
) -> None:
    with st.expander("Prior provenance"):
        st.markdown("**Pathway prior metadata:**")
        st.json(pathway.metadata)
        if geneformer.available:
            st.markdown("**Geneformer prior metadata:**")
            st.json(geneformer.metadata)
        else:
            st.markdown(
                "_Geneformer prior not loaded — see the banner at the top of "
                "the tab for regeneration instructions._"
            )
