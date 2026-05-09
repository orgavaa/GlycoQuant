import { useMemo, useState } from "react";
import { AlertTriangle, ClipboardList, Download, FlaskConical, Info, ListChecks } from "lucide-react";
import { Card } from "./Card";
import type { JobResult } from "@/lib/api";
import type { CellFeatures } from "@/lib/canvas/extract";
import { fmtSigned } from "@/lib/utils";
import {
  contextBadge,
  generateMethodsMarkdown,
  getInterpretationLevel,
  interpretationMessage,
  isRealMarker,
  scoreGroupState,
  type DatasetContext,
  type QcReport,
} from "@/lib/scientificGuards";

export function DatasetProvenancePanel({
  context,
  compact = false,
  glass = false,
}: {
  context: DatasetContext;
  compact?: boolean;
  glass?: boolean;
}) {
  const badge = contextBadge(context);
  const tone =
    badge.tone === "amber"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : badge.tone === "emerald"
        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
        : "border-gray-200 bg-gray-50 text-gray-700";
  return (
    <div
      className={`rounded-lg border shadow-lg backdrop-blur-xl ${
        glass ? "border-white/25 bg-white/78" : "border-gray-200 bg-white/95"
      } ${compact ? "p-3" : "p-4"}`}
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase text-gray-400">Dataset provenance</div>
          <div className="mt-0.5 truncate text-[12px] font-semibold text-gray-950" title={context.displayName}>
            {context.displayName}
          </div>
        </div>
        <span className={`flex-shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-medium ${tone}`}>
          {badge.label}
        </span>
      </div>
      <div className="grid grid-cols-[82px,1fr] gap-x-2 gap-y-1 text-[10px]">
        <span className="text-gray-400">Type</span>
        <span className="font-medium text-gray-700">{context.datasetType.replace(/_/g, " ")}</span>
        <span className="text-gray-400">Cell type</span>
        <span className="truncate font-medium text-gray-700">{context.cellType}</span>
        <span className="text-gray-400">Source</span>
        <span className="truncate font-medium text-gray-700" title={context.source}>{context.source}</span>
      </div>
      {!compact && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-[10px] leading-relaxed text-amber-800">
          {context.warnings[0] ?? interpretationMessage(getInterpretationLevel(context))}
        </div>
      )}
    </div>
  );
}

