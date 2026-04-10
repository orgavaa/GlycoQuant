"""GlycoQuant Streamlit entry point — 3-tab dashboard."""
from __future__ import annotations

from pathlib import Path
from typing import Any

import streamlit as st
import yaml

from glycoquant.app import tab_imaging, tab_prioritization

CONFIG_PATH = Path(__file__).resolve().parents[2] / "configs" / "default.yaml"


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
    next-experiment recommendation (Phase 7).
    """
    config = load_config()
    app_cfg = config["app"]

    st.set_page_config(
        page_title=app_cfg["title"],
        page_icon=app_cfg["page_icon"],
        layout=app_cfg["layout"],
    )

    st.title(app_cfg["title"])
    st.caption(
        "Labouesse group · ETH Zurich · Tibbitt Macromolecular Engineering Lab"
    )

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
        st.header("Experiment Designer")
        st.info(
            "Phase 0 scaffold. GP-based active learning for experiment "
            "recommendation arrives in Phase 7 (branch: feat/app-experiment)."
        )


if __name__ == "__main__":
    main()
