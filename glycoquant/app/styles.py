"""GlycoQuant visual design system.

A single source of truth for the techbio dark-mode styling across every
Streamlit surface. Inspired by Recursion Phenoscope, Insitro, and
Schrödinger Maestro: deep-navy base, muted-teal accent, Inter +
JetBrains Mono typography, high-density information panels with
subtle borders and a mathematical feel on every numeric value.

The entry point is :func:`inject_global_styles` which should be called
exactly once per Streamlit rerun at the top of ``main.py`` before any
other widgets. Everything else in this module is either a helper to
render a pre-styled component (metric cards, status badges, section
headers) or a palette constant re-exported to the viz layer so Plotly
figures share the same brand tokens.
"""
from __future__ import annotations

from dataclasses import dataclass

import streamlit as st

# ---------------------------------------------------------------------------
# Design tokens
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Palette:
    """Canonical brand colors. Imported by both CSS and Plotly factories."""

    # Backgrounds
    bg_deep: str = "#0B0E1A"
    bg_surface: str = "#141829"
    bg_elevated: str = "#1A2036"

    # Borders
    border_subtle: str = "#1F2437"
    border_emphasis: str = "#2A3148"

    # Text
    text_primary: str = "#E8EBF5"
    text_secondary: str = "#8B92A8"
    text_muted: str = "#5D6378"

    # Accents
    accent_primary: str = "#4F8FFF"  # buttons, active states, focus rings
    accent_brand: str = "#00E0B8"  # GlycoQuant signature teal
    accent_violet: str = "#9B6DFF"  # tertiary accent for UMAP / discovery
    accent_amber: str = "#FFB547"

    # Status
    success: str = "#2EE8B6"
    warning: str = "#FFB547"
    error: str = "#FF6B6B"
    info: str = "#4F8FFF"


PALETTE = Palette()

# Typography
FONT_SANS = '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
FONT_MONO = '"JetBrains Mono", "SF Mono", Consolas, "Liberation Mono", monospace'


# ---------------------------------------------------------------------------
# CSS block
# ---------------------------------------------------------------------------

