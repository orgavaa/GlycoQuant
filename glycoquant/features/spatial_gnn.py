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

from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd


@dataclass(frozen=True)
class SpatialGNNParams:
    """Hyperparameters for the spatial context GCN."""
    hidden_dim: int = 64
    n_layers: int = 2
    max_edge_dist_um: float = 100.0
    epochs: int = 80
    lr: float = 0.005
    train_fraction: float = 0.8
    random_state: int = 42


@dataclass
class SpatialGNNResult:
    """Output of ``train_spatial_gnn``."""
    cell_ids: list[int]
    mechano_predicted: list[float]
    mechano_actual: list[float]
    edge_index: list[list[int]]  # [[src, tgt], ...]
    centroids: list[list[float]]  # [[x, y], ...]
    r2_score: float
    node_importance: dict[str, float]
    n_edges: int
    mean_neighbors: float


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
    import torch.nn.functional as F

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

    # Train/test split
    n_train = max(4, int(n_nodes * params.train_fraction))
    perm = rng.permutation(n_nodes)
    train_idx = perm[:n_train]
    test_idx = perm[n_train:]

    # Simple 2-layer GCN — use nn.Parameter so optimizer can track them
    import torch.nn as nn
    W1 = nn.Parameter(torch.randn(n_features, params.hidden_dim) * 0.1)
    b1 = nn.Parameter(torch.zeros(params.hidden_dim))
    W2 = nn.Parameter(torch.randn(params.hidden_dim, 1) * 0.1)
    b2 = nn.Parameter(torch.zeros(1))

    optimizer = torch.optim.Adam([W1, b1, W2, b2], lr=params.lr)

    for epoch in range(params.epochs):
        # Forward: H = ReLU(A_norm @ X @ W1 + b1)
        H = F.relu(A_dense @ X_t @ W1 + b1)
        # Output: y_hat = A_norm @ H @ W2 + b2
        y_hat = (A_dense @ H @ W2 + b2).squeeze(-1)

        loss = F.mse_loss(y_hat[train_idx], y_t[train_idx])
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()

    # Evaluate
    with torch.no_grad():
        H = F.relu(A_dense @ X_t @ W1 + b1)
        y_hat = (A_dense @ H @ W2 + b2).squeeze(-1)
        predictions = y_hat.numpy()

    # R-squared on test set
    if len(test_idx) > 1:
        y_test = y[test_idx]
        y_pred_test = predictions[test_idx]
        ss_res = np.sum((y_test - y_pred_test) ** 2)
        ss_tot = np.sum((y_test - y_test.mean()) ** 2)
        r2 = 1.0 - ss_res / (ss_tot + 1e-10)
    else:
        r2 = 0.0

    # Feature importance: |W1| column norms (how much each input feature matters)
    w1_np = W1.detach().numpy()
    importance_raw = np.linalg.norm(w1_np, axis=1)
    importance_normed = importance_raw / (importance_raw.sum() + 1e-10)
    node_importance = {col: float(importance_normed[i]) for i, col in enumerate(avail_cols)}

    # Mean neighbors
    if edge_index.shape[1] > 0:
        unique, counts = np.unique(edge_index[0], return_counts=True)
        mean_nbrs = float(counts.mean())
    else:
        mean_nbrs = 0.0

    return SpatialGNNResult(
        cell_ids=cell_ids,
        mechano_predicted=predictions.tolist(),
        mechano_actual=y.tolist(),
        edge_index=edge_index.T.tolist() if edge_index.shape[1] > 0 else [],
        centroids=centroids.tolist(),
        r2_score=float(r2),
        node_importance=node_importance,
        n_edges=edge_index.shape[1] // 2,
        mean_neighbors=mean_nbrs,
    )
