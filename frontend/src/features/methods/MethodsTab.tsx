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
    channel: "WGA-lectin (or equivalent surface-sugar stain)",
    intent:
      "The glycocalyx is the sugar coat that every cell wears on its outside. These features describe how thick it is, how evenly it covers the cell, and how patchy or smooth it looks — all from the pericellular ring just outside the cell mask.",
    icon: <Sparkles size={16} strokeWidth={1.8} />,
    tint: "text-blue-600",
    tile: "bg-blue-50 ring-1 ring-blue-100",
    accent: "from-blue-50/60",
    badge: "surface coat",
    badgeBg: "bg-emerald-50",
    badgeText: "text-emerald-700",
    rows: [
      { name: "pericellular_ratio", plain: "How much denser the coat is just outside the cell compared with the inside. High = thick brush; low = thin coat.", technical: "Mean intensity in a thin ring outside the mask divided by the mean intensity inside." },
      { name: "radial_decay_rate", plain: "How quickly the coat thins out as you move away from the cell. Steep drop-off = compact, tightly bound coat; slow drop-off = fluffy, extended brush.", technical: "Slope of the radial intensity profile from edge outward." },
      { name: "radial_profile_00..19", plain: "Twenty concentric ‘shells’ of coat intensity moving outward (~0 – 10 µm). Together they form a fingerprint of brush extension the models use directly.", technical: "Per-bin mean intensity of the outward radial profile." },
      { name: "coverage", plain: "Fraction of the cell circumference that has a visible coat. Low values flag cells with bald patches.", technical: "Fraction of the pericellular ring above a local Otsu threshold." },
      { name: "heterogeneity", plain: "How uneven the coat is. Low = smooth and uniform; high = patchy, uneven.", technical: "Coefficient of variation of pericellular intensity." },
      { name: "haralick_contrast / homogeneity / energy / correlation", plain: "Four complementary readouts of coat texture — roughly, patch size, smoothness, regularity, and directionality.", technical: "Classical GLCM (grey-level co-occurrence matrix) descriptors of the pericellular ring." },
      { name: "moran_i", plain: "Are bright and dim patches clumped together, or scattered at random? Positive = clumped; zero = random; negative = checkerboard.", technical: "Global Moran's I of pericellular intensity." },
      { name: "shannon_entropy", plain: "How ‘busy’ the coat looks. Low = uniform; high = many different brightness levels mixed together.", technical: "Entropy of the binned pericellular intensity histogram." },
      { name: "mean_intensity / integrated_intensity", plain: "Raw brightness of the coat — useful but affected by camera gain and exposure. Prefer the ratios above when comparing across images.", technical: "Simple sum/mean of pericellular pixel values." },
    ],
  },
  {
    id: "yap",
    title: "YAP nuclear localisation",
    channel: "YAP / TAZ antibody",
    intent:
      "YAP is the classical mechanosensitive transcription factor. When a cell feels a stiff or stretched environment, YAP moves from the cytoplasm into the nucleus and switches on mechanoresponsive genes. These features capture that shuttling.",
    icon: <Target size={16} strokeWidth={1.8} />,
    tint: "text-blue-600",
    tile: "bg-blue-50 ring-1 ring-blue-100",
    accent: "from-blue-50/60",
    badge: "mechano-transducer",
    badgeBg: "bg-violet-50",
    badgeText: "text-violet-700",
    rows: [
      { name: "nc_ratio", plain: "The canonical YAP readout: how much brighter YAP is in the nucleus than in the cytoplasm. Higher values mean YAP is ‘on’.", technical: "Mean nuclear YAP intensity ÷ mean cytoplasmic YAP intensity (Dupont 2011)." },
      { name: "nc_ratio_size_corrected", plain: "The same ratio, but corrected for the fact that larger cells naturally have more nuclear YAP. Use this one when comparing across cells of very different sizes.", technical: "Residual of nc_ratio after regressing on cell area within the image." },
      { name: "nuclear_intensity / cytoplasmic_intensity", plain: "The two brightness values the ratio is built from — shown for quality control and diagnostics.", technical: "Mean intensity inside the nuclear and cytoplasmic masks respectively." },
      { name: "nuclear_fraction", plain: "Out of all the YAP in the cell, what fraction is in the nucleus right now.", technical: "Integrated nuclear YAP ÷ integrated total YAP." },
      { name: "size_correction_slope / r2", plain: "Quality flags for the size correction above. If r² is very low, the correction is unreliable for this image.", technical: "Parameters of the YAP-vs-cell-area regression used for size correction." },
    ],
  },
  {
    id: "fa",
    title: "Focal adhesions",
    channel: "Paxillin (or vinculin)",
    intent:
      "Focal adhesions are the grip points where the cell anchors to its substrate. Their size, shape, number, and location tell you how hard the cell is pulling and how well it is sensing the stiffness beneath it.",
    icon: <Anchor size={16} strokeWidth={1.8} />,
    tint: "text-blue-600",
    tile: "bg-blue-50 ring-1 ring-blue-100",
    accent: "from-blue-50/60",
    badge: "cell-substrate grip",
    badgeBg: "bg-amber-50",
    badgeText: "text-amber-700",
    rows: [
      { name: "count", plain: "How many adhesion spots were found on this cell.", technical: "Number of segmented paxillin patches per cell." },
      { name: "density_per_um2", plain: "Adhesion count per unit footprint. Lets you compare small and large cells fairly.", technical: "count ÷ cell_area (in µm²)." },
      { name: "mean_area / mean_area_um2 / total_area", plain: "How big the adhesions are on average. Mature, force-bearing adhesions are larger.", technical: "Per-patch and per-cell area summaries of the adhesion mask." },
      { name: "mean_elongation", plain: "How stretched-out the adhesions are. Mature adhesions elongate along the stress fibre they anchor.", technical: "Mean major/minor-axis ratio across patches." },
      { name: "mean_orientation_alignment", plain: "Do the adhesions all point the same way (aligned, polarised cell) or every which way (isotropic, resting cell)? 0 = random, 1 = perfectly aligned.", technical: "Resultant length of patch long-axis orientations." },
      { name: "nascent_count / focal_complex_count / mature_count / fibrillar_count", plain: "Adhesions sorted into the four canonical maturity stages by size — from just-formed dots to mature cables.", technical: "Per-cell counts in size-based bins (Geiger 2009)." },
      { name: "mature_fraction", plain: "Fraction of adhesions that are mature or fibrillar — a single summary of how ‘grown-up’ the adhesions are.", technical: "(mature_count + fibrillar_count) ÷ count." },
      { name: "peripheral_fraction", plain: "Fraction of adhesions sitting at the outer edge of the cell, where actively spreading cells put them.", technical: "Patches whose centroid sits in the outer one-third of the cell mask." },
      { name: "mean_distance_to_edge / _um", plain: "On average, how close the adhesions are to the cell boundary.", technical: "Euclidean distance from each patch centroid to the cell mask edge." },
    ],
  },
  {
    id: "actin",
    title: "Actin cytoskeleton",
    channel: "Phalloidin (F-actin)",
    intent:
      "Actin stress fibres are the ropes that translate adhesion pulling into force on the nucleus. How aligned and coherent they are tells you whether the cell is actively contractile or relaxed.",
    icon: <Waves size={16} strokeWidth={1.8} />,
    tint: "text-blue-600",
    tile: "bg-blue-50 ring-1 ring-blue-100",
    accent: "from-blue-50/60",
    badge: "contractile machinery",
    badgeBg: "bg-rose-50",
    badgeText: "text-rose-700",
    rows: [
      { name: "coherence", plain: "Do the stress fibres all run in the same direction (coherent, contractile cell) or every which way (disorganised, resting cell)?", technical: "Structure-tensor coherence of the F-actin field." },
      { name: "anisotropy", plain: "A second ‘pointing-the-same-way’ measure that complements coherence.", technical: "Normalised eigenvalue ratio of the structure tensor." },
      { name: "mean_intensity", plain: "Overall F-actin brightness inside the cell.", technical: "Mean phalloidin intensity inside the cell mask." },
      { name: "edge_intensity_ratio", plain: "How much actin is concentrated at the cell edge versus the interior. High values flag cortical actin enrichment.", technical: "Mean intensity in a thin cortical band ÷ mean intensity in the central region." },
    ],
  },
  {
    id: "morphology",
    title: "Morphology",
    channel: "DAPI (nucleus) + cell mask",
    intent:
      "Shape and size descriptors. They are features in their own right, but also the most common confounders — cell area in particular drives many intensity-based metrics, so we always report it alongside.",
    icon: <Hexagon size={16} strokeWidth={1.8} />,
    tint: "text-blue-600",
    tile: "bg-blue-50 ring-1 ring-blue-100",
    accent: "from-blue-50/60",
    badge: "size & shape",
    badgeBg: "bg-slate-100",
    badgeText: "text-slate-700",
    rows: [
      { name: "cell_area / cell_perimeter / cell_spread_area", plain: "How big the cell is and how long its outline is. Spread area captures how flattened the cell is on the substrate.", technical: "Standard region properties of the cell mask." },
      { name: "cell_circularity / cell_aspect_ratio / cell_solidity", plain: "How round, how elongated, and how ‘filled-in’ the cell is. Useful for flagging spindle-like, blebby, or dividing cells.", technical: "Shape descriptors of the cell mask." },
      { name: "nuclear_area / nuclear_perimeter", plain: "How big the nucleus is. Relevant because nuclei stretch and flatten under mechanical load.", technical: "Standard region properties of the nuclear mask." },
      { name: "nuclear_circularity / nuclear_aspect_ratio / nuclear_eccentricity / nuclear_solidity", plain: "How round or stretched the nucleus is. Relevant to mechanotransduction via LINC-complex coupling between the cytoskeleton and the nuclear lamina.", technical: "Shape descriptors of the nuclear mask." },
      { name: "nuclear_to_cell_area_ratio", plain: "Nucleus size relative to cell size — the classical N:C ratio used in cytology.", technical: "nuclear_area ÷ cell_area." },
    ],
  },
  {
    id: "composite",
    title: "Composite scores & deep embeddings",
    channel: "Derived",
    intent:
      "Single-cell scores built from the features above. They are convenient for ranking and plotting, but every composite hides choices — the per-feature table is always the primary source.",
    icon: <Cpu size={16} strokeWidth={1.8} />,
    tint: "text-blue-600",
    tile: "bg-blue-50 ring-1 ring-blue-100",
    accent: "from-blue-50/60",
    badge: "derived",
    badgeBg: "bg-blue-50",
    badgeText: "text-blue-700",
    rows: [
      { name: "mechano_score", plain: "A single number summarising how ‘mechanotransducing’ each cell is, built from YAP nuclear localisation, focal-adhesion maturity, and actin coherence. Positive = above the image mean; negative = below.", technical: "Sign-corrected, z-scored composite; population-centred by construction." },
      { name: "glycocalyx_pericellular_ratio (composite axis)", plain: "The canonical glycocalyx scalar used in the glyco ↔ mechano correlation plots on the Overview page.", technical: "Re-used pericellular_ratio; not a separate feature." },
      { name: "deep_*", plain: "An optional 5 120-number ‘visual fingerprint’ of each cell from the Cell-DINO foundation model. Not shown in tables — used internally by the embedding-based cluster module.", technical: "Cell-DINO ViT-L/16 per-cell embedding; enabled per-job by opt-in." },
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
          <div className="text-[11px] text-gray-500 mt-0.5">
            <span className="text-gray-400 uppercase tracking-wider mr-1.5">channel</span>
            {group.channel}
            <span className="mx-2 text-gray-300">·</span>
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
    <div className="space-y-6">
      <header>
        <h1 className="text-[22px] font-semibold text-gray-900 tracking-tight">Methods & feature reference</h1>
        <p className="text-[13px] text-gray-500 mt-1 max-w-3xl leading-relaxed">
          A biologist's guide to every per-cell feature GlycoQuant reports: what each measurement
          is telling you about the cell, which channel produced it, and how to read it. Feature
          names below match the columns in the per-cell feature table and the CSV export.
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

      <div className="space-y-3">
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
            <h3 className="text-[14px] font-semibold text-gray-900 mb-1">How to read the σ badges</h3>
            <p className="text-[12px] text-gray-700 leading-relaxed max-w-3xl">
              Every feature panel shows the raw value together with a small badge like
              <code className="mx-1 px-1.5 py-0.5 bg-white rounded border border-gray-200 text-[10px] font-mono">+1.9σ</code>.
              That's the cell's z-score inside <em>this image's</em> distribution for the
              feature — it tells you where the cell sits relative to its neighbours on the
              same coverslip, not an absolute biological effect size. Great for spotting
              outliers and comparing features within a single field. Don't use it to compare
              the same cell across experiments with different stain concentrations or
              exposure settings.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
