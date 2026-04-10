"""Tests for glycoquant.app.tab_imaging.

Split into two tiers:

1. **Pure helper tests** exercise ``build_overlay_figure`` and
   ``build_umap_figure`` directly. No Streamlit, runs in <1 s.

2. **Streamlit smoke tests** use ``streamlit.testing.v1.AppTest`` to
   boot ``main.py`` in-process, verify the app loads without errors,
   and simulate a demo-image load. These are slower (~5-10 s each)
   because they execute the Cellpose + DINOv2 pipeline end-to-end,
   so they are marked with ``@pytest.mark.slow`` and skipped by
   default in fast iteration.
"""
from __future__ import annotations

import os
from pathlib import Path

import numpy as np
import pandas as pd
import plotly.graph_objects as go
import pytest
from skimage.draw import disk

from glycoquant.app.tab_imaging import (
    DEMO_CONDITIONS,
    DEMO_DIR,
    build_overlay_figure,
    build_umap_figure,
)

IMAGE_SIZE = (512, 512)


# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def cell_mask(cell_specs: list) -> np.ndarray:
    mask = np.zeros(IMAGE_SIZE, dtype=np.int32)
    for i, spec in enumerate(cell_specs, start=1):
        rr, cc = disk(spec.center, spec.cell_radius, shape=IMAGE_SIZE)
        mask[rr, cc] = i
    return mask


@pytest.fixture(scope="module")
def nuclear_mask(cell_specs: list) -> np.ndarray:
    mask = np.zeros(IMAGE_SIZE, dtype=np.int32)
    for i, spec in enumerate(cell_specs, start=1):
        rr, cc = disk(spec.center, spec.nuclear_radius, shape=IMAGE_SIZE)
        mask[rr, cc] = i
    return mask


@pytest.fixture(scope="module")
def full_channels(
    synthetic_cell_image: np.ndarray,
    synthetic_nuclear_image: np.ndarray,
    synthetic_glycocalyx_image: np.ndarray,
    synthetic_yap_image: np.ndarray,
    synthetic_paxillin_image: np.ndarray,
) -> dict[str, np.ndarray]:
    return {
        "dapi": synthetic_nuclear_image,
        "glycocalyx": synthetic_glycocalyx_image,
        "yap": synthetic_yap_image,
        "paxillin": synthetic_paxillin_image,
        "actin": synthetic_cell_image,
    }


@pytest.fixture(scope="module")
def features_df(cell_specs: list) -> pd.DataFrame:
    """Minimal features DataFrame sufficient for the overlay layer."""
    rows = []
    for i, _ in enumerate(cell_specs, start=1):
        rows.append(
            {
                "cell_id": float(i),
                "cell_area": 5000.0 + i,
                "yap_nc_ratio": 2.0 if i < 3 else 0.5,
                "fa_count": 7 + i,
                "glycocalyx_pericellular_ratio": 4.2,
                "actin_stress_fiber_coherence": 0.65,
                "actin_dominant_orientation": 15.0,
            }
        )
    return pd.DataFrame(rows).set_index("cell_id")


# ---------------------------------------------------------------------------
# build_overlay_figure (pure, fast)
# ---------------------------------------------------------------------------


def test_overlay_figure_returns_plotly(
    full_channels: dict[str, np.ndarray],
    cell_mask: np.ndarray,
    nuclear_mask: np.ndarray,
    features_df: pd.DataFrame,
) -> None:
    fig = build_overlay_figure(
        channels=full_channels,
        cell_mask=cell_mask,
        nuclear_mask=nuclear_mask,
        features_df=features_df,
        paxillin_channel=full_channels["paxillin"],
        toggles={
            "cells": True,
            "nuclei": False,
            "glycocalyx_ring": False,
            "focal_adhesions": False,
            "actin_orientation": False,
        },
        selected_cell_id=None,
        filter_cell_ids=None,
    )
    assert isinstance(fig, go.Figure)
    # Heatmap base + 5 cell outline traces
    assert any(trace.type == "heatmap" for trace in fig.data)
    scatter_traces = [t for t in fig.data if t.type == "scatter"]
    assert len(scatter_traces) == 5  # one per cell outline


