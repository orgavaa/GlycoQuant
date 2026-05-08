import type { DemoCondition, JobResult } from "@/lib/api";
import type { CellFeatures } from "@/lib/canvas/extract";
import { computePopStats } from "@/lib/canvas/extract";

export type MarkerName =
  | "nuclear"
  | "wga_proxy"
  | "actin"
  | "yap"
  | "focal_adhesion"
  | "fibrosis";

export type InterpretationLevel =
  | "technical_demo"
  | "marker_quantification"
  | "phenotype_comparison"
  | "validated_biological_inference";

export type DatasetType =
  | "technical_demo"
  | "uploaded_candidate"
  | "project_specific_experimental";

export interface MarkerConfig {
  label: string;
  real: boolean;
  sourceChannel: string | null;
  markerClass: string;
  placeholder?: boolean;
  note?: string;
}

export interface DatasetContext {
  datasetName: string;
  displayName: string;
  datasetType: DatasetType;
  source: string;
  cellType: string;
  isProjectSpecific: boolean;
  biologicalInterpretationAllowed: boolean;
  channelConfig: Record<MarkerName, MarkerConfig>;
  conditionMetadata: {
    condition: boolean;
    perturbation: boolean;
    substrateStiffness: boolean;
    mechanicalStimulation: boolean;
    timepoint: boolean;
    well: boolean;
    plate: boolean;
    field: boolean;
    biologicalReplicate: boolean;
    technicalReplicate: boolean;
  };
  validationControls: Record<string, "not provided" | "provided" | "validated" | "failed QC">;
  warnings: string[];
}

export interface CellQcStatus {
  cellId: number;
  flags: string[];
  blockingFlags: string[];
  analysisReady: boolean;
}

export interface FieldQcSummary {
  rawMasks: number;
  measuredCells: number;
  analysisReadyCells: number;
  qcFlaggedCells: number;
  excludedCells: number;
  excludedFraction: number;
  segmentationSuccessRate: number | null;
  illuminationGradientScore: number | null;
  focusBlurScore: number | null;
  channelSaturationPct: Record<string, number>;
}

export interface QcReport {
  byCellId: Map<number, CellQcStatus>;
  field: FieldQcSummary;
  analysisReadyIds: Set<number>;
  qcFlaggedIds: Set<number>;
}

const DEFAULT_CONDITION_METADATA: DatasetContext["conditionMetadata"] = {
  condition: false,
  perturbation: false,
  substrateStiffness: false,
  mechanicalStimulation: false,
  timepoint: false,
  well: false,
  plate: false,
  field: false,
  biologicalReplicate: false,
  technicalReplicate: false,
};

const DEFAULT_VALIDATION_CONTROLS: DatasetContext["validationControls"] = {
  "stiff substrate": "not provided",
  "soft substrate": "not provided",
  "TGF-beta stimulation": "not provided",
  "LPA / contractility stimulus": "not provided",
  "ROCK inhibitor": "not provided",
  "FAK inhibitor": "not provided",
  "actin disruption control": "not provided",
  neuraminidase: "not provided",
  heparinase: "not provided",
  hyaluronidase: "not provided",
  "glycosylation / proteoglycan perturbation": "not provided",
  rescue: "not provided",
};

function clean(value: string | undefined | null, fallback: string): string {
  const v = value?.trim();
  return v && v.length > 0 ? v : fallback;
}

function isSyntheticSlot(slot: DemoCondition["slot_sources"][string] | undefined): boolean {
  if (!slot) return true;
  const text = `${slot.biological_identity} ${slot.note ?? ""}`.toLowerCase();
  return !slot.matches_labouesse_protocol || text.includes("synthetic") || text.includes("substitute");
}

function slotLabel(slot: DemoCondition["slot_sources"][string] | undefined, fallback: string): string {
  return clean(slot?.biological_identity, fallback);
}