export function AssayReadinessCard({ context }: { context: DatasetContext }) {
  const markers = [
    ["Nuclear", "nuclear"],
    ["WGA/lectin", "wga_proxy"],
    ["YAP/TAZ", "yap"],
    ["FA marker", "focal_adhesion"],
    ["Actin", "actin"],
    ["Fibrosis", "fibrosis"],
  ] as const;
  return (
    <Card>
      <div className="mb-3 flex items-center gap-2">
        <ListChecks size={14} strokeWidth={1.7} className="text-gray-400" />
        <div>
          <div className="text-[12px] font-semibold text-gray-950">Marker truth table</div>
          <div className="text-[10px] text-gray-500">{interpretationMessage(getInterpretationLevel(context))}</div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-1.5">
        {markers.map(([label, marker]) => {
          const cfg = context.channelConfig[marker];
          const real = isRealMarker(context, marker);
          return (
            <div key={marker} className="grid grid-cols-[82px,70px,1fr] items-center gap-2 rounded-md bg-gray-50 px-2 py-1.5 text-[10px]">
              <span className="font-medium text-gray-700">{label}</span>
              <span className={`rounded border px-1.5 py-0.5 text-center ${
                real ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"
              }`}>
                {real ? "real" : "placeholder"}
              </span>
              <span className="truncate text-gray-500" title={cfg.note ?? cfg.label}>{cfg.note ?? cfg.label}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export function QcSummaryCard({ qc }: { qc: QcReport }) {
  return (
    <Card>
      <div className="mb-3 flex items-center gap-2">
        <ClipboardList size={14} strokeWidth={1.7} className="text-gray-400" />
        <div>
          <div className="text-[12px] font-semibold text-gray-950">Quality control</div>
          <div className="text-[10px] text-gray-500">QC flagged: {qc.field.qcFlaggedCells}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[10px]">
        <Metric label="Raw masks" value={String(qc.field.rawMasks)} />
        <Metric label="Analysis-ready" value={String(qc.field.analysisReadyCells)} />
        <Metric label="Excluded" value={`${(qc.field.excludedFraction * 100).toFixed(1)}%`} />
        <Metric label="Segmentation success" value={qc.field.segmentationSuccessRate == null ? "n/a" : `${(qc.field.segmentationSuccessRate * 100).toFixed(1)}%`} />
      </div>
      <div className="mt-3 rounded-md bg-gray-50 px-2.5 py-2 text-[10px] leading-relaxed text-gray-500">
        Field-level illumination gradient and focus/blur scores are not available in the current demo payload. QC currently uses mask geometry and feature-derived proxy flags.
      </div>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-gray-50 px-2.5 py-2">
      <div className="text-[14px] font-semibold text-gray-950" style={{ fontFeatureSettings: "'tnum'" }}>{value}</div>
      <div className="mt-0.5 text-[9px] font-semibold uppercase text-gray-400">{label}</div>
    </div>
  );
}

export function ScoreFormulaPanel({
  context,
  cell,
}: {
  context: DatasetContext;
  cell?: CellFeatures | null;
}) {
  const [includePlaceholders, setIncludePlaceholders] = useState(false);
  const groups = scoreGroupState(context);
  const contribution = (feature: string) => {
    if (!cell) return null;
    const v = cell[feature];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Info size={14} strokeWidth={1.7} className="text-gray-400" />
          <div>
            <div className="text-[12px] font-semibold text-gray-950">Score formula</div>
            <div className="text-[10px] text-gray-500">Mechanophenotype prototype score</div>
          </div>
        </div>
        <label className="flex items-center gap-1.5 text-[10px] text-gray-500" title="Disabled by default for demo/proxy data.">
          <input
            type="checkbox"
            checked={includePlaceholders}
            onChange={(e) => setIncludePlaceholders(e.target.checked)}
            className="h-3 w-3 rounded border-gray-300"
          />
          demo placeholders
        </label>
      </div>
      <div className="space-y-1.5">
        {groups.map((g) => {
          const active = g.active || includePlaceholders;
          const value = contribution(g.feature);
          return (
            <div key={g.group} className="grid grid-cols-[54px,1fr,72px] items-center gap-2 rounded-md bg-gray-50 px-2 py-1.5 text-[10px]">
              <span className="font-mono text-gray-700">{g.weight.toFixed(2)}x</span>
              <span className={active ? "text-gray-800" : "text-gray-400"}>
                {g.group}
                {g.placeholder && <span className="ml-1 text-amber-600">placeholder</span>}
              </span>
              <span className="text-right font-medium text-gray-700" style={{ fontFeatureSettings: "'tnum'" }}>
                {value == null ? (active ? "active" : "disabled") : fmtSigned(value)}
              </span>
            </div>
          );
        })}
      </div>
      {includePlaceholders && (
        <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-[10px] leading-relaxed text-amber-800">
          Placeholder modules show how the workflow behaves when the corresponding marker is available. They should not be interpreted biologically in the current demo dataset.
        </div>
      )}
      <div className="mt-2 text-[10px] leading-relaxed text-gray-500">
        Composite imaging score summarizing morphology, actin organization, WGA proxy signal, and optional mechanotransduction markers. Not a validated mechanotransduction score until calibrated with positive/negative biological controls.
      </div>
    </Card>
  );
}

export function ConditionComparisonPanel({
  context,
  cells,
  qc,
}: {
  context: DatasetContext;
  cells: CellFeatures[];
  qc: QcReport;
}) {
  const conditionKey = useMemo(() => findConditionKey(cells), [cells]);
  const summaries = useMemo(
    () => conditionKey ? summarizeConditions(cells, qc, conditionKey) : [],
    [cells, qc, conditionKey],
  );
  const hasConditionInference =
    context.conditionMetadata.condition &&
    context.conditionMetadata.biologicalReplicate &&
    context.conditionMetadata.technicalReplicate;
  if (!hasConditionInference || !conditionKey || summaries.length < 2) {
    return (
      <Card>
        <div className="mb-2 flex items-center gap-2">
          <AlertTriangle size={14} strokeWidth={1.7} className="text-amber-600" />
          <div className="text-[12px] font-semibold text-gray-950">Condition comparison unavailable</div>
        </div>
        <div className="text-[11px] leading-relaxed text-gray-600">
          Condition-level biological inference unavailable: only single-field technical demo data detected.
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
          <Metric label="Cells in field" value={String(cells.length)} />
          <Metric label="QC exclusion" value={`${(qc.field.excludedFraction * 100).toFixed(1)}%`} />
        </div>
        <div className="mt-3 text-[10px] leading-relaxed text-gray-500">
          Supported metadata columns include condition, perturbation, substrate stiffness, mechanical stimulation, timepoint, cell type, well, plate, field, biological replicate, and technical replicate.
        </div>
      </Card>
    );
  }
  const control = summaries.find((row) => row.condition.toLowerCase().includes("control")) ?? summaries[0];
  return (
    <Card>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-[12px] font-semibold text-gray-950">Condition comparison</div>
          <div className="mt-1 text-[10px] text-gray-500">Grouped by {conditionKey}; field-relative summary until replicate statistics are supplied.</div>
        </div>
        <span className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[9px] font-medium text-gray-500">
          {summaries.length} groups
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-[10px]">
          <thead className="border-b border-gray-100 text-gray-400">
            <tr>
              <th className="px-2 py-1.5 font-semibold uppercase">Condition</th>
              <th className="px-2 py-1.5 text-right font-semibold uppercase">Cells</th>
              <th className="px-2 py-1.5 text-right font-semibold uppercase">QC excl.</th>
              <th className="px-2 py-1.5 text-right font-semibold uppercase">WGA proxy</th>
              <th className="px-2 py-1.5 text-right font-semibold uppercase">Actin coher.</th>
              <th className="px-2 py-1.5 text-right font-semibold uppercase">Spread area</th>
              {isRealMarker(context, "yap") && <th className="px-2 py-1.5 text-right font-semibold uppercase">YAP N/C</th>}
              {isRealMarker(context, "focal_adhesion") && <th className="px-2 py-1.5 text-right font-semibold uppercase">FA maturity</th>}
              <th className="px-2 py-1.5 text-right font-semibold uppercase">Prototype effect</th>
            </tr>
          </thead>
          <tbody>
            {summaries.map((row) => (
              <tr key={row.condition} className="border-b border-gray-100 last:border-b-0">
                <td className="px-2 py-2 font-medium text-gray-800">{row.condition}</td>
                <td className="px-2 py-2 text-right tabular-nums text-gray-600">{row.nReady}/{row.nTotal}</td>
                <td className="px-2 py-2 text-right tabular-nums text-gray-600">{(row.qcExclusion * 100).toFixed(1)}%</td>
                <td className="px-2 py-2 text-right tabular-nums text-gray-600">{fmtMaybe(row.wga)}</td>
                <td className="px-2 py-2 text-right tabular-nums text-gray-600">{fmtMaybe(row.actin)}</td>
                <td className="px-2 py-2 text-right tabular-nums text-gray-600">{fmtMaybe(row.spreadArea)}</td>
                {isRealMarker(context, "yap") && <td className="px-2 py-2 text-right tabular-nums text-gray-600">{fmtMaybe(row.yap)}</td>}
                {isRealMarker(context, "focal_adhesion") && <td className="px-2 py-2 text-right tabular-nums text-gray-600">{fmtMaybe(row.fa)}</td>}
                <td className="px-2 py-2 text-right tabular-nums font-medium text-gray-900">{fmtSigned((row.prototypeScore ?? 0) - (control.prototypeScore ?? 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-[10px] leading-relaxed text-amber-800">
        Replicate-aware confidence intervals and treatment effects require biological replicate columns and validation controls. This table is descriptive until those gates are met.
      </div>
    </Card>
  );
}

const CONDITION_METADATA_KEYS = [
  "condition",
  "perturbation",
  "substrate_stiffness",
  "substrateStiffness",
  "mechanical_stimulation",
  "mechanicalStimulation",
  "timepoint",
  "cell_type",
  "cellType",
  "well",
  "plate",
  "field",
  "biological_replicate",
  "biologicalReplicate",
  "technical_replicate",
  "technicalReplicate",
];

function findConditionKey(cells: CellFeatures[]): string | null {
  for (const key of CONDITION_METADATA_KEYS) {
    const values = new Set(
      cells
        .map((cell) => cell[key])
        .filter((value) => typeof value === "string" || typeof value === "number")
        .map(String),
    );
    if (values.size >= 2) return key;
  }
  return null;
}

function summarizeConditions(cells: CellFeatures[], qc: QcReport, key: string) {
  const groups = new Map<string, CellFeatures[]>();
  for (const cell of cells) {
    const raw = cell[key];
    if (typeof raw !== "string" && typeof raw !== "number") continue;
    const value = String(raw);
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value)?.push(cell);
  }
  return [...groups.entries()].map(([condition, rows]) => {
    const readyRows = rows.filter((cell) => qc.byCellId.get(Number(cell.cell_id))?.analysisReady ?? true);
    const mean = (feature: string) => {
      const vals = readyRows
        .map((cell) => cell[feature])
        .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    };
    return {
      condition,
      nTotal: rows.length,
      nReady: readyRows.length,
      qcExclusion: rows.length > 0 ? (rows.length - readyRows.length) / rows.length : 0,
      wga: mean("glycocalyx_pericellular_ratio"),
      yap: mean("yap_nc_ratio_size_corrected"),
      fa: mean("fa_mature_fraction"),
      actin: mean("actin_stress_fiber_coherence"),
      spreadArea: mean("cell_area"),
      prototypeScore: mean("mechano_score"),
    };
  });
}

function fmtMaybe(value: number | null): string {
  return value == null ? "n/a" : value.toFixed(3);
}

export function ValidationControlsPanel({ context }: { context: DatasetContext }) {
  const controls = Object.entries(context.validationControls);
  return (
    <Card>
      <div className="mb-3 flex items-center gap-2">
        <FlaskConical size={14} strokeWidth={1.7} className="text-gray-400" />
        <div>
          <div className="text-[12px] font-semibold text-gray-950">Validation controls</div>
          <div className="text-[10px] text-gray-500">Required before biological score interpretation</div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-1.5">
        {controls.map(([name, status]) => (
          <div key={name} className="flex items-center justify-between gap-2 rounded-md bg-gray-50 px-2 py-1.5 text-[10px]">
            <span className="truncate text-gray-700">{name}</span>
            <span className="rounded border border-gray-200 bg-white px-1.5 py-0.5 text-gray-500">{status}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-[10px] leading-relaxed text-amber-800">
        Mechanophenotype prototype score is not biologically validated until benchmarked against positive and negative controls.
      </div>
    </Card>
  );
}

export function NormalizationWarningCard() {
  return (
    <Card className="!border-amber-200 !bg-amber-50">
      <div className="flex gap-2">
        <AlertTriangle size={14} strokeWidth={1.7} className="mt-0.5 flex-shrink-0 text-amber-700" />
        <div className="text-[11px] leading-relaxed text-amber-900">
          Current z-scores are field-relative unless condition-level metadata are provided. Field-relative z-scores should not be interpreted as treatment effects.
        </div>
      </div>
    </Card>
  );
}

export function MethodsExportButton({
  context,
  result,
  qc,
}: {
  context: DatasetContext;
  result: JobResult | null;
  qc: QcReport | null;
}) {
  const markdown = useMemo(() => generateMethodsMarkdown(context, result, qc), [context, result, qc]);
  const handleDownload = () => {
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "glycoquant-methods-export.md";
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <button
      type="button"
      onClick={handleDownload}
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 text-[11px] font-medium text-gray-700 transition hover:border-gray-300 hover:bg-gray-50"
      title="Export provenance, marker truth, QC, feature definitions, score formula, and limitations"
    >
      <Download size={13} strokeWidth={1.7} />
      Methods export
    </button>
  );
}
