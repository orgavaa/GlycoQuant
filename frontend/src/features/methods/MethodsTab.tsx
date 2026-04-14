import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Microscope, FlaskConical, Network, Layers, Cpu } from "lucide-react";
import { Card } from "@/components/Card";

interface FeatureRow {
  name: string;
  blurb: string;
  units?: string;
}

interface FeatureGroup {
  title: string;
  channel: string;
  intent: string;
  rows: FeatureRow[];
}

const FEATURE_GROUPS: FeatureGroup[] = [
  {
    title: "Glycocalyx organisation",
    channel: "WGA-lectin (or equivalent surface-glycan stain)",
    intent: "Quantify how the pericellular sugar coat is distributed in space and texture — a proxy for proteoglycan loading, brush thickness, and lateral heterogeneity.",
    rows: [
      { name: "pericellular_ratio", blurb: "Ratio of mean intensity in a thin pericellular ring (just outside the cell mask) to the mean intracellular intensity. Higher values indicate a denser surface coat relative to background." },
      { name: "radial_decay_rate", blurb: "Slope of the radial intensity profile from the cell edge outward. Steeper decay indicates a more compact, surface-bound glycocalyx; gentle decay indicates diffuse coat extension." },
      { name: "radial_profile_00..19", blurb: "Twenty radial intensity bins from cell edge outward (≈0–10 µm). Provide a fingerprint of brush extension that downstream models can use directly." },
      { name: "coverage", blurb: "Fraction of the pericellular ring above a local-Otsu threshold. Quantifies the spatial completeness of the coat." },
      { name: "heterogeneity", blurb: "Coefficient of variation of pericellular intensity. High values flag patchy, non-uniform glycocalyx." },
      { name: "haralick_contrast / homogeneity / energy / correlation", blurb: "GLCM texture descriptors of the pericellular ring. Complementary readouts of patch size, regularity, and directionality." },
      { name: "moran_i", blurb: "Spatial autocorrelation of pericellular intensity. Measures whether bright/dim patches cluster (>0) or anti-cluster (<0)." },
      { name: "shannon_entropy", blurb: "Information entropy of the binned pericellular intensity histogram. A scalar summary of textural disorder." },
      { name: "mean_intensity / integrated_intensity", blurb: "Bulk lectin signal — included for reference but susceptible to acquisition gain. Prefer ratios for cross-image comparison." },
    ],
  },
  {
    title: "YAP nuclear localisation",
    channel: "YAP / TAZ antibody",
    intent: "Quantify nuclear-versus-cytoplasmic partitioning of YAP, the canonical mechanosensitive transcriptional coactivator. Nuclear YAP is the field-standard readout of active Hippo-pathway de-repression.",
    rows: [
      { name: "nc_ratio", blurb: "Mean YAP intensity inside the nuclear mask divided by mean intensity in the cytoplasmic ring. The classical mechanotransduction readout (Dupont 2011)." },
      { name: "nc_ratio_size_corrected", blurb: "Same ratio, residualised against cell area to remove the well-known size confound (larger cells have higher nuclear YAP independently of mechanical state)." },
      { name: "nuclear_intensity / cytoplasmic_intensity", blurb: "Component intensities of the ratio." },
      { name: "nuclear_fraction", blurb: "Fraction of total cellular YAP signal located in the nucleus." },
      { name: "size_correction_slope / r2", blurb: "Diagnostics from the size-correction regression — flag images where the correction is unstable." },
    ],
  },
  {
    title: "Focal adhesions",
    channel: "Paxillin (or vinculin)",
    intent: "Quantify maturity, density, and orientation of integrin-anchored focal complexes — the mechanical interface between actin stress fibres and the substrate.",
    rows: [
      { name: "count", blurb: "Number of segmented adhesion patches per cell." },
      { name: "density_per_um2", blurb: "Adhesion count normalised to cell footprint area." },
      { name: "mean_area / mean_area_um2 / total_area", blurb: "Per-adhesion and per-cell area summaries. Mature adhesions are larger." },
      { name: "mean_elongation", blurb: "Mean major/minor-axis ratio. Mature, force-bearing adhesions elongate along stress-fibre direction." },
      { name: "mean_orientation_alignment", blurb: "Resultant length of adhesion long-axis orientations (0 = isotropic, 1 = perfectly aligned). Quantifies anisotropic mechanical loading." },
      { name: "nascent_count / focal_complex_count / mature_count / fibrillar_count", blurb: "Adhesions binned by area into the four canonical maturity classes (Geiger 2009)." },
      { name: "mature_fraction", blurb: "Fraction of adhesions in mature/fibrillar bins. A scalar maturation index." },
      { name: "peripheral_fraction", blurb: "Fraction of adhesions located in the outer one-third of the cell mask. Peripheral localisation is associated with active spreading." },
      { name: "mean_distance_to_edge / _um", blurb: "Mean distance from each adhesion to the cell boundary." },
    ],
  },
  {
    title: "Actin cytoskeleton",
    channel: "Phalloidin (F-actin)",
    intent: "Capture stress-fibre organisation and coherence — the contractile machinery that translates adhesion signalling into nuclear deformation.",
    rows: [
      { name: "coherence", blurb: "Structure-tensor coherence of the actin field. High values indicate aligned stress fibres; low values indicate isotropic or disorganised actin." },
      { name: "anisotropy", blurb: "Eigenvalue ratio of the structure tensor — complementary to coherence." },
      { name: "mean_intensity", blurb: "Bulk phalloidin intensity inside the cell mask." },
      { name: "edge_intensity_ratio", blurb: "Ratio of cortical (edge) to central actin intensity. High values flag cortical actin enrichment." },
    ],
  },
  {
    title: "Morphology",
    channel: "DAPI (nucleus) + cell mask",
    intent: "Standard size and shape descriptors used both as features and as confounders to correct (cell area in particular drives many intensity-based metrics).",
    rows: [
      { name: "cell_area / cell_perimeter / cell_spread_area", blurb: "Footprint area and outline length of the cell mask." },
      { name: "cell_circularity / cell_aspect_ratio / cell_solidity", blurb: "Shape regularity, elongation, and convexity." },
      { name: "nuclear_area / nuclear_perimeter", blurb: "Nuclear size descriptors." },
      { name: "nuclear_circularity / nuclear_aspect_ratio / nuclear_eccentricity / nuclear_solidity", blurb: "Nuclear shape descriptors. Relevant to mechanotransduction via LINC-complex coupling between cytoskeleton and lamina." },
      { name: "nuclear_to_cell_area_ratio", blurb: "Nucleus/cell area ratio. Approximates the N:C ratio used in cytology." },
    ],
  },
  {
    title: "Composite scores",
    channel: "Derived",
    intent: "Single-cell scalars assembled from the above features for ranking, plotting, and downstream regression.",
    rows: [
      { name: "mechano_score", blurb: "Sign-corrected, z-scored composite of YAP nuclear localisation, focal-adhesion maturity, and actin coherence. Population-zero by construction; positive = above-population mechanotransduction activity." },
      { name: "glycocalyx_pericellular_ratio (composite axis)", blurb: "Used as the canonical glyco scalar in glyco↔mechano correlation plots." },
      { name: "deep_*", blurb: "Optional Cell-DINO ViT-L/16 embedding (5120-dim) per cell. Used by the embedding-defined cluster module; not exposed as scalar features." },
    ],
  },
];