export function datasetContextFromDemo(dataset: DemoCondition): DatasetContext {
  const slots = dataset.slot_sources ?? {};
  const synthetic = new Set(
    Object.entries(slots)
      .filter(([, source]) => isSyntheticSlot(source))
      .map(([name]) => name),
  );

  const channelConfig: DatasetContext["channelConfig"] = {
    nuclear: {
      label: "DAPI/Hoechst",
      real: !isSyntheticSlot(slots.dapi),
      sourceChannel: slots.dapi?.hpa_channel ?? slots.dapi?.biological_identity ?? "dapi",
      markerClass: "nucleus",
      note: slotLabel(slots.dapi, "Nuclear stain"),
    },
    wga_proxy: {
      label: "WGA / lectin-accessible pericellular signal",
      real: !isSyntheticSlot(slots.glycocalyx),
      sourceChannel: slots.glycocalyx?.hpa_channel ?? slots.glycocalyx?.biological_identity ?? "glycocalyx",
      markerClass: "lectin_proxy",
      note: "WGA reports lectin-accessible GlcNAc/sialic-acid-rich glycoconjugates, not full glycocalyx composition or thickness.",
    },
    actin: {
      label: "Actin / phalloidin proxy",
      real: !isSyntheticSlot(slots.actin),
      sourceChannel: slots.actin?.hpa_channel ?? slots.actin?.biological_identity ?? "actin",
      markerClass: "cytoskeleton",
      placeholder: synthetic.has("actin"),
      note: slotLabel(slots.actin, "Actin channel"),
    },
    yap: {
      label: synthetic.has("yap") ? "YAP/TAZ module placeholder" : "YAP/TAZ",
      real: !synthetic.has("yap") && Boolean(slots.yap),
      sourceChannel: synthetic.has("yap") ? null : slots.yap?.hpa_channel ?? slots.yap?.biological_identity ?? "yap",
      markerClass: "mechanotransduction_tf",
      placeholder: synthetic.has("yap") || !slots.yap,
      note: synthetic.has("yap")
        ? "YAP/TAZ placeholder module - not computed from real YAP/TAZ staining."
        : slotLabel(slots.yap, "YAP/TAZ marker"),
    },
    focal_adhesion: {
      label: synthetic.has("paxillin") ? "Focal adhesion module placeholder" : "Paxillin/vinculin/pFAK",
      real: !synthetic.has("paxillin") && Boolean(slots.paxillin),
      sourceChannel: synthetic.has("paxillin") ? null : slots.paxillin?.hpa_channel ?? slots.paxillin?.biological_identity ?? "paxillin",
      markerClass: "focal_adhesion",
      placeholder: synthetic.has("paxillin") || !slots.paxillin,
      note: synthetic.has("paxillin")
        ? "Focal adhesion placeholder module - not computed from real adhesion staining."
        : slotLabel(slots.paxillin, "Focal adhesion marker"),
    },
    fibrosis: {
      label: "Fibrosis marker not supplied",
      real: false,
      sourceChannel: null,
      markerClass: "fibrosis_marker",
      placeholder: true,
      note: "Optional target-assay marker: alpha-SMA, collagen I, or fibronectin.",
    },
  };

  return {
    datasetName: dataset.name,
    displayName: dataset.display_name || dataset.name,
    datasetType: "technical_demo",
    source: clean(dataset.source, "Bundled demo dataset"),
    cellType: clean(dataset.cell_line, "not specified"),
    isProjectSpecific: false,
    biologicalInterpretationAllowed: false,
    channelConfig,
    conditionMetadata: {
      ...DEFAULT_CONDITION_METADATA,
      condition: Boolean(dataset.description || dataset.gene),
      well: Boolean(dataset.name.match(/[A-Z]\d{2}/)),
      field: true,
      technicalReplicate: false,
    },
    validationControls: { ...DEFAULT_VALIDATION_CONTROLS },
    warnings: [
      "Demo dataset: public Cell Painting-style high-content microscopy image used to prototype segmentation, feature extraction, and single-cell analysis.",
      "This dataset is not a glycocalyx-mechanotransduction experiment. Biological interpretations involving YAP/TAZ, paxillin/focal adhesions, or mechanotransduction are placeholder-only unless real marker channels are provided.",
    ],
  };
}