_CSS_TEMPLATE = """
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

/* ==========================================================================
   Global resets and typography
   ========================================================================== */

html, body, [class*="css"] {{
    font-family: {FONT_SANS};
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
}}

.stApp {{
    background: linear-gradient(180deg, {bg_deep} 0%, #0A0D18 100%) !important;
    color: {text_primary};
}}

/* Kill the default Streamlit top padding and blur bar */
.stApp > header {{
    background: transparent !important;
    height: 0 !important;
}}
[data-testid="stAppViewContainer"] > .main {{
    padding-top: 0 !important;
}}
.block-container {{
    padding-top: 1.5rem !important;
    padding-bottom: 2rem !important;
    max-width: 1400px !important;
}}

/* Headings */
h1, h2, h3, h4, h5, h6 {{
    font-family: {FONT_SANS};
    font-weight: 600;
    letter-spacing: -0.01em;
    color: {text_primary};
}}
h1 {{
    font-size: 1.75rem !important;
    font-weight: 700;
    letter-spacing: -0.02em;
    margin-bottom: 0.25rem !important;
}}
h2 {{
    font-size: 1.25rem !important;
    margin-top: 1.5rem !important;
}}
h3 {{
    font-size: 1rem !important;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: {text_secondary};
    font-weight: 600;
}}

/* Monospace numeric emphasis */
code, kbd, pre, .gq-mono {{
    font-family: {FONT_MONO};
    font-variant-numeric: tabular-nums;
}}

/* ==========================================================================
   Branded app header (rendered by render_app_header)
   ========================================================================== */

.gq-header {{
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 12px 20px;
    margin: -8px -4px 20px -4px;
    background: {bg_surface};
    border: 1px solid {border_subtle};
    border-radius: 12px;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
}}
.gq-logo {{
    width: 36px;
    height: 36px;
    border-radius: 8px;
    background: linear-gradient(135deg, {accent_brand} 0%, {accent_primary} 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: {FONT_MONO};
    font-weight: 700;
    font-size: 16px;
    color: {bg_deep};
    flex-shrink: 0;
    box-shadow: 0 0 24px rgba(0, 224, 184, 0.25);
}}
.gq-header-text {{
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex-grow: 1;
    min-width: 0;
}}
.gq-title {{
    font-family: {FONT_SANS};
    font-size: 1.05rem;
    font-weight: 700;
    color: {text_primary};
    line-height: 1.2;
    letter-spacing: -0.01em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}}
.gq-subtitle {{
    font-size: 0.78rem;
    color: {text_secondary};
    font-weight: 400;
    letter-spacing: 0.02em;
}}
.gq-header-meta {{
    display: flex;
    gap: 8px;
    align-items: center;
    flex-shrink: 0;
}}
.gq-version {{
    font-family: {FONT_MONO};
    font-size: 0.72rem;
    color: {accent_brand};
    padding: 3px 9px;
    border: 1px solid {accent_brand};
    border-radius: 999px;
    background: rgba(0, 224, 184, 0.08);
    font-weight: 500;
}}
.gq-inst {{
    font-size: 0.72rem;
    color: {text_muted};
    padding: 3px 9px;
    border: 1px solid {border_emphasis};
    border-radius: 999px;
}}

/* ==========================================================================
   Tabs — compact pill style
   ========================================================================== */

[data-testid="stTabs"] > div:first-child {{
    gap: 0;
    border-bottom: 1px solid {border_subtle};
    margin-bottom: 1rem;
}}
[data-testid="stTabs"] button[role="tab"] {{
    background: transparent !important;
    color: {text_secondary} !important;
    font-family: {FONT_SANS};
    font-weight: 500;
    font-size: 0.875rem;
    padding: 10px 18px !important;
    border: none !important;
    border-radius: 0 !important;
    border-bottom: 2px solid transparent !important;
    transition: color 120ms ease, border-color 120ms ease;
}}
[data-testid="stTabs"] button[role="tab"]:hover {{
    color: {text_primary} !important;
    background: rgba(79, 143, 255, 0.04) !important;
}}
[data-testid="stTabs"] button[role="tab"][aria-selected="true"] {{
    color: {accent_primary} !important;
    border-bottom-color: {accent_primary} !important;
    background: transparent !important;
    font-weight: 600;
}}

/* ==========================================================================
   Sidebar
   ========================================================================== */

[data-testid="stSidebar"] {{
    background: {bg_surface} !important;
    border-right: 1px solid {border_subtle};
}}
[data-testid="stSidebar"] > div:first-child {{
    padding-top: 1rem;
}}
[data-testid="stSidebar"] h1,
[data-testid="stSidebar"] h2,
[data-testid="stSidebar"] h3 {{
    font-size: 0.75rem !important;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: {text_muted} !important;
    font-weight: 600;
    margin-top: 1.25rem !important;
    margin-bottom: 0.5rem !important;
    padding-bottom: 0.3rem;
    border-bottom: 1px solid {border_subtle};
}}
[data-testid="stSidebar"] label {{
    font-size: 0.78rem !important;
    color: {text_secondary} !important;
    font-weight: 500;
}}
[data-testid="stSidebar"] .stMarkdown p {{
    font-size: 0.82rem;
    color: {text_secondary};
}}

/* ==========================================================================
   Buttons
   ========================================================================== */

.stButton > button {{
    font-family: {FONT_SANS};
    font-weight: 500;
    font-size: 0.85rem;
    border-radius: 8px;
    border: 1px solid {border_emphasis};
    background: {bg_elevated};
    color: {text_primary};
    padding: 8px 16px;
    transition: all 120ms ease;
}}
.stButton > button:hover {{
    border-color: {accent_primary};
    background: rgba(79, 143, 255, 0.08);
    color: {accent_primary};
    transform: none;
}}
.stButton > button[kind="primary"] {{
    background: linear-gradient(135deg, {accent_primary} 0%, #3B7AE8 100%);
    border: none;
    color: white;
    font-weight: 600;
    box-shadow: 0 2px 12px rgba(79, 143, 255, 0.3);
}}
.stButton > button[kind="primary"]:hover {{
    background: linear-gradient(135deg, #5FA0FF 0%, #4A88F0 100%);
    box-shadow: 0 4px 20px rgba(79, 143, 255, 0.4);
    color: white;
}}

/* ==========================================================================
   Inputs and selects
   ========================================================================== */

[data-baseweb="select"] > div,
[data-baseweb="input"] > div,
.stNumberInput > div > div,
.stTextInput > div > div > input {{
    background: {bg_deep} !important;
    border: 1px solid {border_emphasis} !important;
    border-radius: 8px !important;
    color: {text_primary} !important;
    font-family: {FONT_SANS};
}}
[data-baseweb="select"] > div:hover,
[data-baseweb="input"] > div:hover,
.stNumberInput > div > div:hover {{
    border-color: {accent_primary} !important;
}}

/* Numeric inputs get the mono treatment */
.stNumberInput input {{
    font-family: {FONT_MONO} !important;
    font-variant-numeric: tabular-nums;
}}

/* Checkbox — techbio pill flavor */
[data-testid="stCheckbox"] > label {{
    gap: 8px;
    align-items: center;
}}
[data-testid="stCheckbox"] label > div[data-testid="stMarkdownContainer"] p {{
    font-size: 0.82rem;
    color: {text_secondary};
    margin: 0;
}}

/* ==========================================================================
   File uploader — more inviting drop zone
   ========================================================================== */

[data-testid="stFileUploadDropzone"] {{
    background: {bg_deep} !important;
    border: 1.5px dashed {border_emphasis} !important;
    border-radius: 10px !important;
    transition: border-color 120ms ease, background 120ms ease;
}}
[data-testid="stFileUploadDropzone"]:hover {{
    border-color: {accent_primary} !important;
    background: rgba(79, 143, 255, 0.04) !important;
}}
[data-testid="stFileUploadDropzone"] button {{
    background: {bg_elevated} !important;
    border: 1px solid {border_emphasis} !important;
    color: {text_primary} !important;
}}

/* ==========================================================================
   Dataframe / table
   ========================================================================== */

[data-testid="stDataFrame"] {{
    border: 1px solid {border_subtle};
    border-radius: 10px;
    overflow: hidden;
    background: {bg_surface};
}}
[data-testid="stDataFrame"] div[role="grid"] {{
    font-family: {FONT_SANS};
    font-size: 0.8rem;
}}
[data-testid="stDataFrame"] div[role="columnheader"] {{
    background: {bg_elevated} !important;
    border-bottom: 1px solid {border_emphasis};
    font-weight: 600;
    color: {text_secondary};
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
}}
[data-testid="stDataFrame"] div[role="gridcell"] {{
    font-family: {FONT_MONO};
    font-variant-numeric: tabular-nums;
    color: {text_primary};
}}

/* ==========================================================================
   Alerts (st.info, st.warning, st.error, st.success)
   ========================================================================== */

[data-testid="stAlert"] {{
    border-radius: 10px;
    border-left-width: 3px;
    padding: 12px 16px;
    font-size: 0.85rem;
    background: {bg_surface} !important;
}}
[data-testid="stAlert"] [data-testid="stMarkdownContainer"] p {{
    color: {text_primary};
    margin: 0;
}}

/* ==========================================================================
   Plotly chart wrapper — match background
   ========================================================================== */

[data-testid="stPlotlyChart"] {{
    background: {bg_surface};
    border: 1px solid {border_subtle};
    border-radius: 10px;
    padding: 4px;
}}

/* ==========================================================================
   GlycoQuant-specific components
   ========================================================================== */

/* Metric card row */
.gq-metrics {{
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 10px;
    margin-bottom: 1rem;
}}
.gq-metric-card {{
    background: {bg_surface};
    border: 1px solid {border_subtle};
    border-radius: 10px;
    padding: 14px 16px;
    transition: border-color 120ms ease;
}}
.gq-metric-card:hover {{
    border-color: {border_emphasis};
}}
.gq-metric-label {{
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: {text_muted};
    font-weight: 600;
    margin-bottom: 4px;
}}
.gq-metric-value {{
    font-family: {FONT_MONO};
    font-size: 1.45rem;
    font-weight: 600;
    color: {text_primary};
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
}}
.gq-metric-unit {{
    font-size: 0.75rem;
    color: {text_muted};
    font-family: {FONT_SANS};
    margin-left: 4px;
    font-weight: 400;
}}
.gq-metric-delta-up {{
    color: {success};
    font-size: 0.72rem;
    font-weight: 500;
    margin-top: 2px;
}}
.gq-metric-delta-down {{
    color: {error};
    font-size: 0.72rem;
    font-weight: 500;
    margin-top: 2px;
}}

/* Status badges */
.gq-badge {{
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 999px;
    font-family: {FONT_MONO};
    font-size: 0.7rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
}}
.gq-badge-ready {{
    background: rgba(0, 224, 184, 0.1);
    color: {accent_brand};
    border: 1px solid rgba(0, 224, 184, 0.3);
}}
.gq-badge-running {{
    background: rgba(79, 143, 255, 0.1);
    color: {accent_primary};
    border: 1px solid rgba(79, 143, 255, 0.3);
}}
.gq-badge-warn {{
    background: rgba(255, 181, 71, 0.1);
    color: {warning};
    border: 1px solid rgba(255, 181, 71, 0.3);
}}
.gq-badge-idle {{
    background: {bg_elevated};
    color: {text_muted};
    border: 1px solid {border_emphasis};
}}
.gq-badge-dot {{
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
}}

/* Section panel — groups related controls with a title + border */
.gq-panel {{
    background: {bg_surface};
    border: 1px solid {border_subtle};
    border-radius: 10px;
    padding: 16px 18px;
    margin-bottom: 12px;
}}
.gq-panel-title {{
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.09em;
    color: {text_muted};
    font-weight: 600;
    margin-bottom: 10px;
    display: flex;
    align-items: center;
    gap: 8px;
}}
.gq-panel-title::before {{
    content: "";
    width: 3px;
    height: 12px;
    background: {accent_brand};
    border-radius: 2px;
}}

/* Section header in main area */
.gq-section-header {{
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin: 1.25rem 0 0.5rem 0;
    padding-bottom: 0.4rem;
    border-bottom: 1px solid {border_subtle};
}}
.gq-section-header h2 {{
    font-size: 0.92rem !important;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: {text_secondary} !important;
    margin: 0 !important;
    font-weight: 600;
}}
.gq-section-header .gq-section-meta {{
    font-family: {FONT_MONO};
    font-size: 0.72rem;
    color: {text_muted};
}}

/* Minimize scrollbar visual noise */
::-webkit-scrollbar {{
    width: 10px;
    height: 10px;
}}
::-webkit-scrollbar-track {{
    background: {bg_deep};
}}
::-webkit-scrollbar-thumb {{
    background: {border_emphasis};
    border-radius: 5px;
}}
::-webkit-scrollbar-thumb:hover {{
    background: {text_muted};
}}

/* Hide Streamlit's "Made with Streamlit" footer */
footer {{ visibility: hidden; }}
#MainMenu {{ visibility: hidden; }}

</style>
"""


