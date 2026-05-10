"""Plotly figure factories for the Streamlit app.

Every function in this package returns a ``plotly.graph_objects.Figure``
and has no Streamlit dependency, so the viz layer is unit-testable in
isolation and can be reused outside the app.
"""

from glycoquant.viz.correlation_map import plot_correlation_map
from glycoquant.viz.glyco_mechano_correlation import (
    GLYCO_COLUMNS,
    MECHANO_COLUMNS,
    GlycoMechanoCorrelation,
    compute_glyco_mechano_correlation,
    plot_glyco_mechano_correlation,
    plot_mechano_score_distribution,
)
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
    plot_drill_down_lollipop,
    plot_panel_summary,
    plot_pathway_network,
    plot_prior_ranking_table,
    plot_signature_matrix,
)
from glycoquant.viz.radial_profile import plot_radial_profile
from glycoquant.viz.recommendation import plot_recommendation_bar

__all__ = [
    "GLYCO_COLUMNS",
    "MAX_CELLS_FOR_OVERLAY",
    "MECHANO_COLUMNS",
    "GlycoMechanoCorrelation",
    "actin_orientation_segment",
    "cell_outline_polygons",
    "compute_glyco_mechano_correlation",
    "focal_adhesion_polygons",
    "glycocalyx_ring_polygons",
    "nuclear_outline_polygons",
    "plot_correlation_map",
    "plot_drill_down_heatmap",
    "plot_drill_down_lollipop",
    "plot_glyco_mechano_correlation",
    "plot_mechano_score_distribution",
    "plot_panel_summary",
    "plot_pathway_network",
    "plot_prior_ranking_table",
    "plot_radial_profile",
    "plot_recommendation_bar",
    "plot_signature_matrix",
]
