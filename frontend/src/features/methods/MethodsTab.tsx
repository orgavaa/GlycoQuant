import { useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronRight,
  Microscope,
  Sparkles,
  Target,
  Anchor,
  Waves,
  Hexagon,
  Cpu,
  Info,
} from "lucide-react";
import { Card } from "@/components/Card";

// Biologist-facing feature rows. "plain" describes what the measurement means in
// cell-biology language; "technical" adds a precise one-liner for the quantitative
// reader. Units are shown when they aid interpretation.
interface FeatureRow {
  name: string;
  plain: string;
  technical?: string;
  units?: string;
}

interface GroupSpec {
  id: string;
  title: string;
  channel: string;
  intent: string;
  rows: FeatureRow[];
  // Icon tile theming — one hue per biological compartment.
  icon: ReactNode;
  tint: string;        // icon foreground colour
  tile: string;        // icon tile background
  accent: string;      // heading accent for the open section
  badge: string;       // small label badge (e.g. "surface coat")
  badgeBg: string;
  badgeText: string;
}

const GROUPS: GroupSpec[] = [
  {
    id: "glycocalyx",
    title: "Glycocalyx organisation",
    channel: "WGA-lectin (or equivalent surface-glycan stain)",
    intent:
      "The cellular glycocalyx is a negatively-charged macromolecular meshwork of membrane-anchored proteoglycans, glycoproteins, and glycolipids decorating the apical face of virtually every mammalian cell. The following descriptors quantify its density, continuity, and spatial texture in the pericellular annulus exterior to the cell mask, and serve as image-level surrogates for brush extension, proteoglycan loading, and lateral phase-separation of the coat.",
    icon: <Sparkles size={16} strokeWidth={1.8} />,
    tint: "text-blue-600",
    tile: "bg-blue-50 ring-1 ring-blue-100",
    accent: "from-blue-50/60",
    badge: "surface coat",
    badgeBg: "bg-emerald-50",
    badgeText: "text-emerald-700",
    rows: [
      { name: "pericellular_ratio", plain: "Intensity contrast between the pericellular annulus and the intracellular compartment. Elevated values are consistent with a densely loaded, externally projecting brush; depressed values with a shallow or partially shed coat.", technical: "Mean pixel intensity in a 1–3 µm pericellular ring divided by the mean intensity inside the cell mask." },
      { name: "radial_decay_rate", plain: "Characteristic decay of lectin signal as a function of radial distance from the cell edge. Steep decay is consistent with a compact, tightly membrane-anchored coat; shallow decay with a diffuse, long-range brush.", technical: "Slope of a linear fit to the outward radial intensity profile." },
      { name: "radial_profile_00..19", plain: "Twenty concentric annular shells spanning approximately 0–10 µm outward from the cell boundary. Collectively these bins encode the brush-extension profile that downstream regression models consume directly.", technical: "Per-bin mean intensity of the outward radial intensity profile." },
      { name: "coverage", plain: "Circumferential continuity of the coat around the cell. Depressed values flag focally depleted or shed regions and a fragmented glycocalyx architecture.", technical: "Fraction of the pericellular ring exceeding a locally-adaptive Otsu threshold." },
      { name: "heterogeneity", plain: "Lateral variability of pericellular intensity. Elevated values are consistent with phase-separated or patchy coat organisation.", technical: "Coefficient of variation of pericellular intensity." },
      { name: "haralick_contrast / homogeneity / energy / correlation", plain: "Haralick descriptors of pericellular texture — independent readouts of local contrast, patch coherence, distributional uniformity, and directional autocorrelation.", technical: "Grey-level co-occurrence matrix (GLCM) features computed on the pericellular ring." },
      { name: "moran_i", plain: "Global spatial autocorrelation of pericellular intensity. Positive values indicate clustered bright/dim domains, zero indicates spatial randomness, negative values an anti-correlated (alternating) pattern.", technical: "Moran's I with queen-adjacency weights over the pericellular ring." },
      { name: "shannon_entropy", plain: "Spectral diversity of pericellular intensity. Elevated entropy reflects a multi-modal or noisy signal distribution; depressed entropy a narrow, unimodal coat.", technical: "Shannon entropy of the binned pericellular intensity histogram." },
      { name: "mean_intensity / integrated_intensity", plain: "Bulk lectin signal. Reported for completeness but confounded by acquisition gain and exposure; ratiometric descriptors above are preferred for cross-image comparison.", technical: "Sum and mean of pericellular pixel intensities." },
    ],
  },
  {
    id: "yap",
    title: "YAP nuclear localisation",
    channel: "YAP / TAZ antibody",
    intent:
      "YAP and its paralogue TAZ are Hippo-pathway transcriptional co-activators whose subcellular partitioning is regulated by substrate stiffness, cytoskeletal tension, and cell geometry (Dupont et al., Nature 2011; Elosegui-Artola et al., Cell 2017). Nuclear-to-cytoplasmic partitioning remains the canonical single-cell proxy for mechanotransduction pathway activity.",
    icon: <Target size={16} strokeWidth={1.8} />,
    tint: "text-blue-600",
    tile: "bg-blue-50 ring-1 ring-blue-100",
    accent: "from-blue-50/60",
    badge: "mechano-transducer",
    badgeBg: "bg-violet-50",
    badgeText: "text-violet-700",
    rows: [
      { name: "nc_ratio", plain: "Nuclear-to-cytoplasmic intensity ratio — the canonical single-cell readout of YAP transcriptional activity.", technical: "Mean nuclear YAP intensity divided by mean cytoplasmic YAP intensity within the corresponding mask compartments." },
      { name: "nc_ratio_size_corrected", plain: "Residualised NC ratio orthogonalised against cell area, removing the well-documented geometric confound between footprint and nuclear YAP loading. Recommended whenever the field contains a broad distribution of cell sizes.", technical: "Residual of nc_ratio after linear regression on log(cell_area) computed within the image." },
      { name: "nuclear_intensity / cytoplasmic_intensity", plain: "Component means underlying the NC ratio. Reported as quality-control diagnostics and for direct inspection of partitioning asymmetry.", technical: "Mean intensity inside the nuclear and cytoplasmic mask compartments, respectively." },
      { name: "nuclear_fraction", plain: "Fraction of integrated cellular YAP signal localised to the nucleus. Complementary to the intensity ratio and less sensitive to compartment volume differences.", technical: "Integrated nuclear YAP divided by integrated total cellular YAP." },
      { name: "size_correction_slope / r2", plain: "Diagnostic parameters of the size-correction regression. Depressed r² flags an unreliable correction in the current field and should be surfaced when interpreting nc_ratio_size_corrected.", technical: "Slope and coefficient of determination of the within-image nc_ratio vs log(cell_area) regression." },
    ],
  },
  {
    id: "fa",
    title: "Focal adhesions",
    channel: "Paxillin (or vinculin)",
    intent:
      "Focal adhesions are integrin-anchored, actin-coupled mechanical junctions at the cell–substrate interface whose morphology, maturity, and spatial distribution report on contractile force transmission and substrate mechanosensing. The following descriptors summarise the per-cell adhesion inventory, size distribution, anisotropy, and peripheral enrichment.",
    icon: <Anchor size={16} strokeWidth={1.8} />,
    tint: "text-blue-600",
    tile: "bg-blue-50 ring-1 ring-blue-100",
    accent: "from-blue-50/60",
    badge: "cell-substrate grip",
    badgeBg: "bg-amber-50",
    badgeText: "text-amber-700",
    rows: [
      { name: "count", plain: "Per-cell inventory of segmented paxillin-positive adhesion patches.", technical: "Connected-component count of the binarised paxillin channel within the cell mask." },
      { name: "density_per_um2", plain: "Adhesion number density per unit cell footprint. Controls for cell-size variation when comparing adhesion recruitment across a population.", technical: "count ÷ cell_area (expressed in µm⁻²)." },
      { name: "mean_area / mean_area_um2 / total_area", plain: "Per-adhesion and aggregate area summaries. Adhesion area is a canonical indicator of maturation state.", technical: "Mean and summed area of the adhesion patches; µm² variant uses the acquisition pixel size." },
      { name: "mean_elongation", plain: "Population-mean anisotropy of adhesion shape. Elongated adhesions are associated with sustained traction along underlying stress fibres.", technical: "Mean of (major axis / minor axis) across patches." },
      { name: "mean_orientation_alignment", plain: "Resultant vector length of adhesion long-axis orientations (0 = isotropic, 1 = perfectly co-oriented). An image-level surrogate for mechanical polarisation.", technical: "R = |Σᵢ e^{i2θᵢ}| / N with θᵢ the orientation of patch i." },
      { name: "nascent_count / focal_complex_count / mature_count / fibrillar_count", plain: "Adhesions binned by area into the four canonical maturity classes (Geiger et al. 2009), capturing the progression from nascent dot-like adhesions to fibrillar adhesions.", technical: "Per-cell counts in size intervals calibrated to the Geiger taxonomy." },
      { name: "mature_fraction", plain: "Scalar maturation index — the fraction of adhesions in the mature or fibrillar bins.", technical: "(mature_count + fibrillar_count) ÷ count." },
      { name: "peripheral_fraction", plain: "Fraction of adhesions localised to the outer third of the cell footprint. Peripheral localisation is a signature of actively spreading or migratory cells.", technical: "Fraction of patch centroids whose distance to the cell boundary is ≤ cell_radius / 3." },
      { name: "mean_distance_to_edge / _um", plain: "Mean radial distance of adhesion centroids from the cell boundary.", technical: "Euclidean distance from each patch centroid to the nearest cell-mask edge pixel." },
    ],
  },
  {
    id: "actin",
    title: "Actin cytoskeleton",
    channel: "Phalloidin (F-actin)",
    intent:
      "F-actin stress fibres transmit contractile force from focal adhesions to the nuclear lamina via LINC-complex coupling. Fibre alignment and structural coherence are direct image-level proxies for cytoskeletal tension and cellular contractility.",
    icon: <Waves size={16} strokeWidth={1.8} />,
    tint: "text-blue-600",
    tile: "bg-blue-50 ring-1 ring-blue-100",
    accent: "from-blue-50/60",
    badge: "contractile machinery",
    badgeBg: "bg-rose-50",
    badgeText: "text-rose-700",
    rows: [
      { name: "coherence", plain: "Structure-tensor coherence of the F-actin field. Elevated values indicate well-aligned stress fibres characteristic of tension-bearing, contractile cells; depressed values indicate an isotropic or dispersed actin architecture.", technical: "Coherence = (λ₁−λ₂)²/(λ₁+λ₂)² computed from the local 2×2 structure tensor of the phalloidin channel and averaged over the cell mask." },
      { name: "anisotropy", plain: "Normalised eigenvalue ratio of the structure tensor; a complementary descriptor of orientational asymmetry in the F-actin field.", technical: "(λ₁ − λ₂) / (λ₁ + λ₂), where λ₁ ≥ λ₂ are the structure-tensor eigenvalues." },
      { name: "mean_intensity", plain: "Bulk phalloidin signal within the cell mask. Reported for completeness; confounded by acquisition gain.", technical: "Mean phalloidin intensity inside the cell mask." },
      { name: "edge_intensity_ratio", plain: "Cortical-to-central intensity ratio. Elevated values flag cortical actin enrichment associated with rounded, mitotic, or de-adhered states.", technical: "Mean intensity in a thin cortical band at the cell boundary divided by mean intensity in the central cytoplasmic region." },
    ],
  },
  {
    id: "morphology",
    title: "Morphology",
    channel: "DAPI (nucleus) + cell mask",
    intent:
      "Geometric descriptors of the cell and nuclear masks. Both features of interest in their own right and canonical confounders — cell area in particular non-trivially co-varies with many intensity-based features and is always reported alongside ratiometric descriptors to enable downstream residualisation.",
    icon: <Hexagon size={16} strokeWidth={1.8} />,
    tint: "text-blue-600",
    tile: "bg-blue-50 ring-1 ring-blue-100",
    accent: "from-blue-50/60",
    badge: "size & shape",
    badgeBg: "bg-slate-100",
    badgeText: "text-slate-700",
    rows: [
      { name: "cell_area / cell_perimeter / cell_spread_area", plain: "Cellular footprint area, outline length, and spread area. Spread area resolves the flattening state of the cell on the substrate and is a sensitive indicator of adhesion maturation.", technical: "Standard region properties computed on the cell mask; area reported in pixel and µm² units." },
      { name: "cell_circularity / cell_aspect_ratio / cell_solidity", plain: "Shape regularity, elongation, and convex-hull filling of the cell. Useful for flagging spindle-morphology, blebbing, or mitotic cells.", technical: "Standard skimage regionprops shape descriptors." },
      { name: "nuclear_area / nuclear_perimeter", plain: "Size descriptors of the nuclear mask. Nuclear footprint changes under mechanical load reflect lamina remodelling and force transmission from the cytoskeleton.", technical: "Standard region properties computed on the DAPI-derived nuclear mask." },
      { name: "nuclear_circularity / nuclear_aspect_ratio / nuclear_eccentricity / nuclear_solidity", plain: "Nuclear shape descriptors. Nuclear geometry is a LINC-complex-mediated downstream readout of cytoskeletal tension and nucleo-cytoskeletal coupling.", technical: "Standard shape descriptors of the nuclear mask." },
      { name: "nuclear_to_cell_area_ratio", plain: "Image-level nuclear-to-cytoplasmic footprint ratio — the geometric analogue of the cytological N:C ratio.", technical: "nuclear_area ÷ cell_area." },
    ],
  },
  {
    id: "composite",
    title: "Composite scores & deep embeddings",
    channel: "Derived",
    intent:
      "Derived scalars assembled from the per-feature panel for ranking, plotting, and downstream regression. Every composite encodes definitional choices and should be treated as a summary; the per-feature table remains the authoritative single-cell record.",
    icon: <Cpu size={16} strokeWidth={1.8} />,
    tint: "text-blue-600",
    tile: "bg-blue-50 ring-1 ring-blue-100",
    accent: "from-blue-50/60",
    badge: "derived",
    badgeBg: "bg-blue-50",
    badgeText: "text-blue-700",
    rows: [
      { name: "mechano_score", plain: "Within-image, sign-corrected composite of YAP nuclear localisation, focal-adhesion maturity, and actin coherence. Zero-centred by construction; magnitudes encode per-cell rank relative to the current field and should not be compared across acquisitions.", technical: "First principal component of the three z-scored sub-scores after sign alignment against the YAP nc_ratio axis; rescaled to unit variance." },
      { name: "glycocalyx_pericellular_ratio (composite axis)", plain: "Canonical glycocalyx scalar re-exposed as one axis of the glyco ↔ mechano correlation plots on the Overview tab. Not an additional feature.", technical: "Alias of the pericellular_ratio feature surfaced for downstream plotting." },
      { name: "deep_*", plain: "Optional 5 120-dimensional Cell-DINO ViT-L/16 embedding per cell, serving as a channel-adaptive visual fingerprint. Not surfaced in the tabular views; consumed by the embedding-based cluster-discovery module.", technical: "Cell-DINO ViT-L/16 (Bourriez et al. 2025) per-cell embedding computed on per-cell crops, enabled per-job by opt-in at submit time." },
    ],
  },
];

