"""GlycoQuant Streamlit entry point — 3-tab dashboard."""
from __future__ import annotations

from pathlib import Path
from typing import Any

import streamlit as st
import yaml

from glycoquant.app import tab_imaging, tab_prioritization
from glycoquant.app.styles import inject_global_styles, render_app_header

CONFIG_PATH = Path(__file__).resolve().parents[2] / "configs" / "default.yaml"
APP_VERSION = "v0.2.0"


def load_config(path: Path = CONFIG_PATH) -> dict[str, Any]:
    """Load the YAML config shared across the app.

    Parameters
    ----------
    path : Path
        Path to the YAML config file. Defaults to ``configs/default.yaml``
        relative to the repo root.

    Returns
    -------
    dict
        Parsed configuration dictionary.
    """
    with path.open("r", encoding="utf-8") as fh:
        return yaml.safe_load(fh)


def main() -> None:
    """Launch the GlycoQuant 3-tab dashboard.

    Tab 1 — Image Analysis: Cellpose segmentation + per-cell glycocalyx
    and mechanotransduction features (Phase 5).

    Tab 2 — Perturbation Prioritization: dual-prior (Geneformer +
    STRING/Reactome pathway) ranking table with divergence column
    (Phase 6). Uses pre-computed JSON priors only; no runtime model
    loading.

    Tab 3 — Experiment Designer: Gaussian-process active learning for
    next-experiment recommendation (deferred).
    """
    config = load_config()

    st.set_page_config(
        page_title="GlycoQuant",
        page_icon="◈",
        layout="wide",
        initial_sidebar_state="expanded",
    )

    inject_global_styles()
    render_app_header(version=APP_VERSION, institution="ETH Zürich · D-MAVT")

    tab_imaging_container, tab_prioritization_container, tab_experiment = st.tabs(
        [
            "Image Analysis",
            "Perturbation Prioritization",
            "Experiment Designer",
        ]
    )

    with tab_imaging_container:
        tab_imaging.render(config)

    with tab_prioritization_container:
        tab_prioritization.render(config)

    with tab_experiment:
        st.info(
            "Experiment Designer — Gaussian-process active learning for "
            "next-experiment recommendation. Deferred for the initial "
            "release; see the roadmap in the README for the planned "
            "design."
        )


if __name__ == "__main__":
    main()