def inject_global_styles() -> None:
    """Inject the full CSS block. Call once per rerun from ``main.py``."""
    css = _CSS_TEMPLATE.format(
        FONT_SANS=FONT_SANS,
        FONT_MONO=FONT_MONO,
        bg_deep=PALETTE.bg_deep,
        bg_surface=PALETTE.bg_surface,
        bg_elevated=PALETTE.bg_elevated,
        border_subtle=PALETTE.border_subtle,
        border_emphasis=PALETTE.border_emphasis,
        text_primary=PALETTE.text_primary,
        text_secondary=PALETTE.text_secondary,
        text_muted=PALETTE.text_muted,
        accent_primary=PALETTE.accent_primary,
        accent_brand=PALETTE.accent_brand,
        success=PALETTE.success,
        warning=PALETTE.warning,
        error=PALETTE.error,
    )
    st.markdown(css, unsafe_allow_html=True)


# ---------------------------------------------------------------------------
# Pre-styled component helpers
# ---------------------------------------------------------------------------


def render_app_header(
    version: str = "v0.2.0",
    institution: str = "ETH Zürich · D-MAVT",
) -> None:
    """Branded app header with logo mark, title, subtitle, and version badge."""
    st.markdown(
        f"""
        <div class="gq-header">
            <div class="gq-logo">GQ</div>
            <div class="gq-header-text">
                <div class="gq-title">GlycoQuant — Glycocalyx Mechanotransduction Analysis</div>
                <div class="gq-subtitle">Per-cell phenotyping from multi-channel fluorescence microscopy</div>
            </div>
            <div class="gq-header-meta">
                <span class="gq-inst">{institution}</span>
                <span class="gq-version">{version}</span>
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def render_metric_cards(metrics: list[dict[str, str]]) -> None:
    """Render a responsive row of metric cards.

    Each ``metric`` dict must have ``label`` and ``value``; it may
    optionally include ``unit`` (appended after the value in muted
    text) and ``delta`` (small indicator line, format
    ``"up:+12%"`` / ``"down:-4%"``).
    """
    cards_html: list[str] = []
    for metric in metrics:
        label = metric.get("label", "")
        value = metric.get("value", "—")
        unit = metric.get("unit", "")
        delta = metric.get("delta", "")

        delta_html = ""
        if delta.startswith("up:"):
            delta_html = f'<div class="gq-metric-delta-up">↑ {delta[3:]}</div>'
        elif delta.startswith("down:"):
            delta_html = f'<div class="gq-metric-delta-down">↓ {delta[5:]}</div>'

        unit_html = f'<span class="gq-metric-unit">{unit}</span>' if unit else ""

        cards_html.append(
            f"""
            <div class="gq-metric-card">
                <div class="gq-metric-label">{label}</div>
                <div class="gq-metric-value">{value}{unit_html}</div>
                {delta_html}
            </div>
            """
        )

    st.markdown(
        f'<div class="gq-metrics">{"".join(cards_html)}</div>',
        unsafe_allow_html=True,
    )


def render_badge(text: str, kind: str = "idle") -> str:
    """Return a status badge HTML string. ``kind`` ∈ {'ready','running','warn','idle'}."""
    kind_class = {
        "ready": "gq-badge-ready",
        "running": "gq-badge-running",
        "warn": "gq-badge-warn",
        "idle": "gq-badge-idle",
    }.get(kind, "gq-badge-idle")
    return (
        f'<span class="gq-badge {kind_class}">'
        f'<span class="gq-badge-dot"></span>{text}'
        f"</span>"
    )


def render_section_header(title: str, meta: str = "") -> None:
    """Mini uppercase section header with an optional right-aligned meta string."""
    meta_html = f'<span class="gq-section-meta">{meta}</span>' if meta else ""
    st.markdown(
        f"""
        <div class="gq-section-header">
            <h2>{title}</h2>
            {meta_html}
        </div>
        """,
        unsafe_allow_html=True,
    )


def render_sidebar_section_title(title: str) -> None:
    """Sidebar subsection title styled as an uppercase tracked label."""
    st.markdown(
        f'<div style="font-size:0.68rem;text-transform:uppercase;'
        f"letter-spacing:0.1em;color:{PALETTE.text_muted};"
        f'font-weight:600;margin:1rem 0 0.5rem 0;'
        f"padding-bottom:0.35rem;border-bottom:1px solid {PALETTE.border_subtle};\">"
        f"{title}</div>",
        unsafe_allow_html=True,
    )


# ---------------------------------------------------------------------------
# Plotly templating
# ---------------------------------------------------------------------------


def get_plotly_layout_template() -> dict:
    """Layout template every viz factory should merge into its Figure.

    Ensures dark background, brand typography, and consistent axis
    styling across every chart in the app. Pass to
    ``fig.update_layout(**get_plotly_layout_template())``.
    """
    return {
        "paper_bgcolor": "rgba(0,0,0,0)",
        "plot_bgcolor": PALETTE.bg_surface,
        "font": {
            "family": 'Inter, -apple-system, "Segoe UI", sans-serif',
            "color": PALETTE.text_primary,
            "size": 12,
        },
        "title": {
            "font": {
                "family": 'Inter, -apple-system, sans-serif',
                "size": 14,
                "color": PALETTE.text_primary,
            },
            "x": 0.02,
            "xanchor": "left",
        },
        "xaxis": {
            "gridcolor": PALETTE.border_subtle,
            "zerolinecolor": PALETTE.border_emphasis,
            "linecolor": PALETTE.border_emphasis,
            "tickcolor": PALETTE.border_emphasis,
            "tickfont": {"color": PALETTE.text_secondary, "size": 10},
            "title": {"font": {"color": PALETTE.text_secondary, "size": 11}},
        },
        "yaxis": {
            "gridcolor": PALETTE.border_subtle,
            "zerolinecolor": PALETTE.border_emphasis,
            "linecolor": PALETTE.border_emphasis,
            "tickcolor": PALETTE.border_emphasis,
            "tickfont": {"color": PALETTE.text_secondary, "size": 10},
            "title": {"font": {"color": PALETTE.text_secondary, "size": 11}},
        },
        "legend": {
            "bgcolor": "rgba(0,0,0,0)",
            "bordercolor": PALETTE.border_subtle,
            "borderwidth": 1,
            "font": {"color": PALETTE.text_secondary, "size": 10},
        },
        "colorway": [
            PALETTE.accent_primary,
            PALETTE.accent_brand,
            PALETTE.accent_violet,
            PALETTE.accent_amber,
            PALETTE.success,
            PALETTE.error,
        ],
    }