export function datasetContextFromUpload(
  fileName: string,
  channelAssignments: Record<string, string>,
): DatasetContext {
  const roles = new Set(Object.values(channelAssignments));
  const has = (role: string) => roles.has(role);
  return {
    datasetName: fileName,
    displayName: fileName,
    datasetType: "uploaded_candidate",
    source: "User upload",
    cellType: "not specified",
    isProjectSpecific: false,
    biologicalInterpretationAllowed: false,
    channelConfig: {
      nuclear: {
        label: "DAPI/Hoechst",
        real: has("dapi"),
        sourceChannel: has("dapi") ? "user-assigned dapi" : null,
        markerClass: "nucleus",
      },
      wga_proxy: {
        label: "WGA / lectin-accessible pericellular signal",
        real: has("glycocalyx"),
        sourceChannel: has("glycocalyx") ? "user-assigned glycocalyx" : null,
        markerClass: "lectin_proxy",
        note: "User assignment; verify stain metadata before biological interpretation.",
      },
      actin: {
        label: "Actin / phalloidin",
        real: has("actin"),
        sourceChannel: has("actin") ? "user-assigned actin" : null,
        markerClass: "cytoskeleton",
      },
      yap: {
        label: has("yap") ? "YAP/TAZ" : "YAP/TAZ module placeholder",
        real: has("yap"),
        sourceChannel: has("yap") ? "user-assigned yap" : null,
        markerClass: "mechanotransduction_tf",
        placeholder: !has("yap"),
      },
      focal_adhesion: {
        label: has("paxillin") ? "Paxillin/vinculin/pFAK" : "Focal adhesion module placeholder",
        real: has("paxillin"),
        sourceChannel: has("paxillin") ? "user-assigned paxillin" : null,
        markerClass: "focal_adhesion",
        placeholder: !has("paxillin"),
      },
      fibrosis: {
        label: "Fibrosis marker not supplied",
        real: false,
        sourceChannel: null,
        markerClass: "fibrosis_marker",
        placeholder: true,
      },
    },
    conditionMetadata: { ...DEFAULT_CONDITION_METADATA },
    validationControls: { ...DEFAULT_VALIDATION_CONTROLS },
    warnings: [
      "Uploaded image has user-assigned marker roles only. Condition metadata, replicate metadata, and validation controls are not present in this prototype run.",
    ],
  };
}

export function datasetContextFromResult(
  result: JobResult,
  label: string | null,
  stored?: DatasetContext | null,
): DatasetContext {
  if (stored) {
    return applyResultMarkerOverrides(stored, result);
  }
  const assignments = result.channel_assignments ?? {};
  const context = datasetContextFromUpload(label ?? "Untitled analysis", assignments);
  if ((label ?? "").toLowerCase().includes("bbbc") || (label ?? "").toLowerCase().includes("rxrx")) {
    return {
      ...context,
      datasetType: "technical_demo",
      source: "Public technical demo dataset",
      biologicalInterpretationAllowed: false,
      warnings: [
        "Technical demo only. Do not interpret as glycocalyx-mechanotransduction biology.",
      ],
    };
  }
  return applyResultMarkerOverrides(context, result);
}

function applyResultMarkerOverrides(context: DatasetContext, result: JobResult): DatasetContext {
  const substitutes = new Set(result.substitute_channels ?? []);
  const next: DatasetContext = {
    ...context,
    channelConfig: { ...context.channelConfig },
  };
  if (substitutes.has("yap")) {
    next.channelConfig.yap = {
      ...next.channelConfig.yap,
      label: "YAP/TAZ module placeholder",
      real: false,
      sourceChannel: null,
      placeholder: true,
      note: "YAP/TAZ placeholder module - not computed from real YAP/TAZ staining.",
    };
  }
  if (substitutes.has("paxillin")) {
    next.channelConfig.focal_adhesion = {
      ...next.channelConfig.focal_adhesion,
      label: "Focal adhesion module placeholder",
      real: false,
      sourceChannel: null,
      placeholder: true,
      note: "Focal adhesion placeholder module - not computed from real adhesion staining.",
    };
  }
  return next;
}

