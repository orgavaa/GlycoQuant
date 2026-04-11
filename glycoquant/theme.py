"""GlycoQuant visual design tokens — framework-agnostic.

A single source of truth for the brand palette, typography, and
Plotly layout template. Imported by:

- ``glycoquant.viz.*`` factories so Python-generated Plotly figures
  match the React frontend's look
- the FastAPI backend when it serializes figures to JSON
- any external consumer (notebooks, CI plots, papers) that wants
  to match the brand

Light-mode techbio palette (white background, deep navy text,
professional blue + teal accents). The corresponding CSS custom
properties live in ``frontend/src/index.css`` and must be kept in
sync with this module by hand.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Palette:
    """Canonical brand colors (light mode, techbio white)."""

    # Backgrounds
    bg_base: str = "#FFFFFF"  # pure white
    bg_subtle: str = "#F8FAFC"  # slate-50
    bg_muted: str = "#F1F5F9"  # slate-100
    bg_elevated: str = "#FFFFFF"  # cards

    # Borders
    border_subtle: str = "#E2E8F0"  # slate-200
    border_strong: str = "#CBD5E1"  # slate-300

    # Text
    text_primary: str = "#0F172A"  # slate-900
    text_secondary: str = "#475569"  # slate-600
    text_muted: str = "#94A3B8"  # slate-400

    # Accents
    accent_primary: str = "#0EA5E9"  # sky-500, the main brand blue
    accent_brand: str = "#0D9488"  # teal-600, the glycocalyx signature
    accent_violet: str = "#7C3AED"  # violet-600
    accent_amber: str = "#F59E0B"  # amber-500

    # Status
    success: str = "#16A34A"  # green-600
    warning: str = "#EA580C"  # orange-600
    error: str = "#DC2626"  # red-600
    info: str = "#0EA5E9"  # sky-500


PALETTE = Palette()


# Typography — used by Plotly figures and mirrored in frontend/src/index.css
FONT_SANS = '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
FONT_MONO = '"JetBrains Mono", "SF Mono", Consolas, "Liberation Mono", monospace'


def get_plotly_layout_template() -> dict:
    """Canonical Plotly layout dict for light-mode brand consistency.

    Every ``glycoquant.viz`` factory merges this into its Figure's
    ``update_layout`` call so all charts render with the same
    typography, grid color, and axis style regardless of whether
    they are shown in the React frontend, a Jupyter notebook, or a
    matplotlib export.
    """
    return {
        "paper_bgcolor": PALETTE.bg_base,
        "plot_bgcolor": PALETTE.bg_base,
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
                "weight": 600,
            },
            "x": 0.02,
            "xanchor": "left",
        },
        "xaxis": {
            "gridcolor": PALETTE.border_subtle,
            "zerolinecolor": PALETTE.border_strong,
            "linecolor": PALETTE.border_strong,
            "tickcolor": PALETTE.border_strong,
            "tickfont": {"color": PALETTE.text_secondary, "size": 10},
            "title": {"font": {"color": PALETTE.text_secondary, "size": 11}},
        },
        "yaxis": {
            "gridcolor": PALETTE.border_subtle,
            "zerolinecolor": PALETTE.border_strong,
            "linecolor": PALETTE.border_strong,
            "tickcolor": PALETTE.border_strong,
            "tickfont": {"color": PALETTE.text_secondary, "size": 10},
            "title": {"font": {"color": PALETTE.text_secondary, "size": 11}},
        },
        "legend": {
            "bgcolor": "rgba(255,255,255,0.9)",
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
