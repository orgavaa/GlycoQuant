"""Tests for glycoquant.features.spatial_gnn.

Covers:
- Delaunay graph construction with long-edge pruning.
- Spatial block CV via k-means on centroids — the SOTA fix for graph
  autocorrelation leakage that used to inflate the reported R².
- Random-split fallback on small images.
- Feature importance determinism under a fixed random_state.

The synthetic fixtures are deliberately simple (grid or gradient) so
the expected R² orderings are grounded in geometry rather than in the
GCN's internal dynamics.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from glycoquant.features.spatial_gnn import (
    SpatialGNNParams,
    build_delaunay_graph,
    train_spatial_gnn,
)

# Torch/sklearn are imported lazily by the GNN; skip if torch missing.
pytest.importorskip("torch")
pytest.importorskip("sklearn")


# ---------------------------------------------------------------------------
# Delaunay graph construction
# ---------------------------------------------------------------------------


def test_build_delaunay_graph_prunes_long_edges() -> None:
    """Centroids spread across a 1000 px canvas at 0.325 µm/px → some edges
    exceed the 100 µm default cutoff and must be pruned.
    """
    # 4 cells at the corners of a 1000 px canvas; longest edge ≈ 1414 px ≈
    # 459 µm. Shortest edge ≈ 1000 px ≈ 325 µm. Both above 100 µm → all pruned.
    centroids = np.array(
        [[0.0, 0.0], [1000.0, 0.0], [0.0, 1000.0], [1000.0, 1000.0]]
    )
    edge_index, _ = build_delaunay_graph(
        centroids, pixel_size_um=0.325, max_edge_dist_um=100.0
    )
    assert edge_index.shape[1] == 0

    # Widen the cutoff past the longest edge → diagonal still gets pruned
    # but the 4 axis-aligned edges (325 µm) survive.
    edge_index, _ = build_delaunay_graph(
        centroids, pixel_size_um=0.325, max_edge_dist_um=400.0
    )
    # Bidirectional edges: 4 undirected → 8 directed entries
    assert edge_index.shape[1] == 8


def _build_spatial_df(n: int, seed: int, spatial_signal: bool) -> pd.DataFrame:
    """Synthetic per-cell DataFrame on a square grid.

    ``spatial_signal=True`` makes ``mechano_score`` a function of
    centroid_x so a spatially-aware predictor can exploit it;
    ``spatial_signal=False`` randomises the target so no spatial
    structure is available and R² should land near zero (or worse
    under spatial CV where the train/test distributions differ).
    """
    rng = np.random.default_rng(seed)
    side = int(np.ceil(np.sqrt(n)))
    xs, ys = np.meshgrid(np.arange(side), np.arange(side))
    xs = xs.flatten()[:n].astype(np.float64) * 40.0  # ~13 µm spacing at 0.325 µm/px
    ys = ys.flatten()[:n].astype(np.float64) * 40.0
    if spatial_signal:
        mechano = (xs / xs.max()) + rng.normal(0.0, 0.05, size=n)
    else:
        mechano = rng.normal(0.0, 1.0, size=n)
    return pd.DataFrame(
        {
            "centroid_x": xs,
            "centroid_y": ys,
            "mechano_score": mechano,
            # Interpretable node features (any subset of the module's
            # _NODE_FEATURE_COLS is fine; we just need > 0).
            "glycocalyx_pericellular_ratio": rng.normal(1.0, 0.2, size=n),
            "glycocalyx_heterogeneity": rng.normal(0.3, 0.1, size=n),
            "yap_nc_ratio_size_corrected": rng.normal(1.5, 0.3, size=n),
            "fa_count": rng.normal(50.0, 15.0, size=n),
            "cell_area": rng.normal(2000.0, 500.0, size=n),
        },
        index=pd.Index(range(1, n + 1), name="cell_id"),
    )


def test_spatial_cv_runs_k_folds() -> None:
    """Spatial mode on a 100-cell grid runs 5 folds and reports std."""
    df = _build_spatial_df(n=100, seed=42, spatial_signal=True)
    params = SpatialGNNParams(
        cv_strategy="spatial", cv_k=5, epochs=30, random_state=42
    )
    result = train_spatial_gnn(df, pixel_size_um=0.325, params=params)

    assert result.cv_strategy == "spatial"
    assert result.cv_k == 5
    assert len(result.fold_r2_scores) == 5
    assert np.isfinite(result.r2_std)
    # Mean R² should equal the average of per-fold scores
    assert result.r2_score == pytest.approx(
        float(np.mean(result.fold_r2_scores)), abs=1e-6
    )


@pytest.mark.slow
def test_spatial_cv_more_conservative_than_random() -> None:
    """Spatial CV must report a stricter R² than random CV on spatially
    structured data — this is the whole scientific point of Fix 5.

    Marked slow because it runs the GCN twice on 100 cells.
    """
    df = _build_spatial_df(n=100, seed=1, spatial_signal=True)

    spatial = train_spatial_gnn(
        df,
        pixel_size_um=0.325,
        params=SpatialGNNParams(
            cv_strategy="spatial", cv_k=5, epochs=30, random_state=1
        ),
    )
    random_cv = train_spatial_gnn(
        df,
        pixel_size_um=0.325,
        params=SpatialGNNParams(
            cv_strategy="random", epochs=30, random_state=1
        ),
    )

    # Spatial CV's held-out cluster is a geographically distinct region;
    # the model has NOT seen any of those cells' neighbours. Random CV
    # lets neighbour info leak through the graph convolution. Spatial
    # R² must therefore be <= random R² on spatially-structured data.
    # Tolerate a small epsilon because both estimators carry noise.
    assert spatial.r2_score <= random_cv.r2_score + 0.05


def test_spatial_cv_falls_back_on_small_image() -> None:
    """Below 2 · cv_k cells the spatial partition cannot produce
    non-empty train+test folds; the function must gracefully fall
    back to the random split and report the actual strategy used.
    """
    df = _build_spatial_df(n=6, seed=0, spatial_signal=False)
    params = SpatialGNNParams(
        cv_strategy="spatial", cv_k=5, epochs=20, random_state=0
    )
    result = train_spatial_gnn(df, pixel_size_um=0.325, params=params)
    assert result.cv_strategy == "random"
    assert result.cv_k == 1
    assert len(result.fold_r2_scores) == 1


def test_spatial_cv_k_adapts_to_mid_sized_images() -> None:
    """40-cell image with cv_k=5 requested runs with effective k=4 (≥10 cells/fold).

    This is the Fix 7 adaptivity — a mid-sized image no longer falls
    through to a single random split just because the requested cv_k
    produces folds smaller than 10 cells.
    """
    df = _build_spatial_df(n=40, seed=3, spatial_signal=True)
    params = SpatialGNNParams(
        cv_strategy="spatial", cv_k=5, epochs=20, random_state=3
    )
    result = train_spatial_gnn(df, pixel_size_um=0.325, params=params)
    assert result.cv_strategy == "spatial"
    # 40 // 10 = 4 folds, bounded below by 2
    assert result.cv_k == 4
    assert len(result.fold_r2_scores) == 4


def test_feature_importance_deterministic_across_cv_calls() -> None:
    """Same random_state → byte-identical feature importance dict.

    The full-graph importance pass uses a dedicated seed that does not
    drift across invocations. If this test fails, someone removed the
    deterministic weight initialisation.
    """
    df = _build_spatial_df(n=60, seed=7, spatial_signal=True)
    params = SpatialGNNParams(
        cv_strategy="spatial", cv_k=4, epochs=20, random_state=7
    )
    a = train_spatial_gnn(df, pixel_size_um=0.325, params=params)
    b = train_spatial_gnn(df, pixel_size_um=0.325, params=params)
    assert set(a.node_importance) == set(b.node_importance)
    for key in a.node_importance:
        assert a.node_importance[key] == pytest.approx(
            b.node_importance[key], abs=1e-7
        ), key