export function isRealMarker(context: DatasetContext, markerName: MarkerName): boolean {
  return Boolean(context.channelConfig[markerName]?.real);
}

export function getInterpretationLevel(context: DatasetContext): InterpretationLevel {
  if (context.datasetType === "technical_demo" || !context.biologicalInterpretationAllowed) {
    return "technical_demo";
  }
  const md = context.conditionMetadata;
  const hasConditions = md.condition && md.biologicalReplicate && md.technicalReplicate;
  const hasPerturbation = md.perturbation || md.substrateStiffness || md.mechanicalStimulation;
  if (!hasConditions || !hasPerturbation) return "marker_quantification";
  const controls = Object.values(context.validationControls);
  const hasValidatedControls = controls.some((s) => s === "validated");
  const hasFailedControls = controls.some((s) => s === "failed QC");
  if (hasValidatedControls && !hasFailedControls) return "validated_biological_inference";
  return "phenotype_comparison";
}

export function interpretationMessage(level: InterpretationLevel): string {
  if (level === "technical_demo") {
    return "Technical demo only. Do not interpret as glycocalyx-mechanotransduction biology.";
  }
  if (level === "marker_quantification") {
    return "Marker quantification available, but no treatment-level inference.";
  }
  if (level === "phenotype_comparison") {
    return "Condition-level phenotype comparison available. Validation controls still required.";
  }
  return "Biological inference supported by marker data, condition metadata, replicates and validation controls.";
}

export function contextBadge(context: DatasetContext): { label: string; tone: "amber" | "gray" | "emerald" } {
  if (context.datasetType === "technical_demo") return { label: "Demo proxy data", tone: "amber" };
  if (context.biologicalInterpretationAllowed) return { label: "Experimental data", tone: "emerald" };
  return { label: "Experimental candidate", tone: "gray" };
}

