"""ML feature endpoints — phenotype discovery, spatial GNN, cross-modal prediction.

These are post-hoc analyses on completed jobs. They read features_df_json
from the job store, run the glycoquant ML modules, and return results
synchronously (all three run in <10s on typical images).
"""
from __future__ import annotations

from typing import Literal

import pandas as pd
from fastapi import APIRouter, HTTPException, Query

from backend.app.schemas import (
    ClusterSummarySchema,
    CrossModalResponse,
    PhenotypeResponse,
    SpatialGNNResponse,
)
from backend.app.workers import get_job_store

router = APIRouter(prefix="/analysis/ml", tags=["ml-features"])

import logging
_log = logging.getLogger(__name__)


def _get_features_df(job_id: str) -> pd.DataFrame:
    """Fetch and parse features_df_json from a completed job."""
    store = get_job_store()
    job = store.get(job_id)
    if job is None:
        raise HTTPException(404, f"Job {job_id} not found")
    if job.status != "complete":
        raise HTTPException(409, f"Job {job_id} is {job.status}, not complete")
    if job.result is None:
        raise HTTPException(409, f"Job {job_id} has no result")

    from io import StringIO
    df = pd.read_json(StringIO(job.result.features_df_json), orient="records")
    if "cell_id" in df.columns:
        df = df.set_index("cell_id")
    return df


@router.post("/phenotype/{job_id}", response_model=PhenotypeResponse)
async def run_phenotype_discovery(
    job_id: str,
    n_neighbors: int = Query(default=15, ge=5, le=50),
    min_dist: float = Query(default=0.1, ge=0.01, le=1.0),
    resolution: float = Query(default=1.0, ge=0.1, le=5.0),
) -> PhenotypeResponse:
    """Run UMAP + Leiden clustering on Cell-DINO deep embeddings."""
    try:
        df = _get_features_df(job_id)

        store = get_job_store()
        job = store.get(job_id)
        if job and job.result and not job.result.has_deep_features:
            raise HTTPException(
                409,
                "This job was run without deep features. "
                "Re-run with 'Cell-DINO deep embeddings' enabled."
            )

        from glycoquant.features.phenotype_discovery import (
            PhenotypeDiscoveryParams,
            discover_phenotypes,
        )
        from glycoquant.viz.phenotype_landscape import plot_phenotype_landscape

        params = PhenotypeDiscoveryParams(
            n_neighbors=n_neighbors,
            min_dist=min_dist,
            leiden_resolution=resolution,
        )
        result = discover_phenotypes(df, params)

        fig = plot_phenotype_landscape(
            result.umap_x, result.umap_y,
            result.cluster_labels, result.cell_ids,
        )

        cells = pd.DataFrame({
            "cell_id": result.cell_ids,
            "umap_x": result.umap_x,
            "umap_y": result.umap_y,
            "cluster": result.cluster_labels,
        })

        return PhenotypeResponse(
            job_id=job_id,
            n_clusters=result.n_clusters,
            cluster_sizes=result.cluster_sizes,
            cluster_summaries=[
                ClusterSummarySchema(
                    cluster_id=s.cluster_id,
                    size=s.size,
                    fraction=s.fraction,
                    mean_features=s.mean_features,
                )
                for s in result.cluster_summaries
            ],
            cells_json=cells.to_json(orient="records"),
            landscape_figure_json=fig.to_json(),
        )
    except HTTPException:
        raise
    except Exception as exc:
        _log.exception("Phenotype discovery failed")
        raise HTTPException(500, f"Phenotype discovery failed: {type(exc).__name__}: {exc}")


@router.post("/spatial-gnn/{job_id}", response_model=SpatialGNNResponse)
async def run_spatial_gnn(
    job_id: str,
    max_edge_dist_um: float = Query(default=100.0, ge=10.0, le=500.0),
) -> SpatialGNNResponse:
    """Train a spatial GCN on the Delaunay cell-neighbourhood graph."""
    try:
        return await _run_spatial_gnn_inner(job_id, max_edge_dist_um)
    except HTTPException:
        raise
    except Exception as exc:
        _log.exception("Spatial GNN failed")
        raise HTTPException(500, f"Spatial GNN failed: {type(exc).__name__}: {exc}")