function GroupCard({ group, defaultOpen }: { group: GroupSpec; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div className="border border-gray-200 bg-white rounded-lg overflow-hidden transition-shadow hover:shadow-sm">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-gray-50/60"
      >
        <span className="text-gray-300 flex-shrink-0">
          {open ? <ChevronDown size={14} strokeWidth={1.5} /> : <ChevronRight size={14} strokeWidth={1.5} />}
        </span>
        <span className={`flex items-center justify-center w-9 h-9 rounded-md flex-shrink-0 ${group.tile} ${group.tint}`}>
          {group.icon}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[14px] font-semibold text-gray-900">{group.title}</span>
            <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded uppercase tracking-wider ${group.badgeBg} ${group.badgeText}`}>
              {group.badge}
            </span>
          </div>
          <div className="text-[11px] text-gray-500 mt-1 flex items-center gap-2 flex-wrap">
            <span className="text-gray-400 uppercase tracking-wider">Channel</span>
            <span className="text-gray-700">{group.channel}</span>
            <span className="text-gray-300">·</span>
            <span className="text-gray-400">{group.rows.length} features</span>
          </div>
        </div>
        <span className="text-[10px] text-gray-300 hover:text-gray-500 transition-colors flex-shrink-0">
          {open ? "collapse" : "expand"}
        </span>
      </button>

      {open && (
        <div className={`bg-gradient-to-b ${group.accent} to-transparent border-t border-gray-100`}>
          <p className="text-[12px] text-gray-700 leading-relaxed px-5 pt-4 pb-3 max-w-3xl">
            {group.intent}
          </p>
          <div className="px-5 pb-5">
            {group.rows.map((row, i) => (
              <div
                key={row.name}
                className={`grid grid-cols-[minmax(180px,220px),1fr] gap-5 py-3 ${
                  i < group.rows.length - 1 ? "border-b border-gray-100" : ""
                }`}
              >
                <code
                  className={`text-[11px] font-mono leading-snug ${group.tint}`}
                  style={{ fontFeatureSettings: "'tnum'" }}
                >
                  {row.name}
                </code>
                <div className="min-w-0">
                  <p className="text-[12px] text-gray-800 leading-relaxed">{row.plain}</p>
                  {row.technical && (
                    <p className="text-[11px] text-gray-400 leading-relaxed mt-1 italic">
                      {row.technical}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function MethodsTab() {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-[22px] font-semibold text-gray-900 tracking-tight">Methods & feature reference</h1>
        <p className="text-[13px] text-gray-500 mt-1 max-w-3xl leading-relaxed">
          Formal definitions, biological rationale, and quantitative specification of every
          per-cell feature GlycoQuant reports. Feature identifiers below are byte-identical to
          the column names in the per-cell feature table and the CSV export.
        </p>
      </header>

      <Card>
        <div className="flex items-center gap-2 mb-3">
          <span className="flex items-center justify-center w-8 h-8 rounded-md bg-gray-100 ring-1 ring-gray-200 text-gray-600">
            <Microscope size={16} strokeWidth={1.8} />
          </span>
          <div>
            <h3 className="text-[14px] font-semibold text-gray-900">Pipeline at a glance</h3>
            <p className="text-[11px] text-gray-500">From raw image to per-cell feature table — the five steps your image passes through.</p>
          </div>
        </div>
        <ol className="text-[12px] text-gray-700 leading-relaxed space-y-2 list-decimal list-inside marker:text-gray-400 marker:font-semibold">
          <li>
            <span className="font-medium text-gray-900">Segmentation.</span> Every cell and
            nucleus is outlined by <strong>Cellpose-SAM</strong>, using the DAPI channel together
            with a cytoplasmic reference.
          </li>
          <li>
            <span className="font-medium text-gray-900">Quality control.</span> Cells too small,
            touching the image edge, or missing a credible DAPI signal are <em>kept as raw
            masks</em> (you still see them) but are excluded from feature extraction, so you
            never see a feature value computed on a nonsense cell.
          </li>
          <li>
            <span className="font-medium text-gray-900">Per-channel features.</span> Each channel
            is only analysed when you've assigned it a biological role in the loader — if a
            channel is marked "unknown" or "synthetic", those features are skipped rather than
            computed on the wrong stain.
          </li>
          <li>
            <span className="font-medium text-gray-900">Composite scores.</span> Scores like
            <code className="mx-1 px-1 bg-gray-100 rounded text-[11px] font-mono">mechano_score</code>
            are z-scored within the current image — they tell you who's high or low
            <em> in this field</em>, not an absolute biological value across experiments.
          </li>
          <li>
            <span className="font-medium text-gray-900">Deep embeddings (optional).</span>
            A 5 120-dim Cell-DINO vector per cell, computed only when you explicitly opt in at
            submit time. Used by the cluster-discovery module.
          </li>
        </ol>
      </Card>

      <div className="space-y-4">
        {GROUPS.map((g, i) => (
          <GroupCard key={g.id} group={g} defaultOpen={i === 0} />
        ))}
      </div>

      <Card className="!bg-gray-50/60 !border-gray-200">
        <div className="flex items-start gap-3">
          <span className="flex items-center justify-center w-8 h-8 rounded-md bg-white ring-1 ring-gray-200 text-gray-500 flex-shrink-0">
            <Info size={16} strokeWidth={1.8} />
          </span>
          <div>
            <h3 className="text-[14px] font-semibold text-gray-900 mb-1">Interpretation of the σ badges</h3>
            <p className="text-[12px] text-gray-700 leading-relaxed max-w-3xl">
              Every per-cell feature panel reports the raw value accompanied by a deviation
              badge of the form
              <code className="mx-1 px-1.5 py-0.5 bg-white rounded border border-gray-200 text-[10px] font-mono">+1.9σ</code>.
              The badge encodes the cell's z-score within the current image's distribution for
              that feature — i.e. a within-field rank descriptor, not a calibrated biological
              effect size. Use σ badges to identify outliers and to compare features within a
              single acquisition; do not use them to compare the same cell across acquisitions
              with different stain concentrations, exposure settings, or detector gain.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