export function computeQcReport(
  cells: CellFeatures[],
  result: JobResult,
): QcReport {
  const stats = computePopStats(cells);
  const rawMasks = result.cell_overlay?.n_cells ?? result.cell_count;
  const imageW = result.cell_overlay?.image_w ?? null;
  const imageH = result.cell_overlay?.image_h ?? null;
  const polygons = result.cell_overlay?.polygons ?? [];
  const bboxById = new Map<number, { minX: number; minY: number; maxX: number; maxY: number }>();
  for (const p of polygons) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of p.vertices) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    bboxById.set(p.cell_id, { minX, minY, maxX, maxY });
  }

  const byCellId = new Map<number, CellQcStatus>();
  const analysisReadyIds = new Set<number>();
  const qcFlaggedIds = new Set<number>();
  const saturationByChannel: Record<string, number> = { nuclear: 0, wga: 0, actin: 0 };

  const areaStats = stats.cell_area ?? stats.cell_spread_area;
  const nuclearAreaStats = stats.nuclear_area;
  for (const cell of cells) {
    const id = Number(cell.cell_id);
    const flags: string[] = [];
    const blockingFlags: string[] = [];
    const area = numeric(cell.cell_area) ?? numeric(cell.cell_spread_area);
    const nucArea = numeric(cell.nuclear_area);
    const ncRatio = numeric(cell.nuclear_to_cell_area_ratio) ?? (area && nucArea ? nucArea / area : null);
    const solidity = numeric(cell.cell_solidity);
    const wgaMean = numeric(cell.glycocalyx_mean_intensity);
    const actinMean = numeric(cell.actin_mean_intensity);
    const nuclearIntensity = numeric(cell.yap_nuclear_intensity);
    const bbox = bboxById.get(id);

    if (bbox && imageW && imageH && (bbox.minX <= 1 || bbox.minY <= 1 || bbox.maxX >= imageW - 2 || bbox.maxY >= imageH - 2)) {
      flags.push("edge-truncated cell");
      blockingFlags.push("edge-truncated cell");
    }
    if (area != null && areaStats) {
      if (area < Math.max(40, areaStats.mean - 2.5 * areaStats.std)) {
        flags.push("very small cell area");
        blockingFlags.push("very small cell area");
      }
      if (area > areaStats.mean + 3 * areaStats.std) {
        flags.push("very large cell area");
        blockingFlags.push("very large cell area");
      }
    }
    if (nucArea != null && nuclearAreaStats && nucArea < Math.max(12, nuclearAreaStats.mean - 2.5 * nuclearAreaStats.std)) {
      flags.push("low nuclear signal");
      blockingFlags.push("low nuclear signal");
    }
    if (ncRatio != null && (ncRatio < 0.03 || ncRatio > 0.75)) {
      flags.push("abnormal nuclear-to-cell area ratio");
      blockingFlags.push("abnormal nuclear-to-cell area ratio");
    }
    if (solidity != null && solidity < 0.72) {
      flags.push("segmentation confidence low");
      blockingFlags.push("segmentation confidence low");
    }
    if (solidity != null && solidity < 0.65) {
      flags.push("overlapping/touching cells");
    }
    if (wgaMean != null && wgaMean > 0.98) {
      flags.push("saturated WGA channel");
      blockingFlags.push("saturated WGA channel");
      saturationByChannel.wga += 1;
    }
    if (actinMean != null && actinMean > 0.98) {
      flags.push("saturated actin channel");
      blockingFlags.push("saturated actin channel");
      saturationByChannel.actin += 1;
    }
    if (nuclearIntensity != null && nuclearIntensity > 0.98) {
      flags.push("saturated nuclear channel");
      blockingFlags.push("saturated nuclear channel");
      saturationByChannel.nuclear += 1;
    }
    if (area != null && nucArea != null && area < 80 && nucArea < 20) {
      flags.push("high debris probability");
      blockingFlags.push("high debris probability");
    }
    if (wgaMean != null && stats.glycocalyx_mean_intensity && wgaMean < stats.glycocalyx_mean_intensity.mean - 2 * stats.glycocalyx_mean_intensity.std) {
      flags.push("low signal-to-background ratio");
    }

    const status = { cellId: id, flags, blockingFlags, analysisReady: blockingFlags.length === 0 };
    byCellId.set(id, status);
    if (status.analysisReady) analysisReadyIds.add(id);
    if (flags.length > 0) qcFlaggedIds.add(id);
  }

  const measuredCells = cells.length;
  const qcFlaggedCells = qcFlaggedIds.size + Math.max(0, rawMasks - measuredCells);
  const analysisReadyCells = analysisReadyIds.size;
  const excludedCells = Math.max(0, rawMasks - analysisReadyCells);

  return {
    byCellId,
    analysisReadyIds,
    qcFlaggedIds,
    field: {
      rawMasks,
      measuredCells,
      analysisReadyCells,
      qcFlaggedCells,
      excludedCells,
      excludedFraction: rawMasks > 0 ? excludedCells / rawMasks : 0,
      segmentationSuccessRate: rawMasks > 0 ? measuredCells / rawMasks : null,
      illuminationGradientScore: null,
      focusBlurScore: null,
      channelSaturationPct: {
        nuclear: measuredCells > 0 ? saturationByChannel.nuclear / measuredCells : 0,
        wga: measuredCells > 0 ? saturationByChannel.wga / measuredCells : 0,
        actin: measuredCells > 0 ? saturationByChannel.actin / measuredCells : 0,
      },
    },
  };
}

function numeric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export const SCORE_WEIGHTS = [
  { group: "Morphology", marker: null, weight: 0.25, feature: "cell_area / nuclear morphology" },
  { group: "Actin coherence", marker: "actin" as MarkerName, weight: 0.2, feature: "actin_stress_fiber_coherence" },
  { group: "WGA proxy", marker: "wga_proxy" as MarkerName, weight: 0.2, feature: "glycocalyx_pericellular_ratio" },
  { group: "YAP N/C", marker: "yap" as MarkerName, weight: 0.2, feature: "yap_nc_ratio_size_corrected" },
  { group: "FA maturity", marker: "focal_adhesion" as MarkerName, weight: 0.15, feature: "fa_mature_fraction" },
] as const;

