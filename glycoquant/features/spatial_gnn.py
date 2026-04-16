"""Spatial context GNN — Delaunay graph + message-passing GCN.

Builds a cell-neighbourhood graph from Delaunay triangulation of cell
centroids, then trains a lightweight 2-layer graph convolutional
network (GCN) to predict ``mechano_score`` from neighbourhood context.

The GCN is implemented with raw PyTorch + SciPy sparse ops — no
``torch_geometric`` dependency. This keeps the install simple while
still capturing first-order spatial relationships.

The key question this answers: *"How much of a cell's mechanical state
can be explained by its neighbours?"* A high R-squared means the tissue
has spatially coherent mechanical domains. A low R-squared means
mechanical state is cell-autonomous.

References
----------
- Kipf & Welling (2017). Semi-Supervised Classification with Graph Convolutional Networks.
- Palla et al. (2022). Squidpy: a scalable framework for spatial omics analysis.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd


@dataclass(frozen=True)
class SpatialGNNParams:
    """Hyperparameters for the spatial context GCN.

    Attributes
    ----------
    cv_strategy : str
        ``"spatial"`` (default) runs k-fold cross-validation with spatial
        block partitioning via k-means on centroids — every cell's
        neighbours can *only* leak into training if they belong to the
        same spatial block as the cell, which by construction they do
        not once the cell is in the held-out block. ``"random"`` falls
        back to the old random 80/20 split; this is kept for
        backwards-compat and for the small-image edge case where
        ``n_cells < 2 * cv_k``.
    cv_k : int
        Number of spatial folds. Each fold holds out one k-means
        cluster of centroids and trains on the remaining k-1.

    Spatial block CV is the standard statistical-honesty fix for
    autocorrelated graph data (Roberts *et al.*, *Ecography* 2017). A
    random split leaks information across the convolutional receptive
    field because adjacent nodes belong to overlapping neighbourhoods;
    the reported R² is systematically optimistic. Blocking by spatial
    cluster guarantees that when a cell is in the test fold, its
    Delaunay neighbours that contribute to its prediction are also in
    the test fold or on the boundary.
    """

    hidden_dim: int = 64
    n_layers: int = 2
    max_edge_dist_um: float = 100.0
    epochs: int = 80
    lr: float = 0.005
    train_fraction: float = 0.8  # only used when cv_strategy == "random"
    cv_strategy: str = "spatial"  # "spatial" | "random"
    cv_k: int = 5
    random_state: int = 42


@dataclass
class SpatialGNNResult:
    """Output of ``train_spatial_gnn``.

    Backward-compatible — the old fields (``r2_score``, ``node_importance``,
    …) keep their names and semantics. New fields are additive:

    - ``r2_score`` becomes the mean R² across spatial folds (single
      value when ``cv_strategy == "random"``).
    - ``r2_std`` reports fold-to-fold variability (0 for random CV).
    - ``fold_r2_scores`` lists per-fold R² so the UI can surface
      confidence intervals.
    - ``cv_strategy`` / ``cv_k`` echo the strategy *actually used* —
      may differ from the requested strategy if the fallback kicked in.
    """

    cell_ids: list[int]
    mechano_predicted: list[float]
    mechano_actual: list[float]
    edge_index: list[list[int]]  # [[src, tgt], ...]
    centroids: list[list[float]]  # [[x, y], ...]
    r2_score: float
    node_importance: dict[str, float]
    n_edges: int
    mean_neighbors: float
    r2_std: float = 0.0
    cv_strategy: str = "random"
    cv_k: int = 1
    fold_r2_scores: list[float] = field(default_factory=list)


# Interpretable feature columns used as node features (not deep_*)
_NODE_FEATURE_COLS = (
    "glycocalyx_pericellular_ratio",
    "glycocalyx_heterogeneity",
    "glycocalyx_mean_intensity",
    "glycocalyx_shannon_entropy",
    "yap_nc_ratio_size_corrected",
    "yap_nuclear_fraction",
    "fa_count",
    "fa_density_per_um2",
    "fa_mature_fraction",
    "actin_stress_fiber_coherence",
    "actin_cortical_ratio",
    "cell_area",
    "nuclear_aspect_ratio",
    "nuclear_solidity",
    "nuclear_to_cell_area_ratio",
)


def build_delaunay_graph(
    centroids: np.ndarray,
    pixel_size_um: float = 0.325,
    max_edge_dist_um: float = 100.0,
) -> tuple[np.ndarray, np.ndarray]:
    """Build a Delaunay triangulation and prune long edges.

    Parameters
    ----------
    centroids : np.ndarray, shape (n, 2)
        Cell centroid coordinates in pixel space.
    pixel_size_um : float
        Physical pixel size for distance thresholding.
    max_edge_dist_um : float
        Maximum edge length in microns. Edges longer than this are pruned.

    Returns
    -------
    edge_index : np.ndarray, shape (2, n_edges)
        Source and target node indices.
    edge_dists : np.ndarray, shape (n_edges,)
        Edge distances in microns.
    """
    from scipy.spatial import Delaunay

    if centroids.shape[0] < 4:
        return np.zeros((2, 0), dtype=np.int64), np.zeros(0, dtype=np.float32)

    tri = Delaunay(centroids)

    # Extract unique edges from triangulation
    edges_set: set[tuple[int, int]] = set()
    for simplex in tri.simplices:
        for i in range(3):
            for j in range(i + 1, 3):
                a, b = int(simplex[i]), int(simplex[j])
                edges_set.add((min(a, b), max(a, b)))

    if not edges_set:
        return np.zeros((2, 0), dtype=np.int64), np.zeros(0, dtype=np.float32)

    edges = np.array(list(edges_set), dtype=np.int64)
    # Compute distances in microns
    diffs = centroids[edges[:, 0]] - centroids[edges[:, 1]]
    dists = np.sqrt((diffs ** 2).sum(axis=1)) * pixel_size_um

    # Prune long edges
    mask = dists <= max_edge_dist_um
    edges = edges[mask]
    dists = dists[mask].astype(np.float32)

    # Make bidirectional
    edge_index = np.concatenate([edges, edges[:, ::-1]], axis=0).T

    return edge_index, np.concatenate([dists, dists])


def train_spatial_gnn(
    features_df: pd.DataFrame,
    pixel_size_um: float = 0.325,
    params: SpatialGNNParams | None = None,
) -> SpatialGNNResult:
    """Train a spatial GCN to predict mechano_score from neighbourhood.

    Parameters
    ----------
    features_df : pd.DataFrame
        Per-cell features with index ``cell_id``. Must contain
        ``centroid_x``, ``centroid_y``, and ``mechano_score``.

    Returns
    -------
    SpatialGNNResult
    """
    import torch

    if params is None:
        params = SpatialGNNParams()

    rng = np.random.RandomState(params.random_state)

    # Extract centroids
    if "centroid_x" not in features_df.columns or "centroid_y" not in features_df.columns:
        # Compute centroids from cell_area proxy — use index position as fallback
        raise ValueError("features_df must contain centroid_x and centroid_y columns")

    centroids = features_df[["centroid_x", "centroid_y"]].values.astype(np.float64)
    cell_ids = [int(c) for c in features_df.index.tolist()]

    # Build graph
    edge_index, edge_dists = build_delaunay_graph(
        centroids, pixel_size_um, params.max_edge_dist_um
    )

    # Node features
    avail_cols = [c for c in _NODE_FEATURE_COLS if c in features_df.columns]
    if not avail_cols:
        raise ValueError("No interpretable feature columns found for GNN node features")

    X = features_df[avail_cols].values.astype(np.float32)
    # Standardize
    col_mean = np.nanmean(X, axis=0, keepdims=True)
    col_std = np.nanstd(X, axis=0, keepdims=True)
    col_std[col_std < 1e-8] = 1.0
    X = np.nan_to_num((X - col_mean) / col_std, nan=0.0)

    # Target: mechano_score
    if "mechano_score" not in features_df.columns:
        raise ValueError("mechano_score column not found")
    y = features_df["mechano_score"].values.astype(np.float32)
    y = np.nan_to_num(y, nan=0.0)

    n_nodes = X.shape[0]
    n_features = X.shape[1]

    # Build sparse adjacency matrix (normalized: D^{-1/2} A D^{-1/2})
    from scipy.sparse import coo_matrix

    if edge_index.shape[1] > 0:
        src, tgt = edge_index[0], edge_index[1]
        vals = np.ones(len(src), dtype=np.float32)
        A = coo_matrix((vals, (src, tgt)), shape=(n_nodes, n_nodes)).tocsr()
        # Add self-loops
        A = A + coo_matrix(np.eye(n_nodes, dtype=np.float32)).tocsr()
        # Degree normalization: D^{-1/2} A D^{-1/2}
        deg = np.array(A.sum(axis=1)).flatten()
        deg_inv_sqrt = np.where(deg > 0, 1.0 / np.sqrt(deg), 0.0)
        D_inv_sqrt = coo_matrix(np.diag(deg_inv_sqrt)).tocsr()
        A_norm = D_inv_sqrt @ A @ D_inv_sqrt
    else:
        A_norm = coo_matrix(np.eye(n_nodes, dtype=np.float32)).tocsr()

    # Convert to torch
    A_dense = torch.tensor(A_norm.toarray(), dtype=torch.float32)
    X_t = torch.tensor(X, dtype=torch.float32)
    y_t = torch.tensor(y, dtype=torch.float32)

    # Decide CV strategy. Spatial block CV needs enough cells per fold
    # for a meaningful R² estimate on the held-out cluster. We require:
    # (a) at least 10 cells total — fewer than that, no CV is
    # defensible and we fall back to random.
    # (b) at least 10 cells per fold — so effective_cv_k is adapted
    # downward from the requested ``cv_k`` when the image is mid-sized.
    # A 40-cell image with cv_k=5 requested therefore runs with
    # effective_cv_k=4 (10 cells per fold). A 100-cell image runs with
    # the full 5.
    cv_strategy_requested = params.cv_strategy
    _MIN_CELLS_FOR_SPATIAL_CV = 10
    effective_cv_k = max(2, min(params.cv_k, n_nodes // _MIN_CELLS_FOR_SPATIAL_CV))
    if (
        cv_strategy_requested == "spatial"
        and n_nodes >= _MIN_CELLS_FOR_SPATIAL_CV
        and n_nodes >= 2 * effective_cv_k
    ):
        cv_strategy_used = "spatial"
    else:
        cv_strategy_used = "random"
        effective_cv_k = params.cv_k  # restored just for result reporting

    # Per-cell out-of-fold predictions accumulator. Each cell is in
    # exactly one test fold, so this vector is populated exactly once
    # per cell by the time CV finishes.
    oof_predictions = np.full(n_nodes, np.nan, dtype=np.float32)
    fold_r2_scores: list[float] = []

    if cv_strategy_used == "spatial":
        fold_labels = _assign_spatial_folds(
            centroids, effective_cv_k, random_state=params.random_state
        )
        for fold_id in range(effective_cv_k):
            test_idx = np.where(fold_labels == fold_id)[0]
            train_idx = np.where(fold_labels != fold_id)[0]
            # Guard against empty-test folds (k-means can produce them
            # on pathological geometry). Skip instead of crashing.
            if len(train_idx) < 2 or len(test_idx) < 1:
                continue
            preds, r2 = _train_and_evaluate_fold(
                A_dense, X_t, y_t, y,
                train_idx, test_idx,
                n_features, params,
                seed=params.random_state + fold_id,
            )
            oof_predictions[test_idx] = preds[test_idx]
            fold_r2_scores.append(r2)
        k_used = len(fold_r2_scores)
    else:
        # Single random 80/20 split — old behaviour.
        n_train = max(4, int(n_nodes * params.train_fraction))
        perm = rng.permutation(n_nodes)
        train_idx = perm[:n_train]
        test_idx = perm[n_train:]
        preds, r2 = _train_and_evaluate_fold(
            A_dense, X_t, y_t, y,
            train_idx, test_idx,
            n_features, params,
            seed=params.random_state,
        )
        # In random mode, "out-of-fold" predictions only cover the test
        # split; training-set cells receive the in-sample prediction
        # from the same model so the UI still has a value per cell.
        oof_predictions[:] = preds
        fold_r2_scores.append(r2)
        k_used = 1

    # Final aggregate R² and std across folds.
    if fold_r2_scores:
        r2_mean = float(np.mean(fold_r2_scores))
        r2_std = float(np.std(fold_r2_scores))
    else:
        r2_mean = 0.0
        r2_std = 0.0

    # Feature importance: train a single full-graph model (all cells)
    # so the importance is stable and deterministic across calls with
    # the same random_state. Runtime: one extra 80-epoch pass; <1 s
    # on typical images. Using a fixed seed here (distinct from the
    # fold seeds) ensures identical output on repeated invocation.
    full_train_idx = np.arange(n_nodes)
    # Reuse the same train/test path for simplicity — test_idx is
    # ignored for importance, so pick the first cell to avoid an
    # empty-test crash in _train_and_evaluate_fold.
    _full_preds, _full_r2, W1_full = _train_full_graph_for_importance(
        A_dense, X_t, y_t, full_train_idx, n_features, params,
        seed=params.random_state,
    )
    importance_raw = np.linalg.norm(W1_full, axis=1)
    importance_normed = importance_raw / (importance_raw.sum() + 1e-10)
    node_importance = {
        col: float(importance_normed[i]) for i, col in enumerate(avail_cols)
    }

    # Mean neighbors
    if edge_index.shape[1] > 0:
        _unique, counts = np.unique(edge_index[0], return_counts=True)
        mean_nbrs = float(counts.mean())
    else:
        mean_nbrs = 0.0

    # Fill any residual NaN predictions from skipped folds with 0.0 so
    # the JSON payload is well-formed; the corresponding R² already
    # reflects the skip because it wasn't appended to fold_r2_scores.
    oof_filled = np.nan_to_num(oof_predictions, nan=0.0)

    return SpatialGNNResult(
        cell_ids=cell_ids,
        mechano_predicted=oof_filled.tolist(),
        mechano_actual=y.tolist(),
        edge_index=edge_index.T.tolist() if edge_index.shape[1] > 0 else [],
        centroids=centroids.tolist(),
        r2_score=r2_mean,
        node_importance=node_importance,
        n_edges=edge_index.shape[1] // 2,
        mean_neighbors=mean_nbrs,
        r2_std=r2_std,
        cv_strategy=cv_strategy_used,
        cv_k=k_used,
        fold_r2_scores=list(fold_r2_scores),
    )


# ---------------------------------------------------------------------------
# Spatial CV helpers
# ---------------------------------------------------------------------------


def _assign_spatial_folds(
    centroids: np.ndarray,
    cv_k: int,
    random_state: int,
) -> np.ndarray:
    """K-means on centroids → integer fold label in ``[0, cv_k)`` per cell.

    Standard Euclidean k-means on (x, y) centroids. Deterministic given
    ``random_state``. Centroids are already in pixel space which is
    isotropic for square pixels — no rescaling needed.
    """
    from sklearn.cluster import KMeans

    km = KMeans(
        n_clusters=cv_k,
        random_state=random_state,
        n_init=10,  # explicit to suppress the sklearn 1.4 deprecation warning
    )
    return km.fit_predict(centroids).astype(np.int64)


def _train_and_evaluate_fold(
    A_dense,  # noqa: ANN001 - torch.Tensor
    X_t,  # noqa: ANN001
    y_t,  # noqa: ANN001
    y: np.ndarray,
    train_idx: np.ndarray,
    test_idx: np.ndarray,
    n_features: int,
    params: SpatialGNNParams,
    seed: int,
) -> tuple[np.ndarray, float]:
    """Train a fresh 2-layer GCN on ``train_idx`` and report R² on ``test_idx``.

    Deterministic given ``seed``: weights are initialised from a seeded
    generator so fold-to-fold comparisons are reproducible.
    """
    import torch
    import torch.nn as nn
    import torch.nn.functional as F

    gen = torch.Generator().manual_seed(int(seed))
    W1 = nn.Parameter(
        torch.randn(n_features, params.hidden_dim, generator=gen) * 0.1
    )
    b1 = nn.Parameter(torch.zeros(params.hidden_dim))
    W2 = nn.Parameter(
        torch.randn(params.hidden_dim, 1, generator=gen) * 0.1
    )
    b2 = nn.Parameter(torch.zeros(1))

    optimizer = torch.optim.Adam([W1, b1, W2, b2], lr=params.lr)
    train_idx_t = torch.as_tensor(train_idx, dtype=torch.long)

    for _ in range(params.epochs):
        H = F.relu(A_dense @ X_t @ W1 + b1)
        y_hat = (A_dense @ H @ W2 + b2).squeeze(-1)
        loss = F.mse_loss(y_hat[train_idx_t], y_t[train_idx_t])
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()

    with torch.no_grad():
        H = F.relu(A_dense @ X_t @ W1 + b1)
        y_hat = (A_dense @ H @ W2 + b2).squeeze(-1)
        preds = y_hat.numpy()

    if len(test_idx) > 1:
        y_test = y[test_idx]
        y_pred_test = preds[test_idx]
        ss_res = float(np.sum((y_test - y_pred_test) ** 2))
        ss_tot = float(np.sum((y_test - y_test.mean()) ** 2))
        r2 = 1.0 - ss_res / (ss_tot + 1e-10)
    else:
        r2 = 0.0
    return preds, float(r2)


def _train_full_graph_for_importance(
    A_dense,  # noqa: ANN001
    X_t,  # noqa: ANN001
    y_t,  # noqa: ANN001
    train_idx: np.ndarray,
    n_features: int,
    params: SpatialGNNParams,
    seed: int,
) -> tuple[np.ndarray, float, np.ndarray]:
    """Train once on every cell; return predictions, R², and W1 weights.

    Feature importance is reported from this single full-graph model
    (not averaged across folds) so the output is deterministic across
    repeated invocations with the same ``seed``.
    """
    import torch
    import torch.nn as nn
    import torch.nn.functional as F

    gen = torch.Generator().manual_seed(int(seed))
    W1 = nn.Parameter(
        torch.randn(n_features, params.hidden_dim, generator=gen) * 0.1
    )
    b1 = nn.Parameter(torch.zeros(params.hidden_dim))
    W2 = nn.Parameter(
        torch.randn(params.hidden_dim, 1, generator=gen) * 0.1
    )
    b2 = nn.Parameter(torch.zeros(1))
    optimizer = torch.optim.Adam([W1, b1, W2, b2], lr=params.lr)
    train_idx_t = torch.as_tensor(train_idx, dtype=torch.long)
    for _ in range(params.epochs):
        H = F.relu(A_dense @ X_t @ W1 + b1)
        y_hat = (A_dense @ H @ W2 + b2).squeeze(-1)
        loss = F.mse_loss(y_hat[train_idx_t], y_t[train_idx_t])
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
    with torch.no_grad():
        H = F.relu(A_dense @ X_t @ W1 + b1)
        y_hat = (A_dense @ H @ W2 + b2).squeeze(-1)
        preds = y_hat.numpy()
    return preds, 0.0, W1.detach().numpy()