def test_overlay_all_toggles_on_adds_extra_traces(
    full_channels: dict[str, np.ndarray],
    cell_mask: np.ndarray,
    nuclear_mask: np.ndarray,
    features_df: pd.DataFrame,
) -> None:
    fig = build_overlay_figure(
        channels=full_channels,
        cell_mask=cell_mask,
        nuclear_mask=nuclear_mask,
        features_df=features_df,
        paxillin_channel=full_channels["paxillin"],
        toggles={
            "cells": True,
            "nuclei": True,
            "glycocalyx_ring": True,
            "focal_adhesions": True,
            "actin_orientation": True,
        },
        selected_cell_id=None,
        filter_cell_ids=None,
    )
    scatter_traces = [t for t in fig.data if t.type == "scatter"]
    # Expect more traces than the cells-only case (rings + FAs + orientations + nuclei)
    assert len(scatter_traces) > 5


def test_overlay_selected_cell_highlighted(
    full_channels: dict[str, np.ndarray],
    cell_mask: np.ndarray,
    nuclear_mask: np.ndarray,
    features_df: pd.DataFrame,
) -> None:
    fig = build_overlay_figure(
        channels=full_channels,
        cell_mask=cell_mask,
        nuclear_mask=nuclear_mask,
        features_df=features_df,
        paxillin_channel=full_channels["paxillin"],
        toggles={
            "cells": True,
            "nuclei": False,
            "glycocalyx_ring": False,
            "focal_adhesions": False,
            "actin_orientation": False,
        },
        selected_cell_id=2,
        filter_cell_ids=None,
    )
    # The selected cell's trace should have the orange highlight color
    selected_traces = [
        t
        for t in fig.data
        if t.type == "scatter" and t.line and t.line.color == "#FF9900"
    ]
    assert len(selected_traces) == 1


def test_overlay_filter_cell_ids_highlighted_red(
    full_channels: dict[str, np.ndarray],
    cell_mask: np.ndarray,
    nuclear_mask: np.ndarray,
    features_df: pd.DataFrame,
) -> None:
    fig = build_overlay_figure(
        channels=full_channels,
        cell_mask=cell_mask,
        nuclear_mask=nuclear_mask,
        features_df=features_df,
        paxillin_channel=full_channels["paxillin"],
        toggles={
            "cells": True,
            "nuclei": False,
            "glycocalyx_ring": False,
            "focal_adhesions": False,
            "actin_orientation": False,
        },
        selected_cell_id=None,
        filter_cell_ids={1, 3},
    )
    red_traces = [
        t
        for t in fig.data
        if t.type == "scatter" and t.line and t.line.color == "#D93025"
    ]
    assert len(red_traces) == 2


def test_overlay_figure_hover_customdata_carries_cell_id(
    full_channels: dict[str, np.ndarray],
    cell_mask: np.ndarray,
    nuclear_mask: np.ndarray,
    features_df: pd.DataFrame,
) -> None:
    """Every cell outline trace must carry its cell_id in customdata so
    Plotly click events return the ID directly.
    """
    fig = build_overlay_figure(
        channels=full_channels,
        cell_mask=cell_mask,
        nuclear_mask=nuclear_mask,
        features_df=features_df,
        paxillin_channel=full_channels["paxillin"],
        toggles={
            "cells": True,
            "nuclei": False,
            "glycocalyx_ring": False,
            "focal_adhesions": False,
            "actin_orientation": False,
        },
        selected_cell_id=None,
        filter_cell_ids=None,
    )
    cell_ids_seen: set[int] = set()
    for trace in fig.data:
        if trace.type == "scatter" and trace.customdata is not None:
            for entry in trace.customdata:
                # customdata can be int or list
                val = entry[0] if hasattr(entry, "__iter__") and not isinstance(entry, str) else entry
                cell_ids_seen.add(int(val))
    assert cell_ids_seen == {1, 2, 3, 4, 5}