async def _run_spatial_gnn_inner(job_id: str, max_edge_dist_um: float) -> SpatialGNNResponse:
    df = _get_features_df(job_id)

    store = get_job_store()
    job = store.get(job_id)
    pixel_size_um = 0.325
    if job and job.result and hasattr(job.result, "pixel_size_um") and job.result.pixel_size_um:
        pixel_size_um = job.result.pixel_size_um

    # Compute centroids from segmentation figure polygons if not in features
    if "centroid_x" not in df.columns or "centroid_y" not in df.columns:
        if job and job.result and job.result.segmentation_figure_json:
            import json
            try:
                fig = json.loads(job.result.segmentation_figure_json)
                cx_map: dict[float, float] = {}
                cy_map: dict[float, float] = {}
                for trace in fig.get("data", []):
                    if trace.get("type") == "heatmap" or not trace.get("customdata"):
                        continue
                    cd = trace["customdata"][0] if trace.get("customdata") else None
                    if cd is None:
                        continue
                    cid = float(cd[0]) if isinstance(cd, list) else float(cd)
                    xs = [float(v) for v in trace.get("x", []) if v is not None]
                    ys = [float(v) for v in trace.get("y", []) if v is not None]
                    if xs and ys:
                        cx_map[cid] = sum(xs) / len(xs)
                        cy_map[cid] = sum(ys) / len(ys)
                if cx_map:
                    df["centroid_x"] = df.index.map(lambda c: cx_map.get(float(c), float("nan")))
                    df["centroid_y"] = df.index.map(lambda c: cy_map.get(float(c), float("nan")))
            except Exception:
                pass

    if "centroid_x" not in df.columns or "centroid_y" not in df.columns:
        raise HTTPException(
            409,
            "Cell centroids not available. Re-run the analysis with the latest backend."
        )

    from glycoquant.features.spatial_gnn import SpatialGNNParams, train_spatial_gnn
    from glycoquant.viz.spatial_graph import plot_feature_importance, plot_spatial_graph

    params = SpatialGNNParams(max_edge_dist_um=max_edge_dist_um)
    result = train_spatial_gnn(df, pixel_size_um=pixel_size_um, params=params)

    graph_fig = plot_spatial_graph(
        result.centroids, result.edge_index,
        result.mechano_predicted, result.cell_ids,
    )
    importance_fig = plot_feature_importance(result.node_importance)

    cells = pd.DataFrame({
        "cell_id": result.cell_ids,
        "mechano_predicted": result.mechano_predicted,
        "mechano_actual": result.mechano_actual,
    })

    return SpatialGNNResponse(
        job_id=job_id,
        r2_score=result.r2_score,
        node_importance=result.node_importance,
        n_edges=result.n_edges,
        mean_neighbors=result.mean_neighbors,
        cells_json=cells.to_json(orient="records"),
        graph_figure_json=graph_fig.to_json(),
        importance_figure_json=importance_fig.to_json(),
    )


@router.post("/cross-modal/{job_id}", response_model=CrossModalResponse)
async def run_cross_modal(
    job_id: str,
    direction: Literal["glyco_to_mechano", "mechano_to_glyco"] = Query(default="glyco_to_mechano"),
) -> CrossModalResponse:
    """Train a cross-modal MLP predictor (glyco ↔ mechano)."""
    try:
        df = _get_features_df(job_id)

        from glycoquant.features.cross_modal_predictor import CrossModalParams, train_cross_modal
        from glycoquant.viz.cross_modal import plot_cross_modal_r2, plot_feature_importance

        result = train_cross_modal(df, direction=direction, params=CrossModalParams())

        r2_fig = plot_cross_modal_r2(result.per_target_r2, result.direction)
        importance_fig = plot_feature_importance(result.feature_importance)

        return CrossModalResponse(
            job_id=job_id,
            direction=result.direction,
            overall_r2=result.overall_r2,
            per_target_r2=result.per_target_r2,
            feature_importance=result.feature_importance,
            input_features=result.input_features,
            target_features=result.target_features,
            r2_figure_json=r2_fig.to_json(),
            importance_figure_json=importance_fig.to_json(),
        )
    except HTTPException:
        raise
    except Exception as exc:
        _log.exception("Cross-modal prediction failed")
        raise HTTPException(500, f"Cross-modal prediction failed: {type(exc).__name__}: {exc}")
