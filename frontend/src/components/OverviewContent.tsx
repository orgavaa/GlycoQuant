import { useState, useEffect, useRef, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeftRight, BarChart3, Brain, GitCompare } from "lucide-react";
import Plotly from "plotly.js-dist-min";
import { HeroMetrics } from "./HeroMetrics";
import { PlotlyCard } from "./PlotlyCard";
import { TopCells } from "./TopCells";
import { Card } from "./Card";
import { MLFeaturesPanel } from "./MLFeaturesPanel";
import { useJobStore } from "@/lib/jobStore";
import type { JobResult } from "@/lib/api";
import { recomputeCorrelation } from "@/lib/api";
import type { CellFeatures } from "@/lib/canvas/extract";
import {
  AssayReadinessCard,
  ConditionComparisonPanel,
  DatasetProvenancePanel,
  NormalizationWarningCard,
  QcSummaryCard,
  ScoreFormulaPanel,
  ValidationControlsPanel,
} from "./ScientificPanels";
import type { DatasetContext, QcReport } from "@/lib/scientificGuards";
import { fmt, fmtSigned } from "@/lib/utils";

interface Props {
  result: JobResult;
  cells: CellFeatures[];
  datasetContext: DatasetContext;
  qcReport: QcReport;
}

type ViewTab = "overview" | "condition" | "ml";

function displayFeatureName(name: string): string {
  return name
    .replace(/^glycocalyx_pericellular_ratio$/, "WGA proxy pericellular ratio")
    .replace(/^glycocalyx_/, "WGA proxy ")
    .replace(/^mechano_score$/, "mechanophenotype prototype score")
    .replace(/^mechano_/, "mechanophenotype ")
    .replace(/^yap_/, "YAP ")
    .replace(/^fa_/, "FA ")
    .replace(/^actin_/, "actin ")
    .replace(/^nuclear_/, "nuclear ")
    .replace(/^cell_/, "cell ")
    .replace(/_/g, " ");
}