# ---------------------------------------------------------------------------
# build_umap_figure (pure, fast)
# ---------------------------------------------------------------------------


def test_umap_figure_empty_embeddings_shows_placeholder() -> None:
    fig = build_umap_figure(
        coords=np.zeros((0, 2), dtype=np.float32),
        cell_ids=[],
        color_values=np.zeros(0),
        color_label="yap_nc_ratio",
    )
    assert isinstance(fig, go.Figure)
    assert len(fig.layout.annotations) >= 1
    assert "DINOv2" in fig.layout.annotations[0].text


def test_umap_figure_with_data_renders_scatter() -> None:
    coords = np.array([[0.0, 0.0], [1.0, 1.0], [2.0, 0.5]], dtype=np.float32)
    fig = build_umap_figure(
        coords=coords,
        cell_ids=[1, 2, 3],
        color_values=np.array([0.1, 0.5, 0.9]),
        color_label="yap_nc_ratio",
        selected_cell_id=2,
    )
    assert isinstance(fig, go.Figure)
    assert fig.data[0].type == "scatter"
    assert list(fig.data[0].x) == [0.0, 1.0, 2.0]
    # Selected cell should have a larger marker
    sizes = list(fig.data[0].marker.size)
    assert sizes[1] > sizes[0]


# ---------------------------------------------------------------------------
# Streamlit AppTest smoke tests (slow)
# ---------------------------------------------------------------------------


def _apptest_available() -> bool:
    try:
        from streamlit.testing.v1 import AppTest  # noqa: F401
    except ImportError:
        return False
    return True


@pytest.mark.skipif(
    not _apptest_available(),
    reason="streamlit.testing.v1.AppTest not importable",
)
def test_app_boots_without_errors() -> None:
    """Booting main.py via AppTest raises no exceptions.

    This is the fastest-possible smoke check — it runs the initial render
    with no state (no image loaded), which should display the 'load an
    image' info banner and nothing else.
    """
    from streamlit.testing.v1 import AppTest

    main_path = Path(__file__).resolve().parents[1] / "glycoquant" / "app" / "main.py"
    at = AppTest.from_file(str(main_path), default_timeout=30)
    at.run()
    assert not at.exception, f"App raised: {[str(e) for e in at.exception]}"


@pytest.mark.slow
@pytest.mark.skipif(
    not _apptest_available() or os.environ.get("GLYCOQUANT_SKIP_SLOW") == "1",
    reason="AppTest unavailable or GLYCOQUANT_SKIP_SLOW=1",
)
def test_app_loads_demo_image_and_runs_pipeline() -> None:
    """Full AppTest: load the control demo and run the pipeline.

    Requires cellpose weights to be cached (~1.2 GB). Skipped in fast
    iteration via GLYCOQUANT_SKIP_SLOW=1. This test only runs if the
    bundled demo TIFFs exist on disk.
    """
    from streamlit.testing.v1 import AppTest

    demo_path = DEMO_DIR / "control.tiff"
    if not demo_path.exists():
        pytest.skip(
            f"demo image not found at {demo_path}; "
            "run scripts/generate_demo_images.py first"
        )

    main_path = Path(__file__).resolve().parents[1] / "glycoquant" / "app" / "main.py"
    at = AppTest.from_file(str(main_path), default_timeout=600)
    at.run()
    assert not at.exception

    # The sidebar selectbox lets us pick a demo condition; simulate "control"
    # by writing directly into session state and rerunning.
    at.session_state["demo_selector"] = "control"
    at.run()
    assert not at.exception


# ---------------------------------------------------------------------------
# Constants sanity
# ---------------------------------------------------------------------------


def test_demo_conditions_constant_matches_expectation() -> None:
    assert DEMO_CONDITIONS == ("control", "siSDC1", "heparinase")
    assert DEMO_DIR.name == "demo"