export function scoreGroupState(context: DatasetContext) {
  return SCORE_WEIGHTS.map((item) => ({
    ...item,
    active: item.marker == null || isRealMarker(context, item.marker),
    placeholder: item.marker != null && !isRealMarker(context, item.marker),
  }));
}

export function generateMethodsMarkdown(
  context: DatasetContext,
  result: JobResult | null,
  qc: QcReport | null,
): string {
  const markers = Object.entries(context.channelConfig)
    .map(([name, cfg]) => `- ${name}: ${cfg.label}; real=${cfg.real}; source=${cfg.sourceChannel ?? "not supplied"}; class=${cfg.markerClass}`)
    .join("\n");
  const qcText = qc
    ? `- raw masks: ${qc.field.rawMasks}\n- analysis-ready cells: ${qc.field.analysisReadyCells}\n- QC-flagged cells: ${qc.field.qcFlaggedCells}\n- excluded fraction: ${(qc.field.excludedFraction * 100).toFixed(1)}%`
    : "- QC report unavailable";
  const weights = scoreGroupState(context)
    .map((w) => `- ${w.weight.toFixed(2)} x ${w.group}: ${w.active ? "active" : "disabled/placeholder"} (${w.feature})`)
    .join("\n");
  return [
    "# GlycoQuant Methods Export",
    "",
    "## Dataset provenance",
    `- dataset: ${context.displayName}`,
    `- dataset type: ${context.datasetType}`,
    `- source: ${context.source}`,
    `- cell type: ${context.cellType}`,
    `- interpretation level: ${getInterpretationLevel(context)}`,
    `- biological interpretation allowed: ${context.biologicalInterpretationAllowed}`,
    "",
    "## Channel mapping and marker truth",
    markers,
    "",
    "## Warnings",
    ...context.warnings.map((w) => `- ${w}`),
    "- WGA reports lectin-accessible GlcNAc/sialic-acid-rich glycoconjugates. It is not a complete glycocalyx composition or thickness measurement.",
    "- Mechanophenotype prototype score is not biologically validated until benchmarked against positive and negative controls.",
    "- Current z-scores are field-relative unless condition-level metadata are provided.",
    "",
    "## Segmentation and masks",
    "- segmentation: Cellpose-SAM (cpsam) when backend default is used",
    "- cell/nucleus masks: backend cell and nuclear segmentation outputs",
    "",
    "## Feature definitions",
    "- WGA proxy signal: pericellular lectin-accessible GlcNAc/sialic-acid-rich glycoconjugate fluorescence.",
    "- Pericellular band: annular band outside the cell boundary used for WGA radial and ratio features.",
    "- Radial WGA profile: mean WGA intensity across outward annular bins from the cell edge.",
    "- Nuclear/cytoplasmic ratio: nuclear marker intensity divided by cytoplasmic marker intensity; only biologically interpretable when the marker is real.",
    "- Focal adhesion maturity: adhesion-size/morphology summary; only biologically interpretable when paxillin/vinculin/pFAK staining is real.",
    "- Actin coherence: structure-tensor coherence of the actin/phalloidin signal.",
    "- Field-relative z-score: z-score computed within this field, not a condition-level treatment effect.",
    "- Condition-level effect size: replicate-aware difference vs control, unavailable without condition metadata.",
    "",
    "## QC thresholds and field QC",
    qcText,
    "- QC flags include edge contact, low nuclear signal, saturation proxy, abnormal nuclear-to-cell area ratio, low solidity, area outliers, and debris proxy.",
    "- Illumination gradient and focus/blur scores are reported as unavailable unless raw-image metrics are added.",
    "",
    "## Score formula",
    "Mechanophenotype prototype score display formula:",
    weights,
    "",
    "## Result metadata",
    `- image hash: ${result?.image_hash ?? "not available"}`,
    `- pixel size: ${result?.pixel_size_um ?? "not available"} um/px`,
    `- software version: frontend 0.4.0 / glycoquant 0.0.1`,
  ].join("\n");
}
