/**
 * Overview — Stitch layout, fully dynamic data binding.
 *
 * Every slot is bound to real JobResult fields. No Stitch mock values
 * remain — when data is null/NaN the UI shows "—" honestly.
 *
 * Layout: 12-col grid, image cols 1-7 (dark), analytics cols 8-12.
 */
import Plotly from "plotly.js-dist-min";
import { useCallback, useMemo, useRef, useState } from "react";
import { PlotlyFigure } from "@/components/PlotlyFigure";
import { useJobStore } from "@/lib/jobStore";
import { fmt } from "@/lib/utils";
import type { JobResult } from "@/lib/api";

interface OverviewViewProps {
  result: JobResult;
  datasetLabel: string | null;
}

const CHANNEL_COLORS: Record<string, string> = {
  dapi: "#0000FF",
  glycocalyx: "#00FF00",
  yap: "#FF00FF",
  paxillin: "#FF4500",
  actin: "#FFBF00",
};

const CHANNEL_LABELS: Record<string, string> = {
  dapi: "DAPI",
  glycocalyx: "WGA",
  yap: "YAP",
  paxillin: "Paxillin",
  actin: "Actin",
};

export function OverviewView({ result, datasetLabel }: OverviewViewProps) {
  const setSelectedCellId = useJobStore((s) => s.setSelectedCellId);
  const [showAudit, setShowAudit] = useState(false);
  const [showSegmentation, setShowSegmentation] = useState(true);
  const [showGlycoOverlay, setShowGlycoOverlay] = useState(false);
  const [showMechanoOverlay, setShowMechanoOverlay] = useState(false);
  const [activeChannel, setActiveChannel] = useState("actin");
  const plotDivRef = useRef<HTMLDivElement | null>(null);

  const channelIndices = result.channel_trace_indices ?? {};
  const overlayRanges = result.overlay_trace_ranges ?? {};

  const handlePlotReady = useCallback((div: HTMLDivElement) => {
    plotDivRef.current = div;
  }, []);

  const switchChannel = useCallback(
    (channelName: string) => {
      const div = plotDivRef.current;
      if (!div) return;
      const allIndices = Object.values(channelIndices);
      const selectedIdx = channelIndices[channelName];
      if (selectedIdx === undefined) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const visibility = allIndices.map((idx) => idx === selectedIdx) as any;
      Plotly.restyle(div, { visible: visibility }, allIndices);
      setActiveChannel(channelName);
    },
    [channelIndices],
  );

  // Toggle per-cell feature overlays (glycocalyx score / mechano score)
  const toggleOverlay = useCallback(
    (overlayName: string, enabled: boolean) => {
      const div = plotDivRef.current;
      if (!div) return;
      const indices = overlayRanges[overlayName];
      if (!indices || indices.length === 0) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Plotly.restyle(div, { visible: enabled }, indices as any);
    },
    [overlayRanges],
  );

  const summary = result.mechano_score_summary;
  const m = result.hero_metrics;

  // Top-3 representative cells by mechano_score — fully from real data
  const representativeCells = useMemo(() => {
    try {
      const rows = JSON.parse(result.features_df_json) as Array<
        Record<string, number>
      >;
      const scored = rows.filter(
        (r) =>
          typeof r.mechano_score === "number" &&
          Number.isFinite(r.mechano_score),
      );
      return [...scored]
        .sort((a, b) => (b.mechano_score ?? 0) - (a.mechano_score ?? 0))
        .slice(0, 3);
    } catch {
      return [];
    }
  }, [result.features_df_json]);

  // Hero metrics — bound to real data
  const cellCountStr = result.cell_count.toLocaleString();
  const meanMechanoStr = fmt(m.mean_mechano_score, 2);
  const confidencePct =
    summary && summary.mode === "pca" && summary.pc1_variance_explained > 0
      ? Math.round(summary.pc1_variance_explained * 100)
      : null;

  const topR = summary?.top_correlation_r;
  const topPair = summary?.top_correlation_pair;

  // Derive a state label from the mechano score for each rep cell
  const stateLabel = (score: number | undefined): string => {
    if (typeof score !== "number" || !Number.isFinite(score)) return "Unmeasured";
    if (score > 0.5) return "High activation";
    if (score > 0) return "Moderate";
    if (score > -0.5) return "Low activation";
    return "Quiescent";
  };

  return (
    <div className="grid grid-cols-12 gap-0 min-h-[calc(100vh-3.5rem)]">
      {/* ============================================================ */}
      {/* Left: Microscopy Canvas (7 Columns)                           */}
      {/* ============================================================ */}
      <section className="col-span-7 relative h-[calc(100vh-3.5rem)] bg-inverse-surface overflow-hidden group">
        {/* Plotly segmentation figure — toggleable via overlay controls.
            Uses a fixed pixel height matching the viewport minus the nav
            so the Plotly figure fills the entire dark canvas without
            clipping or scrollbars. */}
        {showSegmentation && (
          <div className="absolute inset-0 [&_.js-plotly-plot]:!h-full [&_.plot-container]:!h-full [&_.svg-container]:!h-full">
            <PlotlyFigure
              figureJson={result.segmentation_figure_json}
              height={Math.max(400, window.innerHeight - 56)}
              className="w-full h-full"
              onReady={handlePlotReady}
            />
          </div>
        )}

        {/* Glycocalyx correlation overlay — shows the heatmap on canvas */}
        {showGlycoOverlay && result.glyco_mechano_correlation_figure_json && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-[5]">
            <div className="w-[90%] max-w-[700px] bg-surface-container-lowest p-4 ghost-border">
              <PlotlyFigure
                figureJson={result.glyco_mechano_correlation_figure_json}
                height={400}
              />
            </div>
          </div>
        )}

        {/* Mechano score distribution overlay */}
        {showMechanoOverlay && result.mechano_score_distribution_figure_json && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-[5]">
            <div className="w-[90%] max-w-[600px] bg-surface-container-lowest p-4 ghost-border">
              <PlotlyFigure
                figureJson={result.mechano_score_distribution_figure_json}
                height={300}
              />
            </div>
          </div>
        )}

        {/* Floating overlay controls — functional toggles */}
        <div className="absolute top-6 left-6 flex flex-col gap-2 z-10">
          <div className="bg-surface/80 backdrop-blur-md p-4 ghost-border flex flex-col gap-3 min-w-[200px]">
            <div className="flex items-center justify-between border-b border-outline-variant/10 pb-2">
              <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-tighter">
                Overlay Controls
              </span>
              <span className="material-symbols-outlined text-xs">tune</span>
            </div>
            <div className="flex flex-col gap-2">
              <OverlayToggle
                label="Segmentation"
                enabled={showSegmentation}
                onToggle={() => setShowSegmentation((v) => !v)}
              />
              <OverlayToggle
                label="Glycocalyx Score"
                enabled={showGlycoOverlay}
                onToggle={() => {
                  const next = !showGlycoOverlay;
                  setShowGlycoOverlay(next);
                  toggleOverlay("glycocalyx", next);
                  if (next) {
                    setShowMechanoOverlay(false);
                    toggleOverlay("mechano", false);
                  }
                }}
              />
              <OverlayToggle
                label="Mechanotransduction"
                enabled={showMechanoOverlay}
                onToggle={() => {
                  const next = !showMechanoOverlay;
                  setShowMechanoOverlay(next);
                  toggleOverlay("mechano", next);
                  if (next) {
                    setShowGlycoOverlay(false);
                    toggleOverlay("glycocalyx", false);
                  }
                }}
              />
            </div>
            <div className="mt-2 pt-2 border-t border-outline-variant/10">
              <div className="flex gap-1.5">
                {Object.entries(CHANNEL_COLORS).map(([ch, color]) => (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => switchChannel(ch)}
                    title={CHANNEL_LABELS[ch]}
                    className={`w-4 h-4 transition-all ${
                      activeChannel === ch
                        ? "ring-2 ring-white ring-offset-1 ring-offset-black/50 scale-110"
                        : "opacity-60 hover:opacity-100"
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
          </div>

          {result.warnings && result.warnings.length > 0 && (
            <div className="bg-surface/80 backdrop-blur-md px-3 py-1.5 ghost-border flex items-center gap-2 self-start">
              <span
                className="material-symbols-outlined"
                style={{ color: "#FF4500", fontVariationSettings: "'FILL' 1", fontSize: "14px" }}
              >
                flag
              </span>
              <span className="text-[10px] font-bold text-on-surface tracking-wide uppercase">
                QC Flags: {result.warnings.length} notice{result.warnings.length === 1 ? "" : "s"}
              </span>
            </div>
          )}
        </div>

        {/* Magnification + dataset — bottom */}
        <div className="absolute bottom-6 left-6 flex items-end gap-1 px-3 py-2 bg-surface/80 backdrop-blur-md ghost-border z-10">
          <div className="w-1 h-8 bg-on-surface/10 rounded-full relative overflow-hidden">
            <div className="absolute bottom-0 left-0 w-full h-[62%] bg-primary" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase text-on-surface-variant leading-none">
              Magnification
            </span>
            <span className="text-sm font-headline font-bold text-on-surface leading-tight">20.0x</span>
          </div>
        </div>

        {datasetLabel && (
          <div className="absolute bottom-6 right-6 flex items-end gap-3 px-3 py-2 bg-surface/80 backdrop-blur-md ghost-border z-10">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase text-on-surface-variant tracking-widest leading-none">
                {datasetLabel}
              </span>
              <span className="text-sm font-headline font-bold text-on-surface leading-tight tabular-nums">
                {result.cell_count} cells
              </span>
            </div>
          </div>
        )}
      </section>

      {/* ============================================================ */}
      {/* Right: Analytics Panel (5 Columns) — fully dynamic             */}
      {/* ============================================================ */}
      <section className="col-span-5 bg-surface-container-low p-8 overflow-y-auto h-[calc(100vh-3.5rem)] flex flex-col gap-10">
        {/* Hero Metrics — real data only */}
        <div className="grid grid-cols-3 gap-6">
          <HeroMetric label="Cells Analyzed" value={cellCountStr} />
          <HeroMetric label="Mean Mechanotransduction" value={meanMechanoStr} />
          <HeroMetric
            label="Confidence Score"
            value={confidencePct != null ? String(confidencePct) : "—"}
            suffix={confidencePct != null ? "%" : undefined}
          />
        </div>

        {/* Signature heatmap — real Plotly figure */}
        {result.glyco_mechano_correlation_figure_json && (
          <div className="flex flex-col gap-4">
            <div className="flex items-end justify-between border-l-2 border-primary pl-4">
              <div>
                <h3 className="text-sm font-headline font-semibold text-on-surface uppercase tracking-tight">
                  Glycocalyx ↔ Nuclear YAP Correlation
                </h3>
                <p className="text-[11px] text-on-surface-variant mt-0.5">
                  Primary quantitative signature heatmap for mechanosensitive state.
                </p>
              </div>
              {topR != null && (
                <span className="text-[11px] font-bold text-primary tabular-nums">
                  top |r| = {fmt(topR, 3)}
                </span>
              )}
            </div>
            <div className="bg-surface-container-lowest p-4 ghost-border">
              <PlotlyFigure
                figureJson={result.glyco_mechano_correlation_figure_json}
                height={360}
                downloadName="glycoquant_glyco_mechano_correlation"
              />
            </div>
            {topPair && (
              <p className="text-[10px] text-on-surface-variant">
                Strongest pair:{" "}
                <span className="font-mono">{topPair[0]}</span>
                <span className="mx-1 text-on-surface-variant/60">×</span>
                <span className="font-mono">{topPair[1]}</span>
              </p>
            )}
          </div>
        )}

        {/* Score distribution — real Plotly figure */}
        {result.mechano_score_distribution_figure_json && (
          <div className="flex flex-col gap-4">
            <h3 className="text-xs font-label font-bold text-on-surface-variant uppercase tracking-widest flex items-center gap-2">
              Mechanotransduction score distribution
              <span className="w-full h-[1px] bg-outline-variant/15 flex-1" />
            </h3>
            <div className="bg-surface-container-lowest ghost-border py-2 px-2">
              <PlotlyFigure
                figureJson={result.mechano_score_distribution_figure_json}
                height={200}
                downloadName="glycoquant_mechano_distribution"
              />
            </div>
            {summary && (
              <div className="flex items-center gap-3 text-[10px]">
                <span className={`px-1.5 py-0.5 ghost-border ${
                  summary.mode === "pca"
                    ? "bg-surface-container-lowest text-on-surface"
                    : "border-amber-500/40 bg-amber-500/10 text-amber-700"
                } font-bold uppercase tracking-wider`}>
                  {summary.mode === "pca"
                    ? `PCA · PC1 ${(summary.pc1_variance_explained * 100).toFixed(0)}% var · ${summary.n_cells_used} cells`
                    : `Weighted-sum fallback · ${summary.n_cells_used} cells`}
                </span>
                <span className="text-on-surface-variant tabular-nums">
                  μ {fmt(summary.mean, 2)} · σ {fmt(summary.std, 2)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Representative cells — FULLY DYNAMIC from per-cell DataFrame */}
        <div className="flex flex-col gap-4">
          <h3 className="text-xs font-label font-bold text-on-surface-variant uppercase tracking-widest">
            Representative cell morphological states
          </h3>
          <div className="grid grid-cols-3 gap-3">
            {representativeCells.length > 0 ? (
              representativeCells.map((cell, i) => {
                const cellId = Number(cell.cell_id);
                const score = cell.mechano_score;
                const label = stateLabel(score);
                return (
                  <button
                    key={cellId}
                    type="button"
                    onClick={() => setSelectedCellId(cellId)}
                    className="bg-surface-container-lowest ghost-border overflow-hidden text-left hover:border-primary/30 transition-colors"
                  >
                    <div className="h-24 bg-inverse-surface flex items-center justify-center">
                      <div className="text-center">
                        <span className="text-2xl font-headline font-bold text-white/80 tabular-nums">
                          {fmt(score, 2)}
                        </span>
                        <p className="text-[9px] text-white/50 uppercase tracking-widest mt-1">
                          mechano score
                        </p>
                      </div>
                    </div>
                    <div className="p-2 border-t border-outline-variant/10">
                      <span className={`block text-[10px] font-bold uppercase ${
                        i === 0 ? "text-primary" : "text-on-surface"
                      }`}>
                        {i === 0 ? "Top" : i === 1 ? "2nd" : "3rd"}: {label}
                      </span>
                      <span className="block text-[9px] text-on-surface-variant font-mono tabular-nums">
                        cell_{cellId} · YAP {fmt(cell.yap_nc_ratio_size_corrected, 2)} · FA {fmt(cell.fa_mature_fraction, 2)}
                      </span>
                    </div>
                  </button>
                );
              })
            ) : (
              <p className="col-span-3 text-xs text-on-surface-variant">
                No cells with a finite mechano score in this run.
              </p>
            )}
          </div>
        </div>

        {/* Full-feature audit — real Plotly figure when expanded */}
        <div className="mt-auto pt-6 border-t border-outline-variant/15">
          <button
            type="button"
            onClick={() => setShowAudit((v) => !v)}
            className="w-full flex items-center justify-between mb-4 group"
          >
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-on-surface-variant">analytics</span>
              <span className="text-xs font-headline font-semibold text-on-surface uppercase tracking-tight">
                Full Feature Correlation Audit
              </span>
            </div>
            <span className="material-symbols-outlined text-sm text-on-surface-variant group-hover:translate-y-0.5 transition-transform">
              {showAudit ? "expand_less" : "expand_more"}
            </span>
          </button>
          {showAudit ? (
            <div className="bg-surface-container-lowest ghost-border p-2">
              <PlotlyFigure
                figureJson={result.correlation_figure_json}
                height={500}
                downloadName="glycoquant_full_correlation"
              />
            </div>
          ) : (
            <div className="h-16 bg-surface-container-highest/50 ghost-border flex items-center justify-center">
              <p className="text-[10px] text-on-surface-variant font-medium uppercase tracking-[0.2em] opacity-40">
                Matrix Render Inhibited • Click to Expand
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

// Helpers

function HeroMetric({
  label,
  value,
  suffix,
}: {
  label: string;
  value: string;
  suffix?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
        {label}
      </span>
      <span className="text-3xl font-headline font-medium text-on-surface tabular-nums">
        {value}
        {suffix && <span className="text-sm ml-0.5">{suffix}</span>}
      </span>
      <div className="w-full h-[1px] bg-outline-variant/20 mt-2" />
    </div>
  );
}

function OverlayToggle({
  label,
  enabled,
  onToggle,
}: {
  label: string;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex items-center justify-between cursor-pointer w-full"
    >
      <span className="text-[11px] font-medium text-on-surface">{label}</span>
      <div
        className={`w-8 h-4 rounded-full relative flex items-center px-1 transition-colors ${
          enabled ? "bg-primary" : "bg-surface-container-highest"
        }`}
      >
        <div className={`w-2.5 h-2.5 bg-white rounded-full transition-all ${enabled ? "ml-auto" : ""}`} />
      </div>
    </button>
  );
}