export function OverviewContent({ result, cells, datasetContext, qcReport }: Props) {
  const [activeTab, setActiveTab] = useState<ViewTab>("overview");

  return (
    <div className="flex flex-col gap-4">
      {/* Tab strip */}
      <div className="grid grid-cols-3 gap-1 rounded-lg border border-gray-200 bg-gray-100 p-1">
        <button
          onClick={() => setActiveTab("overview")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[12px] font-medium transition-colors ${
            activeTab === "overview" ? "bg-gray-950 text-white shadow-sm" : "text-gray-500 hover:bg-white/60 hover:text-gray-950"
          }`}
        >
          <BarChart3 size={13} strokeWidth={1.8} />
          Summary
        </button>
        <button
          onClick={() => setActiveTab("condition")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[12px] font-medium transition-colors ${
            activeTab === "condition" ? "bg-gray-950 text-white shadow-sm" : "text-gray-500 hover:bg-white/60 hover:text-gray-950"
          }`}
        >
          <GitCompare size={13} strokeWidth={1.8} />
          Conditions
        </button>
        <button
          onClick={() => setActiveTab("ml")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[12px] font-medium transition-colors ${
            activeTab === "ml" ? "bg-gray-950 text-white shadow-sm" : "text-gray-500 hover:bg-white/60 hover:text-gray-950"
          }`}
        >
          <Brain size={13} strokeWidth={1.8} />
          Exploratory ML
        </button>
      </div>

      {activeTab === "overview"
        ? <OverviewTab result={result} cells={cells} datasetContext={datasetContext} qcReport={qcReport} />
        : activeTab === "condition"
          ? <ConditionComparisonPanel context={datasetContext} cells={cells} qc={qcReport} />
          : <MLFeaturesPanel result={result} />
      }
    </div>
  );
}

function OverviewTab({ result, cells, datasetContext, qcReport }: Props) {
  const setSelectedCellId = useJobStore(s => s.setSelectedCellId);
  const summary = result.mechano_score_summary;
  const m = result.hero_metrics;

  const topCells = useMemo(() => {
    const scored = cells.filter(c => typeof c.mechano_score === "number" && Number.isFinite(c.mechano_score));
    return [...scored]
      .sort((a, b) => Math.abs(b.mechano_score as number) - Math.abs(a.mechano_score as number))
      .slice(0, 5);
  }, [cells]);

  const glycoMechR = m.top_glyco_mechano_r ?? summary?.top_correlation_r ?? null;

  const subs = result.substitute_channels ?? [];

  return (
    <div className="flex flex-col gap-5">
      <DatasetProvenancePanel context={datasetContext} />
      <AssayReadinessCard context={datasetContext} />
      <QcSummaryCard qc={qcReport} />
      <NormalizationWarningCard />
      <ScoreFormulaPanel context={datasetContext} />
      {/* Substitute channel warning */}
      {subs.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="mb-1 text-[12px] font-medium text-amber-900">Substitute channel detected</div>
          <div className="text-[11px] leading-relaxed text-amber-800">
            {subs.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(", ")} features were skipped because the assigned stain is synthetic or substituted.
          </div>
        </div>
      )}

      <Card>
        <div className="mb-3 text-[11px] font-semibold uppercase text-gray-500">
          Field statistics
        </div>
        <HeroMetrics metrics={[
          { value: String(result.cell_count), label: "Cells" },
          { value: fmtSigned(m.mean_mechano_score), label: "Mean prototype score" },
          { value: glycoMechR != null ? fmt(glycoMechR) : "\u2014", label: "Top |rho|" },
          {
            value:
              summary?.n_significant_pairs_fdr != null
                ? String(summary.n_significant_pairs_fdr)
                : "\u2014",
            label: "FDR pairs",
          },
        ]} />
        {/* One-sentence scientific interpretation */}
        {glycoMechR != null && summary?.top_correlation_pair && (
          <div className="mt-3 border-t border-gray-100 pt-3 text-[11px] leading-relaxed text-gray-600">
            {Math.abs(glycoMechR) > 0.5
              ? `Moderate-to-strong image-local association: ${displayFeatureName(summary.top_correlation_pair[0])} is ${glycoMechR > 0 ? "positively" : "negatively"} associated with ${displayFeatureName(summary.top_correlation_pair[1])} (|r| = ${fmt(glycoMechR)}).`
              : Math.abs(glycoMechR) > 0.3
              ? `Weak-to-moderate image-local association: ${displayFeatureName(summary.top_correlation_pair[0])} shows ${glycoMechR > 0 ? "positive" : "negative"} correlation with ${displayFeatureName(summary.top_correlation_pair[1])} (|r| = ${fmt(glycoMechR)}).`
              : `Weak image-local association: strongest pair is |r| = ${fmt(glycoMechR)} between ${displayFeatureName(summary.top_correlation_pair[0])} and ${displayFeatureName(summary.top_correlation_pair[1])}.`
            }
            {" "}Image-local association; not a replicate-level effect size.
          </div>
        )}
        {summary?.yap_size_correction_applied !== null && summary?.yap_size_correction_applied !== undefined && (
          <YapCorrectionBadge summary={summary} />
        )}
      </Card>

      {result.glyco_mechano_correlation_figure_json && (
        <CorrelationCard result={result} />
      )}

      {result.mechano_score_distribution_figure_json && (
        <PlotlyCard
          title="Mechanophenotype distribution"
          figureJson={result.mechano_score_distribution_figure_json}
          maxHeight={220}
        />
      )}

      {topCells.length > 0 && (
        <Card>
          <div className="mb-3 text-[11px] font-semibold uppercase text-gray-500">
            Top deviating cells
          </div>
          <TopCells cells={topCells} onClick={id => setSelectedCellId(id)} />
        </Card>
      )}

      <CorrelationAudit figureJson={result.correlation_figure_json} result={result} />
      <ValidationControlsPanel context={datasetContext} />
    </div>
  );
}

function CorrelationAudit({ figureJson, result }: { figureJson: string; result: JobResult }) {
  const [open, setOpen] = useState(false);
  const summary = result.mechano_score_summary;
  const subs = result.substitute_channels ?? [];

  return (
    <Card>
      <div onClick={() => setOpen(v => !v)} className="flex items-center justify-between cursor-pointer">
        <span className="text-[11px] font-semibold uppercase text-gray-500">Methods &amp; provenance</span>
        <span className="text-[14px] text-gray-300">{open ? "\u25BE" : "\u25B8"}</span>
      </div>
      {open && (
        <div className="mt-4 space-y-4">
          {/* Method summary */}
          <div className="space-y-2 text-[11px] text-gray-500">
            <div className="flex justify-between">
              <span>Segmentation</span>
              <span className="text-gray-700">Cellpose-SAM (cpsam)</span>
            </div>
            <div className="flex justify-between">
              <span>Mechanophenotype prototype score</span>
              <span className="text-gray-700">{summary?.mode === "pca" ? "PCA mode 1" : "Weighted sum"} ({summary?.n_features_used ?? "?"} features)</span>
            </div>
            <div className="rounded-md bg-gray-50 px-2 py-1.5 text-gray-600">
              Composite imaging score from morphology, actin, WGA proxy, and optional real YAP/FA marker features; requires perturbation calibration before interpretation as mechanotransduction.
            </div>
            {summary?.pc1_variance_explained != null && summary.pc1_variance_explained > 0 && (
              <div className="flex justify-between">
                <span>PC1 variance explained</span>
                <span className="text-gray-700" style={{ fontFeatureSettings: "'tnum'" }}>{(summary.pc1_variance_explained * 100).toFixed(1)}%</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Valid cells</span>
              <span className="text-gray-700" style={{ fontFeatureSettings: "'tnum'" }}>{summary?.n_cells_used ?? result.cell_count}</span>
            </div>
            {subs.length > 0 && (
              <div className="flex justify-between">
                <span>Skipped modules</span>
                <span className="text-gray-700">{subs.join(", ")}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Deep embeddings</span>
              <span className="text-gray-700">{result.has_deep_features ? (result.deep_embedding_backend ?? "enabled") : "not computed"}</span>
            </div>
            <div className="flex justify-between">
              <span>Correlation method</span>
              <span className="text-gray-700">Spearman rank correlation</span>
            </div>
          </div>

          {/* Full correlation heatmap */}
          <div>
            <div className="text-[10px] text-gray-400 mb-2">All-feature correlation matrix (excluding deep embeddings)</div>
            <PlotlyInline figureJson={figureJson} maxHeight={480} />
          </div>
        </div>
      )}
    </Card>
  );
}

function PlotlyInline({ figureJson, maxHeight }: { figureJson: string; maxHeight: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    let parsed: { data: unknown[]; layout: Record<string, unknown> };
    try { parsed = JSON.parse(figureJson); } catch { return; }

    const backendXaxis = (parsed.layout?.xaxis ?? {}) as Record<string, unknown>;
    const backendYaxis = (parsed.layout?.yaxis ?? {}) as Record<string, unknown>;

    const layout = {
      ...parsed.layout,
      title: undefined,
      height: maxHeight,
      autosize: true,
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "#fff",
      font: { family: "IBM Plex Sans, sans-serif", color: "#9ca3af", size: 10 },
      margin: { l: 52, r: 20, t: 6, b: 48, pad: 2 },
      xaxis: { ...backendXaxis, gridcolor: "#f3f4f6", tickfont: { size: 10, family: "IBM Plex Sans" } },
      yaxis: { ...backendYaxis, gridcolor: "#f3f4f6", tickfont: { size: 10, family: "IBM Plex Sans" } },
    };

    const data = (parsed.data as Record<string, unknown>[]).map(trace => {
      if (trace.type === "heatmap" && trace.colorbar) {
        return {
          ...trace,
          colorbar: { ...(trace.colorbar as Record<string, unknown>), thickness: 14, len: 0.9, tickfont: { size: 10, color: "#9ca3af" }, outlinewidth: 0 },
        };
      }
      return trace;
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Plotly.react(ref.current, data as any, layout as any, { displayModeBar: false, responsive: true } as any);
    const el = ref.current;
    return () => { if (el) Plotly.purge(el); };
  }, [figureJson, maxHeight]);
  return <div ref={ref} className="w-full" />;
}

const PERMUTATION_N = 1000;

function CorrelationCard({ result }: { result: JobResult }) {
  const latestJobId = useJobStore((s) => s.latestJobId);
  const patchLatestJobResult = useJobStore((s) => s.patchLatestJobResult);
  const [nullMode, setNullMode] = useState<"parametric" | "permutation">("parametric");
  const summary = result.mechano_score_summary;

  const recompute = useMutation({
    mutationFn: async (nPerm: number) => {
      if (!latestJobId) throw new Error("No active job");
      return recomputeCorrelation(latestJobId, nPerm);
    },
    onSuccess: (newResult, nPerm) => {
      patchLatestJobResult(newResult);
      setNullMode(nPerm > 0 ? "permutation" : "parametric");
    },
  });

  const handleFlip = (next: "parametric" | "permutation") => {
    if (next === nullMode || recompute.isPending || !latestJobId) return;
    recompute.mutate(next === "permutation" ? PERMUTATION_N : 0);
  };

  const subtitle = summary?.top_correlation_pair
    ? `Spearman \u03C1 matrix \u2014 top |r| = ${fmt(summary.top_correlation_r)} (${displayFeatureName(summary.top_correlation_pair[0])} \u00d7 ${displayFeatureName(summary.top_correlation_pair[1])})`
    : undefined;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex gap-1 rounded-lg border border-gray-200 bg-gray-100 p-1">
          <button
            type="button"
            onClick={() => handleFlip("parametric")}
            disabled={!latestJobId || recompute.isPending}
            className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
              nullMode === "parametric"
                ? "bg-gray-950 text-white shadow-sm"
                : "text-gray-500 hover:bg-white/70 hover:text-gray-950"
            } ${!latestJobId || recompute.isPending ? "opacity-50 cursor-not-allowed" : ""}`}
            title="Parametric Spearman p-value from scipy. Fast; assumes asymptotic sampling distribution."
          >
            Parametric null
          </button>
          <button
            type="button"
            onClick={() => handleFlip("permutation")}
            disabled={!latestJobId || recompute.isPending}
            className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
              nullMode === "permutation"
                ? "bg-gray-950 text-white shadow-sm"
                : "text-gray-500 hover:bg-white/70 hover:text-gray-950"
            } ${!latestJobId || recompute.isPending ? "opacity-50 cursor-not-allowed" : ""}`}
            title={`Empirical null from ${PERMUTATION_N} shuffles of the mechanophenotype prototype score column. Distribution-free; preferred for heavy-tailed fluorescence data. Slower.`}
          >
            Empirical null (slower)
          </button>
        </div>
        {recompute.isPending && (
          <span className="text-[10px] text-gray-400">
            Computing {nullMode === "permutation" ? "parametric" : "empirical"} null…
          </span>
        )}
        {recompute.isError && (
          <span className="text-[10px] text-red-600" title={String(recompute.error)}>
            Recompute failed
          </span>
        )}
      </div>
      <PlotlyCard
        title={
          <>
            <span title="WGA lectin binds sialic acid + GlcNAc on the confocal-accessible outer coat. WGA is not a complete glycocalyx composition or thickness measurement. Heparan sulfate requires a separate anti-HS antibody channel.">
              WGA proxy pericellular
            </span>
            <ArrowLeftRight size={14} strokeWidth={1.5} className="text-gray-400" />
            <span>Mechanotransduction-associated features</span>
          </>
        }
        subtitle={
          nullMode === "permutation" && subtitle
            ? `${subtitle} (empirical null, ${PERMUTATION_N} permutations)`
            : subtitle
        }
        figureJson={result.glyco_mechano_correlation_figure_json ?? ""}
        maxHeight={360}
      />
    </div>
  );
}

function YapCorrectionBadge({ summary }: { summary: NonNullable<JobResult["mechano_score_summary"]> }) {
  const applied = summary.yap_size_correction_applied;
  const r2 = summary.yap_size_correction_r2;
  const lo = summary.yap_size_correction_slope_ci_lo;
  const hi = summary.yap_size_correction_slope_ci_hi;
  const hasCi = typeof lo === "number" && typeof hi === "number" && Number.isFinite(lo) && Number.isFinite(hi);
  const r2Str = typeof r2 === "number" && Number.isFinite(r2) ? r2.toFixed(2) : "—";
  const fmtSlope = (v: number) => (v >= 0 ? `+${v.toExponential(1)}` : v.toExponential(1));
  const tint = applied
    ? "bg-emerald-50 border-emerald-200 text-emerald-900"
    : "bg-amber-50 border-amber-200 text-amber-900";
  const dotTint = applied ? "bg-emerald-500" : "bg-amber-500";
  const headline = applied
    ? "Jones-2024 YAP size correction applied"
    : "Jones-2024 YAP size correction skipped";
  const explanation = applied
    ? `Cell area predicted YAP N/C strongly enough (r² = ${r2Str}) for the slope to be subtracted from yap_nc_ratio. Residuals feed yap_nc_ratio_size_corrected.`
    : `Cell area did not predict YAP N/C on this image (r² = ${r2Str}, below the 0.05 gate). Raw yap_nc_ratio was passed through unchanged — the mechanophenotype panel reads the uncorrected column.`;
  return (
    <div className={`mt-3 pt-3 border-t border-gray-100`}>
      <div className={`rounded-md border px-3 py-2 ${tint}`}>
        <div className="flex items-center gap-2 text-[12px] font-semibold">
          <span className={`h-1.5 w-1.5 rounded-full ${dotTint}`} />
          {headline}
        </div>
        <div className="mt-1 text-[11px] leading-relaxed opacity-80">{explanation}</div>
        {hasCi && (
          <div
            className="mt-1 text-[10px] opacity-70"
            style={{ fontFeatureSettings: "'tnum'" }}
            title="Percentile bootstrap 95% CI on the regression slope (200 resamples). CI crossing zero indicates a slope not distinguishable from noise."
          >
            slope 95% CI [{fmtSlope(lo as number)}, {fmtSlope(hi as number)}]
          </div>
        )}
      </div>
    </div>
  );
}
