"""Plotly figure factories for the Streamlit app.

Every function in this package returns a ``plotly.graph_objects.Figure``
and has no Streamlit dependency, so the viz layer is unit-testable in
isolation and can be reused outside the app.
"""

from glycoquant.viz.correlation_map import plot_correlation_map
from glycoquant.viz.overlay import (
    MAX_CELLS_FOR_OVERLAY,
    actin_orientation_segment,
    cell_outline_polygons,
    focal_adhesion_polygons,
    glycocalyx_ring_polygons,
    nuclear_outline_polygons,
)
from glycoquant.viz.prior_table import (
    plot_drill_down_heatmap,
    plot_prior_ranking_table,
)
from glycoquant.viz.radial_profile import plot_radial_profile
from glycoquant.viz.recommendation import plot_recommendation_bar

__all__ = [
    "MAX_CELLS_FOR_OVERLAY",
    "actin_orientation_segment",
    "cell_outline_polygons",
    "focal_adhesion_polygons",
    "glycocalyx_ring_polygons",
    "nuclear_outline_polygons",
    "plot_correlation_map",
    "plot_drill_down_heatmap",
    "plot_prior_ranking_table",
    "plot_radial_profile",
    "plot_recommendation_bar",
]
