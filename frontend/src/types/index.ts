/**
 * Shared types for the GlycoQuant instrument UI.
 */

/** A single cell's contour polygon extracted from the Plotly segmentation figure. */
export interface CellPolygon {
  cellId: number;
  vertices: [number, number][]; // [x, y] in image coordinates
  centroid: [number, number];
  bbox: { x: number; y: number; width: number; height: number };
}

/** Per-cell feature row parsed from features_df_json. */
export interface CellFeatures {
  cell_id: number;
  // Glycocalyx
  glycocalyx_pericellular_ratio?: number;
  glycocalyx_pericellular_intensity?: number;
  glycocalyx_total_intensity?: number;
  glycocalyx_mean_intensity?: number;
  glycocalyx_membrane_intensity?: number;
  glycocalyx_cytoplasm_intensity?: number;
  glycocalyx_membrane_to_cytoplasm_ratio?: number;
  glycocalyx_ring_mean_intensity?: number;
  glycocalyx_ring_std_intensity?: number;
  glycocalyx_ring_coverage?: number;
  glycocalyx_radial_decay_rate?: number;
  glycocalyx_radial_half_max_distance?: number;
  // YAP
  yap_nc_ratio_size_corrected?: number;
  yap_nuclear_mean?: number;
  yap_cytoplasm_mean?: number;
  yap_total_intensity?: number;
  // Focal Adhesions
  fa_count?: number;
  fa_total_area?: number;
  fa_mean_area?: number;
  fa_mean_aspect_ratio?: number;
  fa_max_aspect_ratio?: number;
  fa_mean_length?: number;
  fa_max_length?: number;
  fa_density?: number;
  fa_periphery_fraction?: number;
  fa_orientation_std?: number;
  fa_total_intensity?: number;
  fa_mean_intensity?: number;
  fa_mature_count?: number;
  fa_nascent_count?: number;
  fa_mature_fraction?: number;
  fa_mature_mean_area?: number;
  fa_nascent_mean_area?: number;
  // Actin
  actin_stress_fiber_coherence?: number;
  actin_mean_intensity?: number;
  actin_cortical_intensity?: number;
  actin_cytoplasm_intensity?: number;
  // Morphology
  cell_area?: number;
  cell_perimeter?: number;
  cell_circularity?: number;
  cell_aspect_ratio?: number;
  cell_solidity?: number;
  cell_extent?: number;
  cell_eccentricity?: number;
  cell_major_axis?: number;
  cell_minor_axis?: number;
  cell_convex_area?: number;
  nuclear_area?: number;
  nuclear_aspect_ratio?: number;
  nc_area_ratio?: number;
  // Mechano
  mechano_score?: number;
  // Catch-all for dynamic features
  [key: string]: number | undefined;
}

/** Feature grouping for the single-cell dossier. */
export interface FeatureGroupDef {
  name: string;
  prefix: string;
  features: string[];
}

export const FEATURE_GROUPS: FeatureGroupDef[] = [
  {
    name: "Glycocalyx",
    prefix: "glycocalyx_",
    features: [
      "glycocalyx_pericellular_ratio",
      "glycocalyx_pericellular_intensity",
      "glycocalyx_total_intensity",
      "glycocalyx_mean_intensity",
      "glycocalyx_membrane_intensity",
      "glycocalyx_cytoplasm_intensity",
      "glycocalyx_membrane_to_cytoplasm_ratio",
      "glycocalyx_ring_mean_intensity",
      "glycocalyx_ring_std_intensity",
      "glycocalyx_ring_coverage",
      "glycocalyx_radial_decay_rate",
      "glycocalyx_radial_half_max_distance",
    ],
  },
  {
    name: "YAP",
    prefix: "yap_",
    features: [
      "yap_nc_ratio_size_corrected",
      "yap_nuclear_mean",
      "yap_cytoplasm_mean",
      "yap_total_intensity",
    ],
  },
  {
    name: "Focal Adhesions",
    prefix: "fa_",
    features: [
      "fa_count",
      "fa_total_area",
      "fa_mean_area",
      "fa_mean_aspect_ratio",
      "fa_max_aspect_ratio",
      "fa_mean_length",
      "fa_max_length",
      "fa_density",
      "fa_periphery_fraction",
      "fa_orientation_std",
      "fa_total_intensity",
      "fa_mean_intensity",
      "fa_mature_count",
      "fa_nascent_count",
      "fa_mature_fraction",
      "fa_mature_mean_area",
      "fa_nascent_mean_area",
    ],
  },
  {
    name: "Actin",
    prefix: "actin_",
    features: [
      "actin_stress_fiber_coherence",
      "actin_mean_intensity",
      "actin_cortical_intensity",
      "actin_cytoplasm_intensity",
    ],
  },
  {
    name: "Morphology",
    prefix: "cell_|nuclear_|nc_",
    features: [
      "cell_area",
      "cell_perimeter",
      "cell_circularity",
      "cell_aspect_ratio",
      "cell_solidity",
      "cell_extent",
      "cell_eccentricity",
      "cell_major_axis",
      "cell_minor_axis",
      "cell_convex_area",
      "nuclear_area",
      "nuclear_aspect_ratio",
      "nc_area_ratio",
    ],
  },
];

/** Radar chart axis definition. */
export const RADAR_AXES = [
  { key: "glycocalyx_pericellular_ratio", label: "Glyco" },
  { key: "yap_nc_ratio_size_corrected", label: "YAP" },
  { key: "fa_mature_fraction", label: "FA" },
  { key: "actin_stress_fiber_coherence", label: "Actin" },
  { key: "nuclear_aspect_ratio", label: "Shape" },
  { key: "mechano_score", label: "Mechano" },
] as const;

/** Canvas transform state for zoom/pan. */
export interface CanvasTransform {
  scale: number;
  translateX: number;
  translateY: number;
}

/** Channel metadata. */
export const CHANNELS = [
  { name: "dapi", abbr: "D", color: "#4A90D9", lut: [74, 144, 217] as [number, number, number] },
  { name: "glycocalyx", abbr: "W", color: "#4CAF50", lut: [76, 175, 80] as [number, number, number] },
  { name: "yap", abbr: "Y", color: "#E040FB", lut: [224, 64, 251] as [number, number, number] },
  { name: "paxillin", abbr: "P", color: "#FF9800", lut: [255, 152, 0] as [number, number, number] },
  { name: "actin", abbr: "A", color: "#B0BEC5", lut: [176, 190, 197] as [number, number, number] },
] as const;