interface SectionProps {
  icon: ReactNode;
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

function Section({ icon, title, defaultOpen = false, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card noPadding>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="text-gray-400 flex-shrink-0">
          {open ? <ChevronDown size={14} strokeWidth={1.5} /> : <ChevronRight size={14} strokeWidth={1.5} />}
        </span>
        <span className="text-gray-500 flex-shrink-0">{icon}</span>
        <span className="text-[14px] font-semibold text-gray-900">{title}</span>
      </button>
      {open && <div className="px-5 pb-5 pt-1">{children}</div>}
    </Card>
  );
}

function FeatureTable({ group }: { group: FeatureGroup }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-[11px]">
        <span><span className="text-gray-400 uppercase tracking-wider mr-1">channel</span><span className="text-gray-700">{group.channel}</span></span>
      </div>
      <p className="text-[12px] text-gray-600 leading-relaxed">{group.intent}</p>
      <div className="border-t border-gray-100">
        {group.rows.map(row => (
          <div key={row.name} className="grid grid-cols-[200px,1fr] gap-4 py-2.5 border-b border-gray-100 last:border-b-0">
            <code className="text-[11px] text-gray-900 font-mono leading-snug" style={{ fontFeatureSettings: "'tnum'" }}>
              {row.name}
            </code>
            <p className="text-[11px] text-gray-600 leading-relaxed">{row.blurb}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MethodsTab() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[22px] font-semibold text-gray-900 tracking-tight">Methods & feature reference</h1>
        <p className="text-[13px] text-gray-500 mt-1 max-w-3xl">
          What every per-cell feature measures, which channel produced it, and how to interpret it.
          Feature names below match the column names in the per-cell feature table and the
          downloadable CSV.
        </p>
      </header>

      <Card>
        <div className="flex items-center gap-2 mb-2">
          <Microscope size={14} strokeWidth={1.5} className="text-gray-500" />
          <h3 className="text-[14px] font-semibold text-gray-900">Pipeline summary</h3>
        </div>
        <ol className="text-[12px] text-gray-600 leading-relaxed space-y-1.5 list-decimal list-inside">
          <li>Channel composite is segmented with <strong>Cellpose-SAM</strong> using the DAPI + cytoplasmic channel to produce per-cell and per-nucleus masks.</li>
          <li>Each cell mask is QC-gated for area, contact with image edge, and DAPI signal. Cells failing QC are kept as raw masks but excluded from downstream feature extraction.</li>
          <li>Per-channel features are extracted only when the corresponding channel is assigned (synthetic / unknown channels are skipped — see Channel assignment in the loader).</li>
          <li>Composite scores (<code>mechano_score</code>) are z-scored within the current image. They are descriptive of <em>this</em> field, not absolute biological set-points.</li>
          <li>Optional Cell-DINO embeddings are computed only when explicitly requested at submit time.</li>
        </ol>
      </Card>

      <Section icon={<FlaskConical size={14} strokeWidth={1.5} />} title="Glycocalyx organisation" defaultOpen>
        <FeatureTable group={FEATURE_GROUPS[0]} />
      </Section>
      <Section icon={<FlaskConical size={14} strokeWidth={1.5} />} title="YAP nuclear localisation">
        <FeatureTable group={FEATURE_GROUPS[1]} />
      </Section>
      <Section icon={<FlaskConical size={14} strokeWidth={1.5} />} title="Focal adhesions">
        <FeatureTable group={FEATURE_GROUPS[2]} />
      </Section>
      <Section icon={<FlaskConical size={14} strokeWidth={1.5} />} title="Actin cytoskeleton">
        <FeatureTable group={FEATURE_GROUPS[3]} />
      </Section>
      <Section icon={<Layers size={14} strokeWidth={1.5} />} title="Morphology">
        <FeatureTable group={FEATURE_GROUPS[4]} />
      </Section>
      <Section icon={<Cpu size={14} strokeWidth={1.5} />} title="Composite scores & embeddings">
        <FeatureTable group={FEATURE_GROUPS[5]} />
      </Section>

      <Card>
        <div className="flex items-center gap-2 mb-3">
          <Network size={14} strokeWidth={1.5} className="text-gray-500" />
          <h3 className="text-[14px] font-semibold text-gray-900">Reading the σ badges</h3>
        </div>
        <p className="text-[12px] text-gray-600 leading-relaxed">
          Each per-cell feature panel shows the raw value and a deviation badge such as
          <code className="mx-1 px-1.5 py-0.5 bg-gray-100 rounded text-[10px] font-mono">+1.9σ</code>.
          The σ value is the cell's z-score within the current image's distribution for that
          feature — a within-image rank descriptor, not a calibrated biological effect size.
          Use it to spot outliers and to compare features within a single field; do not use it
          to compare the same cell across different acquisitions.
        </p>
      </Card>
    </div>
  );
}
