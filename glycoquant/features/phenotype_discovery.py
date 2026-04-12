"""Cell phenotype discovery via UMAP + Leiden clustering on deep embeddings.

Given a per-cell DataFrame containing DINOv2 or Cell-DINO columns
(``deep_000`` ... ``deep_767`` or ``deep_dapi_0000`` ... ``deep_actin_1023``),
this module:

1. Extracts the deep-embedding submatrix.
2. Optionally applies PCA pre-reduction to 50 dims (recommended for >500 cells).
3. Runs UMAP to produce a 2-D landscape.
4. Builds a k-NN graph from the UMAP fuzzy-simplicial-set.
5. Applies Leiden community detection to partition cells into phenotype clusters.
6. Generates per-cluster summary statistics over the interpretable features.

The output is a ``PhenotypeResult`` dataclass that the backend serializes
directly into a JSON response for the frontend "Cell Atlas" view.

References
----------
- McInnes et al. (2018). UMAP: Uniform Manifold Approximation and Projection.
- Traag et al. (2019). From Louvain to Leiden: guaranteeing well-connected communities.
- Becht et al. (2019). Dimensionality reduction for visualizing single-cell data using UMAP.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd


@dataclass(frozen=True)
class PhenotypeDiscoveryParams:
    """Parameters for the UMAP + Leiden pipeline."""
    n_neighbors: int = 15
    min_dist: float = 0.1
    leiden_resolution: float = 1.0
    pca_dims: int = 50
    random_state: int = 42


@dataclass
class ClusterSummary:
    """Per-cluster statistics over interpretable features."""
    cluster_id: int
    size: int
    fraction: float
    # Mean of key features within this cluster
    mean_features: dict[str, float]


@dataclass
class PhenotypeResult:
    """Output of ``discover_phenotypes``."""
    cell_ids: list[int]
    umap_x: list[float]
    umap_y: list[float]
    cluster_labels: list[int]
    n_clusters: int
    cluster_sizes: dict[int, int]
    cluster_summaries: list[ClusterSummary]


# Interpretable feature columns used for per-cluster summaries.
_SUMMARY_FEATURES = (
    "glycocalyx_pericellular_ratio",
    "glycocalyx_heterogeneity",
    "yap_nc_ratio_size_corrected",
    "fa_mature_fraction",
    "fa_density_per_um2",
    "actin_stress_fiber_coherence",
    "mechano_score",
    "cell_area",
    "nuclear_aspect_ratio",
)


def discover_phenotypes(
    features_df: pd.DataFrame,
    params: PhenotypeDiscoveryParams | None = None,
) -> PhenotypeResult:
    """Run UMAP + Leiden on the deep-embedding columns of a per-cell DataFrame.

    Parameters
    ----------
    features_df : pd.DataFrame
        Must contain ``deep_*`` columns. Index is ``cell_id``.
    params : PhenotypeDiscoveryParams, optional
        UMAP and Leiden hyperparameters.

    Returns
    -------
    PhenotypeResult
        Per-cell UMAP coordinates and cluster labels plus cluster summaries.

    Raises
    ------
    ValueError
        If no ``deep_*`` columns are found.
    """
    if params is None:
        params = PhenotypeDiscoveryParams()

    # Extract deep-embedding columns
    deep_cols = [c for c in features_df.columns if c.startswith("deep_")]
    if not deep_cols:
        raise ValueError(
            "No deep_* columns found in features_df. "
            "Run analysis with include_deep_features=True."
        )

    X = features_df[deep_cols].values.astype(np.float32)
    n_cells = X.shape[0]

    # Handle NaN rows (cells where embedding failed)
    valid_mask = np.isfinite(X).all(axis=1)
    X_valid = X[valid_mask]

    if X_valid.shape[0] < 5:
        raise ValueError(
            f"Only {X_valid.shape[0]} cells have valid embeddings — need at least 5."
        )

    # PCA pre-reduction if embedding dim > pca_dims and enough cells
    if X_valid.shape[1] > params.pca_dims and X_valid.shape[0] > params.pca_dims:
        from sklearn.decomposition import PCA
        X_reduced = PCA(
            n_components=params.pca_dims, random_state=params.random_state
        ).fit_transform(X_valid)
    else:
        X_reduced = X_valid

    # UMAP to 2D
    import umap

    reducer = umap.UMAP(
        n_neighbors=min(params.n_neighbors, X_reduced.shape[0] - 1),
        min_dist=params.min_dist,
        n_components=2,
        random_state=params.random_state,
        metric="cosine",
    )
    embedding_2d = reducer.fit_transform(X_reduced)

    # Leiden clustering on the UMAP k-NN graph
    cluster_labels = _leiden_from_umap(
        reducer, X_reduced, params.leiden_resolution
    )

    # Map back to full cell list (invalid cells get cluster -1)
    all_umap_x = np.full(n_cells, np.nan, dtype=np.float32)
    all_umap_y = np.full(n_cells, np.nan, dtype=np.float32)
    all_clusters = np.full(n_cells, -1, dtype=np.int32)
    valid_indices = np.where(valid_mask)[0]
    all_umap_x[valid_indices] = embedding_2d[:, 0].astype(np.float32)
    all_umap_y[valid_indices] = embedding_2d[:, 1].astype(np.float32)
    all_clusters[valid_indices] = cluster_labels

    # Cluster statistics
    unique_clusters = sorted(set(int(c) for c in cluster_labels))
    n_clusters = len(unique_clusters)
    cluster_sizes = {int(c): int((cluster_labels == c).sum()) for c in unique_clusters}

    # Per-cluster summaries over interpretable features
    avail_summary_feats = [f for f in _SUMMARY_FEATURES if f in features_df.columns]
    summaries: list[ClusterSummary] = []
    for cid in unique_clusters:
        mask = all_clusters == cid
        subset = features_df.iloc[mask]
        mean_feats: dict[str, float] = {}
        for feat in avail_summary_feats:
            vals = subset[feat].dropna()
            mean_feats[feat] = float(vals.mean()) if len(vals) > 0 else float("nan")
        summaries.append(ClusterSummary(
            cluster_id=cid,
            size=int(mask.sum()),
            fraction=float(mask.sum()) / n_cells,
            mean_features=mean_feats,
        ))

    cell_ids = features_df.index.tolist()
    if hasattr(cell_ids[0], '__int__'):
        cell_ids = [int(c) for c in cell_ids]

    return PhenotypeResult(
        cell_ids=cell_ids,
        umap_x=all_umap_x.tolist(),
        umap_y=all_umap_y.tolist(),
        cluster_labels=all_clusters.tolist(),
        n_clusters=n_clusters,
        cluster_sizes=cluster_sizes,
        cluster_summaries=summaries,
    )


def _leiden_from_umap(
    reducer,  # umap.UMAP fitted instance
    X: np.ndarray,
    resolution: float,
) -> np.ndarray:
    """Extract the k-NN graph from a fitted UMAP and run Leiden."""
    try:
        import igraph as ig
        import leidenalg
    except ImportError:
        # Fallback: use sklearn KMeans if leidenalg not installed
        from sklearn.cluster import KMeans
        n_clusters = max(2, min(10, X.shape[0] // 20))
        km = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
        return km.fit_predict(X)

    # Build k-NN graph from the UMAP fuzzy simplicial set (connectivity matrix)
    graph_data = reducer.graph_
    # Convert scipy sparse to igraph
    sources, targets = graph_data.nonzero()
    weights = np.asarray(graph_data[sources, targets]).flatten()

    # Build undirected graph
    n_vertices = X.shape[0]
    edges = list(zip(sources.tolist(), targets.tolist()))
    g = ig.Graph(n=n_vertices, edges=edges, directed=False)
    g.es["weight"] = weights.tolist()
    g.simplify(combine_edges="max")

    # Leiden partition
    partition = leidenalg.find_partition(
        g,
        leidenalg.RBConfigurationVertexPartition,
        weights="weight",
        resolution_parameter=resolution,
    )

    return np.array(partition.membership, dtype=np.int32)
