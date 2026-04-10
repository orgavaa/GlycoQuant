"""Tab 1 — Image Analysis (Streamlit).

The single user-facing function is :func:`render`, called from
``glycoquant/app/main.py``. The rest of the module is pure helpers that
can be imported and exercised via ``streamlit.testing.v1.AppTest``
without a browser.

Architecture
------------
- Session state holds mutable UI state only (selection, toggles, filter).
- ``@st.cache_resource`` holds the Cellpose segmenter and DINOv2 embedder
  model singletons.
- ``@st.cache_data`` holds the heavy pipeline output keyed on the hash
  of the uploaded image bytes + seg params + deep-features flag.
- Overlay rendering lives in ``glycoquant.viz.overlay``; this module
  only converts those contour arrays to Plotly traces.
- Bidirectional cross-highlighting uses a ``selection_source`` sentinel
  to prevent the feedback loop Plotly/Streamlit would otherwise create
  between programmatic and user-driven selections.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from glycoquant.features import DinoV2Embedder, DinoV2Params
from glycoquant.io import (
    downsample_for_display,
    hash_image_bytes,
    load_multichannel_image,
    split_into_channels,
)
from glycoquant.profiles import AssemblerConfig, ProfileAssembler
from glycoquant.segmentation import CellSegmenter
from glycoquant.viz import (
    actin_orientation_segment,
    cell_outline_polygons,
    focal_adhesion_polygons,
    glycocalyx_ring_polygons,
    nuclear_outline_polygons,
    plot_correlation_map,
    plot_radial_profile,
)
from glycoquant.viz.overlay import MAX_CELLS_FOR_OVERLAY

CANONICAL_CHANNELS = ("dapi", "glycocalyx", "yap", "paxillin", "actin")
DEMO_DIR = Path(__file__).resolve().parents[2] / "data" / "demo"
DEMO_CONDITIONS = ("control", "siSDC1", "heparinase")


# ---------------------------------------------------------------------------
# Pipeline data container
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class PipelineResult:
    """Immutable bundle of everything the pipeline produces for one image."""

    channels: dict[str, np.ndarray]
    cell_mask: np.ndarray
    nuclear_mask: np.ndarray
    features_df: pd.DataFrame
    deep_cell_ids: list[int]
    deep_embeddings: np.ndarray  # (n_cells, 768) or (0, 768)


# ---------------------------------------------------------------------------
# Cached resources and pipeline
# ---------------------------------------------------------------------------


@st.cache_resource(show_spinner="Loading Cellpose-SAM…")
def get_segmenter() -> CellSegmenter:
    """Return a session-long Cellpose-SAM segmenter."""
    return CellSegmenter(gpu=False)


@st.cache_resource(show_spinner="Loading DINOv2-base…")
def get_dinov2_embedder() -> DinoV2Embedder:
    """Return a session-long DINOv2 embedder."""
    return DinoV2Embedder(params=DinoV2Params())


@st.cache_data(show_spinner="Running analysis…")
def run_pipeline(
    image_hash: str,  # noqa: ARG001 - used as cache key
    channels: dict[str, np.ndarray],
    include_deep_features: bool,
    cell_diameter: float | None,
) -> PipelineResult:
    """Segment + extract features + (optionally) embed with DINOv2.

    Parameters
    ----------
    image_hash : str
        Content hash of the loaded image; unused by the function body
        but included in the argument list so ``@st.cache_data`` keys
        the result on it.
    channels : dict[str, np.ndarray]
        Canonical channel dict.
    include_deep_features : bool
        Toggle for the DINOv2 feature track.
    cell_diameter : float | None
        Cellpose diameter override.

    Returns
    -------
    PipelineResult
    """
    segmenter = get_segmenter()
    cell_mask, nuclear_mask = segmenter.segment_both(
        channels[_segmentation_channel(channels)],
        channels["dapi"],
        cell_diameter=cell_diameter,
    )

    dinov2 = get_dinov2_embedder() if include_deep_features else None
    assembler = ProfileAssembler(
        config=AssemblerConfig(include_deep_features=include_deep_features),
        dinov2_embedder=dinov2,
    )
    features_df = assembler.process_image(
        channels, cell_mask=cell_mask, nuclear_mask=nuclear_mask
    )

    deep_ids: list[int] = []
    deep_embeddings = np.zeros((0, 768), dtype=np.float32)
    if include_deep_features and dinov2 is not None:
        deep_cols = [c for c in features_df.columns if c.startswith("deep_")]
        if deep_cols:
            deep_ids = [int(i) for i in features_df.index.tolist()]
            deep_embeddings = features_df[deep_cols].to_numpy().astype(np.float32)

    return PipelineResult(
        channels=channels,
        cell_mask=cell_mask,
        nuclear_mask=nuclear_mask,
        features_df=features_df,
        deep_cell_ids=deep_ids,
        deep_embeddings=deep_embeddings,
    )


@st.cache_data(show_spinner="Fitting UMAP…")
def fit_umap(embeddings_hash: str, embeddings: np.ndarray) -> np.ndarray:  # noqa: ARG001
    """2D UMAP projection of DINOv2 embeddings. Cached on hash."""
    from umap import UMAP

    if embeddings.shape[0] < 2:
        return np.zeros((embeddings.shape[0], 2), dtype=np.float32)
    reducer = UMAP(n_components=2, random_state=42, n_neighbors=min(15, embeddings.shape[0] - 1))
    return reducer.fit_transform(embeddings).astype(np.float32)


def _segmentation_channel(channels: dict[str, np.ndarray]) -> str:
    """Pick the best available cytoplasmic channel for Cellpose."""
    for preferred in ("actin", "glycocalyx", "paxillin"):
        if preferred in channels:
            return preferred
    return next(iter(channels))


# ---------------------------------------------------------------------------
# Rendering helpers (pure functions, unit-testable)
# ---------------------------------------------------------------------------


def build_overlay_figure(
    channels: dict[str, np.ndarray],
    cell_mask: np.ndarray,
    nuclear_mask: np.ndarray,
    features_df: pd.DataFrame,
    paxillin_channel: np.ndarray | None,
    toggles: dict[str, bool],
    selected_cell_id: int | None,
    filter_cell_ids: set[int] | None,
) -> go.Figure:
    """Build the interactive Plotly figure with toggleable overlays.

    Base layer: an imshow of the actin (or first available) channel,
    downsampled for display if necessary. On top: per-layer go.Scatter
    polygons for cells, nuclei, focal adhesions, glycocalyx rings, and
    actin orientation arrows. Every scatter trace carries
    ``customdata=[cell_id, ...]`` so click events return the cell ID
    directly.
    """
    display_channel_name = _segmentation_channel(channels)
    base = downsample_for_display(channels[display_channel_name])
    h, w = base.shape[:2]

    fig = go.Figure()
    fig.add_trace(
        go.Heatmap(
            z=base,
            colorscale="gray",
            showscale=False,
            hoverinfo="skip",
            name="image",
        )
    )

    # Precompute per-cell feature tooltips
    hover_cache = _build_hover_texts(features_df)

    scale_y = base.shape[0] / cell_mask.shape[0]
    scale_x = base.shape[1] / cell_mask.shape[1]

    if toggles.get("cells", True):
        _add_polygon_layer(
            fig,
            cell_outline_polygons(cell_mask),
            scale_y,
            scale_x,
            name="Cells",
            line_color="#00E0B8",  # techbio brand teal
            fill_color="rgba(0, 224, 184, 0.10)",
            hover_cache=hover_cache,
            filter_cell_ids=filter_cell_ids,
            selected_cell_id=selected_cell_id,
        )

    if toggles.get("nuclei", False):
        _add_polygon_layer(
            fig,
            nuclear_outline_polygons(nuclear_mask),
            scale_y,
            scale_x,
            name="Nuclei",
            line_color="#9B6DFF",  # violet accent for nuclei
            fill_color="rgba(155, 109, 255, 0.15)",
            hover_cache=None,
        )

    if toggles.get("glycocalyx_ring", False):
        _add_glycocalyx_rings(fig, cell_mask, scale_y, scale_x)

    if toggles.get("focal_adhesions", False) and paxillin_channel is not None:
        _add_focal_adhesions(fig, paxillin_channel, cell_mask, scale_y, scale_x)

    if toggles.get("actin_orientation", False):
        _add_orientation_arrows(fig, cell_mask, features_df, scale_y, scale_x)

    from glycoquant.app.styles import PALETTE, get_plotly_layout_template

    layout = get_plotly_layout_template()
    layout.update(
        {
            "xaxis": {"visible": False, "range": [0, w]},
            "yaxis": {"visible": False, "range": [h, 0], "scaleanchor": "x"},
            "margin": {"l": 0, "r": 0, "t": 8, "b": 8},
            "height": 600,
            "showlegend": True,
            "legend": {
                "orientation": "h",
                "yanchor": "top",
                "y": -0.02,
                "bgcolor": "rgba(0,0,0,0)",
                "font": {"color": PALETTE.text_secondary, "size": 10},
            },
            "plot_bgcolor": PALETTE.bg_deep,
        }
    )
    fig.update_layout(**layout)
    return fig


def _build_hover_texts(features_df: pd.DataFrame) -> dict[int, str]:
    """Per-cell HTML-ish hover tooltip with a handful of key features."""
    keys_to_show = (
        "cell_area",
        "yap_nc_ratio",
        "fa_count",
        "glycocalyx_pericellular_ratio",
        "actin_stress_fiber_coherence",
    )
    out: dict[int, str] = {}
    for cell_id, row in features_df.iterrows():
        lines = [f"<b>Cell {int(cell_id)}</b>"]
        for key in keys_to_show:
            if key in row and pd.notna(row[key]):
                lines.append(f"{key}: {row[key]:.3f}")
        out[int(cell_id)] = "<br>".join(lines)
    return out


def _add_polygon_layer(
    fig: go.Figure,
    polygons: dict[int, np.ndarray],
    scale_y: float,
    scale_x: float,
    *,
    name: str,
    line_color: str,
    fill_color: str,
    hover_cache: dict[int, str] | None,
    filter_cell_ids: set[int] | None = None,
    selected_cell_id: int | None = None,
) -> None:
    """Add one trace per cell in ``polygons`` to ``fig``.

    ``filter_cell_ids`` (if provided) tags matching cells with a red
    outline; ``selected_cell_id`` tags a single clicked cell with an
    orange thick outline.
    """
    for cell_id, contour in polygons.items():
        ys = contour[:, 0] * scale_y
        xs = contour[:, 1] * scale_x
        is_selected = cell_id == selected_cell_id
        is_filtered = filter_cell_ids is not None and cell_id in filter_cell_ids
        color = line_color
        width = 1
        if is_selected:
            color = "#FF9900"
            width = 3
        elif is_filtered:
            color = "#D93025"
            width = 2
        text = hover_cache.get(cell_id, f"Cell {cell_id}") if hover_cache else f"Cell {cell_id}"
        fig.add_trace(
            go.Scatter(
                x=xs,
                y=ys,
                mode="lines",
                fill="toself",
                fillcolor=fill_color,
                line={"color": color, "width": width},
                customdata=[cell_id] * len(xs),
                hovertemplate=text + "<extra></extra>",
                name=name,
                legendgroup=name,
                showlegend=(cell_id == next(iter(polygons))),
            )
        )


def _add_glycocalyx_rings(
    fig: go.Figure,
    cell_mask: np.ndarray,
    scale_y: float,
    scale_x: float,
) -> None:
    cell_ids = sorted(int(v) for v in np.unique(cell_mask).tolist() if v != 0)
    for idx, cell_id in enumerate(cell_ids):
        outer, _inner = glycocalyx_ring_polygons(cell_mask, cell_id, ring_width_px=10)
        if outer is None:
            continue
        fig.add_trace(
            go.Scatter(
                x=outer[:, 1] * scale_x,
                y=outer[:, 0] * scale_y,
                mode="lines",
                line={"color": "#00B050", "width": 1, "dash": "dot"},
                fill="none",
                name="Glycocalyx ring",
                legendgroup="ring",
                showlegend=(idx == 0),
                hoverinfo="skip",
            )
        )


def _add_focal_adhesions(
    fig: go.Figure,
    paxillin_channel: np.ndarray,
    cell_mask: np.ndarray,
    scale_y: float,
    scale_x: float,
) -> None:
    from glycoquant.features import FocalAdhesionParams

    params = FocalAdhesionParams()
    cell_ids = sorted(int(v) for v in np.unique(cell_mask).tolist() if v != 0)
    first_trace_for_legend = True
    for cell_id in cell_ids:
        polygons = focal_adhesion_polygons(
            paxillin_channel, cell_mask, cell_id, params=params
        )
        for poly in polygons:
            fig.add_trace(
                go.Scatter(
                    x=poly[:, 1] * scale_x,
                    y=poly[:, 0] * scale_y,
                    mode="lines",
                    fill="toself",
                    fillcolor="rgba(237, 125, 49, 0.35)",
                    line={"color": "#ED7D31", "width": 1},
                    name="Focal adhesions",
                    legendgroup="fa",
                    showlegend=first_trace_for_legend,
                    hoverinfo="skip",
                )
            )
            first_trace_for_legend = False


def _add_orientation_arrows(
    fig: go.Figure,
    cell_mask: np.ndarray,
    features_df: pd.DataFrame,
    scale_y: float,
    scale_x: float,
) -> None:
    if "actin_dominant_orientation" not in features_df.columns:
        return
    first = True
    for cell_id, row in features_df.iterrows():
        segment = actin_orientation_segment(
            cell_mask,
            int(cell_id),
            float(row["actin_dominant_orientation"]),
            length_px=40.0,
        )
        if segment is None:
            continue
        (y0, x0), (y1, x1) = segment
        fig.add_trace(
            go.Scatter(
                x=[x0 * scale_x, x1 * scale_x],
                y=[y0 * scale_y, y1 * scale_y],
                mode="lines",
                line={"color": "#FFFFFF", "width": 2},
                name="Actin orientation",
                legendgroup="orient",
                showlegend=first,
                hoverinfo="skip",
            )
        )
        first = False


def build_umap_figure(
    coords: np.ndarray,
    cell_ids: list[int],
    color_values: np.ndarray,
    color_label: str,
    selected_cell_id: int | None = None,
) -> go.Figure:
    """UMAP scatter colored by a feature, with a clickable selection."""
    if coords.shape[0] == 0:
        fig = go.Figure()
        fig.add_annotation(
            text="Enable 'Include DINOv2 deep features' and click Run Analysis",
            x=0.5,
            y=0.5,
            xref="paper",
            yref="paper",
            showarrow=False,
        )
        fig.update_layout(template="plotly_white", xaxis={"visible": False}, yaxis={"visible": False})
        return fig

    marker = {
        "color": color_values,
        "colorscale": "Viridis",
        "size": [14 if cid == selected_cell_id else 9 for cid in cell_ids],
        "line": {
            "color": ["#FF9900" if cid == selected_cell_id else "#333333" for cid in cell_ids],
            "width": [2 if cid == selected_cell_id else 0.5 for cid in cell_ids],
        },
        "colorbar": {"title": color_label},
    }
    fig = go.Figure(
        data=go.Scatter(
            x=coords[:, 0],
            y=coords[:, 1],
            mode="markers",
            marker=marker,
            customdata=cell_ids,
            hovertemplate="Cell %{customdata}<br>" + color_label + ": %{marker.color:.3f}<extra></extra>",
        )
    )
    fig.update_layout(
        template="plotly_white",
        xaxis_title="UMAP 1",
        yaxis_title="UMAP 2",
        height=500,
    )
    return fig


# ---------------------------------------------------------------------------
# Session state
# ---------------------------------------------------------------------------


def _init_session_state() -> None:
    defaults = {
        "image_loaded": False,
        "image_hash": None,
        "raw_image": None,
        "channels": None,
        "pipeline_result": None,
        "selected_cell_id": None,
        "selection_source": None,
        "overlay_toggles": {
            "cells": True,
            "nuclei": False,
            "glycocalyx_ring": False,
            "focal_adhesions": False,
            "actin_orientation": False,
        },
        "feature_filter_column": None,
        "feature_filter_threshold": 0.0,
        "include_deep_features": False,
        "cell_diameter": 80.0,
    }
    for key, value in defaults.items():
        if key not in st.session_state:
            st.session_state[key] = value


def _load_demo_image(condition: str) -> None:
    """Load a bundled demo TIFF into session state."""
    path = DEMO_DIR / f"{condition}.tiff"
    if not path.exists():
        st.error(
            f"Demo image '{condition}' not found at {path}. "
            "Run `python scripts/generate_demo_images.py` to generate it."
        )
        return
    raw = load_multichannel_image(path)
    mapping = {name: i for i, name in enumerate(CANONICAL_CHANNELS)}
    channels = split_into_channels(raw, mapping)
    st.session_state["raw_image"] = raw
    st.session_state["channels"] = channels
    st.session_state["image_hash"] = hash_image_bytes(raw)
    st.session_state["image_loaded"] = True
    st.session_state["pipeline_result"] = None
    st.session_state["selected_cell_id"] = None


def _load_uploaded_image(uploaded_file: Any, mapping: dict[str, int]) -> None:
    raw = load_multichannel_image(uploaded_file)
    channels = split_into_channels(raw, mapping)
    st.session_state["raw_image"] = raw
    st.session_state["channels"] = channels
    st.session_state["image_hash"] = hash_image_bytes(raw)
    st.session_state["image_loaded"] = True
    st.session_state["pipeline_result"] = None
    st.session_state["selected_cell_id"] = None


# ---------------------------------------------------------------------------
# Main render
# ---------------------------------------------------------------------------


def render(config: dict[str, Any] | None = None) -> None:  # noqa: ARG001
    """Render Tab 1. Called from main.py inside its tab container."""
    from glycoquant.app.styles import (
        render_badge,
        render_sidebar_section_title,
    )

    _init_session_state()
    # Clear any stale selection source at the start of every rerun
    st.session_state["selection_source"] = None

    # ------------------------------------------------------------------
    # Sidebar
    # ------------------------------------------------------------------
    with st.sidebar:
        render_sidebar_section_title("1 · Load image")
        demo = st.selectbox(
            "Demo dataset",
            [""] + list(DEMO_CONDITIONS),
            key="demo_selector",
            help="Bundled synthetic conditions for out-of-the-box testing.",
        )
        if demo and st.button(
            "Load demo", type="primary", use_container_width=True
        ):
            _load_demo_image(demo)
            st.rerun()

        uploaded = st.file_uploader(
            "Or upload TIFF / PNG",
            type=["tif", "tiff", "png"],
            key="upload",
            label_visibility="visible",
        )
        if uploaded is not None:
            mapping = {name: i for i, name in enumerate(CANONICAL_CHANNELS)}
            if st.button("Load uploaded", use_container_width=True):
                _load_uploaded_image(uploaded, mapping)
                st.rerun()

        render_sidebar_section_title("2 · Analysis parameters")
        st.session_state["cell_diameter"] = float(
            st.number_input(
                "Cell diameter (px)",
                value=int(st.session_state["cell_diameter"]),
                min_value=10,
                max_value=300,
                step=5,
                format="%d",
                help="Expected average cell diameter in pixels. Cellpose "
                "uses this as a prior for segmentation scale.",
            )
        )
        st.session_state["include_deep_features"] = st.checkbox(
            "Include DINOv2 deep features",
            value=st.session_state["include_deep_features"],
            help="Adds 768-dim learned embeddings and a UMAP view. Slower on CPU.",
        )

        render_sidebar_section_title("3 · Run")
        run_disabled = not st.session_state["image_loaded"]
        if st.button(
            "▶  Run Analysis",
            type="primary",
            use_container_width=True,
            disabled=run_disabled,
            help="Segments cells, extracts 26 interpretable features, and "
            "optionally computes DINOv2 embeddings.",
        ):
            result = run_pipeline(
                st.session_state["image_hash"],
                st.session_state["channels"],
                st.session_state["include_deep_features"],
                st.session_state["cell_diameter"],
            )
            st.session_state["pipeline_result"] = result
            st.rerun()

        # Pipeline status badge
        render_sidebar_section_title("Pipeline status")
        if st.session_state.get("pipeline_result") is not None:
            status_html = render_badge("Analysis ready", "ready")
        elif st.session_state["image_loaded"]:
            status_html = render_badge("Image loaded · click Run", "idle")
        else:
            status_html = render_badge("Awaiting input", "idle")
        st.markdown(status_html, unsafe_allow_html=True)

    # ------------------------------------------------------------------
    # Main panel routing
    # ------------------------------------------------------------------
    if not st.session_state["image_loaded"]:
        _render_empty_state()
        return

    result: PipelineResult | None = st.session_state.get("pipeline_result")
    if result is None:
        _render_loaded_but_not_run(st.session_state["channels"])
        return

    _render_hero_metrics(result)
    _render_overlay_toggles()
    left, right = st.columns([1, 1], gap="large")
    with left:
        _render_image_panel(result)
    with right:
        _render_right_panel(result)


def _render_empty_state() -> None:
    """Landing panel shown before any image is loaded."""
    st.markdown(
        """
        <div style="
            background: #141829;
            border: 1px solid #1F2437;
            border-radius: 12px;
            padding: 32px 40px;
            margin: 24px 0;
            text-align: left;
        ">
            <div style="
                font-size: 0.72rem;
                text-transform: uppercase;
                letter-spacing: 0.1em;
                color: #8B92A8;
                font-weight: 600;
                margin-bottom: 8px;
            ">Getting started</div>
            <div style="
                font-size: 1.2rem;
                color: #E8EBF5;
                font-weight: 600;
                margin-bottom: 6px;
            ">Load an image to begin analysis</div>
            <div style="
                color: #8B92A8;
                font-size: 0.88rem;
                line-height: 1.55;
                max-width: 720px;
            ">
                Use the sidebar to select one of the bundled demo conditions
                (<span style="font-family:'JetBrains Mono',monospace;color:#E8EBF5;">control</span>,
                <span style="font-family:'JetBrains Mono',monospace;color:#E8EBF5;">siSDC1</span>,
                <span style="font-family:'JetBrains Mono',monospace;color:#E8EBF5;">heparinase</span>)
                or upload your own 5-channel fluorescence TIFF. Expected channel
                order: <b style="color:#E8EBF5;">DAPI · WGA-lectin · YAP · paxillin · phalloidin</b>.
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def _render_loaded_but_not_run(channels: dict[str, np.ndarray]) -> None:
    """Preview panel shown after image load, before Run Analysis."""
    from glycoquant.app.styles import PALETTE, get_plotly_layout_template

    st.markdown(
        f"""
        <div style="
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 12px 16px;
            background: {PALETTE.bg_surface};
            border: 1px solid {PALETTE.border_subtle};
            border-left: 3px solid {PALETTE.accent_primary};
            border-radius: 8px;
            margin: 8px 0 16px 0;
        ">
            <div style="
                width: 6px; height: 6px; border-radius: 50%;
                background: {PALETTE.accent_primary};
                box-shadow: 0 0 8px {PALETTE.accent_primary};
            "></div>
            <div style="color: {PALETTE.text_primary}; font-size: 0.88rem; font-weight: 500;">
                Image loaded. Click <b>Run Analysis</b> in the sidebar to start the pipeline.
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    from glycoquant.app.styles import render_section_header

    render_section_header("Loaded image", meta="preview · pre-segmentation")

    preview = downsample_for_display(channels[_segmentation_channel(channels)])
    fig = go.Figure(
        go.Heatmap(z=preview, colorscale="gray", showscale=False, hoverinfo="skip")
    )
    fig.update_layout(
        **get_plotly_layout_template(),
        xaxis={"visible": False},
        yaxis={"visible": False, "scaleanchor": "x", "autorange": "reversed"},
        height=500,
        margin={"l": 0, "r": 0, "t": 10, "b": 0},
    )
    st.plotly_chart(fig, use_container_width=True)


def _render_hero_metrics(result: PipelineResult) -> None:
    """Metric card row: key per-image statistics above the image panel."""
    from glycoquant.app.styles import render_metric_cards

    df = result.features_df
    n_cells = len(df)

    def _mean_safe(col: str) -> float | None:
        if col in df.columns and df[col].notna().any():
            return float(df[col].mean())
        return None

    yap_nc = _mean_safe("yap_nc_ratio")
    fa_count = _mean_safe("fa_count")
    coherence = _mean_safe("actin_stress_fiber_coherence")
    glyco_ratio = _mean_safe("glycocalyx_pericellular_ratio")

    def _fmt(v: float | None, decimals: int = 2) -> str:
        return f"{v:.{decimals}f}" if v is not None else "—"

    metrics = [
        {"label": "Cells detected", "value": str(n_cells), "unit": "n"},
        {"label": "YAP N/C (mean)", "value": _fmt(yap_nc)},
        {"label": "Focal adhesions", "value": _fmt(fa_count, 1), "unit": "/ cell"},
        {"label": "Actin coherence", "value": _fmt(coherence)},
        {"label": "Glycocalyx ratio", "value": _fmt(glyco_ratio)},
    ]
    render_metric_cards(metrics)


def _render_overlay_toggles() -> None:
    from glycoquant.app.styles import render_section_header

    render_section_header(
        "Visual overlays",
        meta="click to highlight features rendered in place on the image",
    )
    cols = st.columns(5)
    toggles = st.session_state["overlay_toggles"]
    labels = [
        ("cells", "Cell outlines"),
        ("nuclei", "Nuclei"),
        ("focal_adhesions", "Focal adhesions"),
        ("glycocalyx_ring", "Glycocalyx ring"),
        ("actin_orientation", "Actin orientation"),
    ]
    for (key, label), col in zip(labels, cols, strict=True):
        with col:
            toggles[key] = st.checkbox(label, value=toggles[key], key=f"toggle_{key}")


def _render_image_panel(result: PipelineResult) -> None:
    from glycoquant.app.styles import render_section_header

    filter_cell_ids = _compute_filter_cell_ids(result.features_df)
    paxillin = result.channels.get("paxillin")
    fig = build_overlay_figure(
        channels=result.channels,
        cell_mask=result.cell_mask,
        nuclear_mask=result.nuclear_mask,
        features_df=result.features_df,
        paxillin_channel=paxillin,
        toggles=st.session_state["overlay_toggles"],
        selected_cell_id=st.session_state["selected_cell_id"],
        filter_cell_ids=filter_cell_ids,
    )

    n_cells = len(result.features_df)
    meta = f"{n_cells} cells · click a cell to cross-highlight"
    render_section_header("Segmented image", meta=meta)

    if n_cells > MAX_CELLS_FOR_OVERLAY:
        st.warning(
            f"⚠ {n_cells} cells exceed the overlay rendering budget of "
            f"{MAX_CELLS_FOR_OVERLAY}; centroid fallback engaged."
        )

    event = st.plotly_chart(
        fig,
        use_container_width=True,
        key=f"image_plot_{st.session_state['image_hash']}",
        on_select="rerun",
        selection_mode="points",
    )
    # Handle click-to-select from the image
    if (
        st.session_state["selection_source"] != "table"
        and event is not None
        and hasattr(event, "selection")
    ):
        points = getattr(event.selection, "points", []) if event.selection else []
        if points:
            custom = points[0].get("customdata")
            if custom is not None:
                new_id = int(custom if not isinstance(custom, list) else custom[0])
                if new_id != st.session_state["selected_cell_id"]:
                    st.session_state["selected_cell_id"] = new_id
                    st.session_state["selection_source"] = "plot"


def _compute_filter_cell_ids(features_df: pd.DataFrame) -> set[int] | None:
    """Highlight cells where the filter column exceeds the threshold."""
    col = st.session_state.get("feature_filter_column")
    if not col or col not in features_df.columns:
        return None
    threshold = float(st.session_state.get("feature_filter_threshold", 0.0))
    matched = features_df.index[features_df[col] > threshold].tolist()
    return {int(i) for i in matched}


def _render_right_panel(result: PipelineResult) -> None:
    tab_features, tab_radial, tab_corr, tab_umap = st.tabs(
        ["Feature table", "Radial profile", "Correlation", "UMAP"]
    )
    with tab_features:
        _render_feature_table(result)
    with tab_radial:
        _render_radial_profile_tab(result)
    with tab_corr:
        _render_correlation_tab(result)
    with tab_umap:
        _render_umap_tab(result)


def _render_feature_table(result: PipelineResult) -> None:
    features_df = result.features_df
    numeric_cols = features_df.select_dtypes(include=[np.number]).columns.tolist()

    filter_col1, filter_col2 = st.columns([2, 1])
    with filter_col1:
        filter_col = st.selectbox(
            "Filter feature",
            ["(none)"] + numeric_cols,
            index=0,
            key="feature_filter_selectbox",
        )
    with filter_col2:
        if filter_col != "(none)":
            col_min = float(features_df[filter_col].min())
            col_max = float(features_df[filter_col].max())
            if col_max > col_min:
                threshold = st.slider(
                    "Threshold",
                    min_value=col_min,
                    max_value=col_max,
                    value=st.session_state["feature_filter_threshold"],
                    key="feature_filter_slider",
                )
                st.session_state["feature_filter_column"] = filter_col
                st.session_state["feature_filter_threshold"] = float(threshold)
            else:
                st.session_state["feature_filter_column"] = None
        else:
            st.session_state["feature_filter_column"] = None

    selection_event = st.dataframe(
        features_df,
        use_container_width=True,
        height=400,
        key=f"feature_table_{st.session_state['image_hash']}",
        on_select="rerun",
        selection_mode="single-row",
    )
    if (
        st.session_state["selection_source"] != "plot"
        and selection_event is not None
        and hasattr(selection_event, "selection")
    ):
        rows = getattr(selection_event.selection, "rows", [])
        if rows:
            new_id = int(features_df.index[rows[0]])
            if new_id != st.session_state["selected_cell_id"]:
                st.session_state["selected_cell_id"] = new_id
                st.session_state["selection_source"] = "table"

    st.download_button(
        "Download CSV",
        features_df.to_csv().encode("utf-8"),
        file_name="glycoquant_features.csv",
        mime="text/csv",
    )


def _render_radial_profile_tab(result: PipelineResult) -> None:
    assembler = ProfileAssembler(
        config=AssemblerConfig(include_radial_profile=True)
    )
    df_with_profiles = assembler.process_image(
        result.channels,
        cell_mask=result.cell_mask,
        nuclear_mask=result.nuclear_mask,
    )
    profile_cols = [
        c for c in df_with_profiles.columns if c.startswith("glycocalyx_radial_profile_")
    ]
    if not profile_cols:
        st.info("Radial profile unavailable (no glycocalyx channel?)")
        return
    profiles = df_with_profiles[profile_cols].to_numpy().astype(np.float32)
    fig = plot_radial_profile(profiles)
    st.plotly_chart(fig, use_container_width=True)


def _render_correlation_tab(result: PipelineResult) -> None:
    numeric_df = result.features_df.select_dtypes(include=[np.number])
    # Drop deep embedding columns for clarity — they dominate the heatmap
    numeric_df = numeric_df.loc[:, ~numeric_df.columns.str.startswith("deep_")]
    if numeric_df.shape[1] < 2:
        st.info("Not enough numeric features for a correlation heatmap.")
        return
    fig = plot_correlation_map(numeric_df)
    st.plotly_chart(fig, use_container_width=True)


def _render_umap_tab(result: PipelineResult) -> None:
    if result.deep_embeddings.shape[0] == 0:
        st.info(
            "DINOv2 UMAP is only available when 'Include DINOv2 deep features' is enabled. "
            "Toggle it in the sidebar and re-run the analysis."
        )
        return
    embeddings_hash = hash_image_bytes(result.deep_embeddings)
    coords = fit_umap(embeddings_hash, result.deep_embeddings)

    numeric_cols = [
        c
        for c in result.features_df.columns
        if not c.startswith("deep_")
        and pd.api.types.is_numeric_dtype(result.features_df[c])
    ]
    color_feature = st.selectbox(
        "Color by feature", numeric_cols, index=0, key="umap_color_feature"
    )
    color_values = result.features_df.loc[result.deep_cell_ids, color_feature].to_numpy()

    fig = build_umap_figure(
        coords=coords,
        cell_ids=result.deep_cell_ids,
        color_values=color_values,
        color_label=color_feature,
        selected_cell_id=st.session_state["selected_cell_id"],
    )
    st.plotly_chart(
        fig,
        use_container_width=True,
        key=f"umap_{embeddings_hash}",
        on_select="rerun",
        selection_mode="points",
    )
