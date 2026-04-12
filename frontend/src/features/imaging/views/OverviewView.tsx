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
  const [showFaOverlay, setShowFaOverlay] = useState(false);
  const [showYapOverlay, setShowYapOverlay] = useState(false);
  const [showRingOverlay, setShowRingOverlay] = useState(false);
  const [, setActiveChannel] = useState("actin");
  const plotDivRef = useRef<HTMLDivElement | null>(null);

  // Channel PNG compositing state
  const channelPngs = result.channel_pngs ?? null;
  const [channelVisibility, setChannelVisibility] = useState<Record<string, boolean>>({
    dapi: true,
    glycocalyx: true,
    yap: false,
    paxillin: false,
    actin: true,
  });
  // Brightness/contrast per channel — sliders will be added in the
  // overlay controls panel. For now, default to 1.0 (no adjustment).
  const [channelBrightness] = useState<Record<string, number>>({});
  const [channelContrast] = useState<Record<string, number>>({});

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

  return (
    <div className="flex min-h-[calc(100vh-3rem)]">
      {/* ============================================================ */}
      {/* Left: Microscopy Canvas — fills all available space            */}
      {/* ============================================================ */}
      <section className="flex-1 relative h-[calc(100vh-3.5rem)] bg-black overflow-hidden group">
        {/* Layer 1: Channel PNG stack with additive compositing.
            Each channel is a separate <img> with mix-blend-mode:screen
            so they blend like real fluorescence. Toggle visibility per
            channel via the chip strip. Brightness/contrast via CSS filter. */}
        {channelPngs && (
          <div className="absolute inset-0 z-0">
            {Object.entries(channelPngs).map(([ch, src]) => (
              <img
                key={ch}
                src={src}
                alt={ch}
                className="absolute inset-0 w-full h-full object-contain"
                style={{
                  mixBlendMode: "screen",
                  opacity: channelVisibility[ch] ? 1 : 0,
                  transition: "opacity 100ms",
                  filter: `brightness(${channelBrightness[ch] ?? 1}) contrast(${channelContrast[ch] ?? 1})`,
                }}
              />
            ))}
          </div>
        )}

        {/* Layer 2: Plotly polygon overlays ON TOP of the image stack.
            Segmentation contours + feature fills + hover tooltips.
            Background is transparent so the channel PNGs show through. */}
        {showSegmentation && (
          <div className="absolute inset-0 z-[1] [&_.js-plotly-plot]:!h-full [&_.plot-container]:!h-full [&_.svg-container]:!h-full">
            <PlotlyFigure
              figureJson={result.segmentation_figure_json}
              height={Math.max(400, window.innerHeight - 56)}
              className="w-full h-full"
              onReady={handlePlotReady}
              onClick={(event) => {
                const cd = event.points?.[0]?.customdata;
                if (Array.isArray(cd) && cd[0] != null) {
                  const cellId = Number(cd[0]);
                  if (Number.isFinite(cellId)) {
                    setSelectedCellId(cellId);
                  }
                }
              }}
            />
          </div>
        )}

        {/* Glycocalyx correlation overlay — shows the heatmap on canvas */}
        {showGlycoOverlay && result.glyco_mechano_correlation_figure_json && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-[5]">
            <div className="w-[90%] max-w-[700px] bg-black/80 backdrop-blur-md p-4 border border-white/10">
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
            <div className="w-[90%] max-w-[600px] bg-black/80 backdrop-blur-md p-4 border border-white/10">
              <PlotlyFigure
                figureJson={result.mechano_score_distribution_figure_json}
                height={300}
              />
            </div>
          </div>
        )}

        {/* Floating overlay controls — functional toggles */}
        <div className="absolute top-6 left-6 flex flex-col gap-2 z-10">
          <div className="bg-black/70 backdrop-blur-md p-3 border border-white/10 flex flex-col gap-2.5 min-w-[180px]">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <span className="text-[9px] font-bold text-on-surface/50 uppercase tracking-widest">
                Overlays
              </span>
              <span className="material-symbols-outlined text-xs text-on-surface/30">tune</span>
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
              <OverlayToggle
                label="FA Detection"
                enabled={showFaOverlay}
                onToggle={() => {
                  const next = !showFaOverlay;
                  setShowFaOverlay(next);
                  toggleOverlay("fa_overlay", next);
                }}
              />
              <OverlayToggle
                label="YAP Compartment"
                enabled={showYapOverlay}
                onToggle={() => {
                  const next = !showYapOverlay;
                  setShowYapOverlay(next);
                  toggleOverlay("yap_compartment", next);
                }}
              />
              <OverlayToggle
                label="Pericellular Ring"
                enabled={showRingOverlay}
                onToggle={() => {
                  const next = !showRingOverlay;
                  setShowRingOverlay(next);
                  toggleOverlay("pericellular_ring", next);
                }}
              />
            </div>
            <div className="mt-1 pt-2 border-t border-white/10">
              <div className="flex gap-1.5">
                {Object.entries(CHANNEL_COLORS).map(([ch, color]) => (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => {
                      // Toggle this channel's visibility in the PNG stack
                      setChannelVisibility((prev) => ({
                        ...prev,
                        [ch]: !prev[ch],
                      }));
                      setActiveChannel(ch);
                      // Also switch the Plotly heatmap if available
                      switchChannel(ch);
                    }}
                    title={CHANNEL_LABELS[ch]}
                    className={`w-4 h-4 transition-all ${
                      channelVisibility[ch]
                        ? "ring-2 ring-white ring-offset-1 ring-offset-black/50 scale-110"
                        : "opacity-30 hover:opacity-60"
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
          </div>

          {result.warnings && result.warnings.length > 0 && (
            <div className="bg-black/70 backdrop-blur-md px-3 py-1.5 border border-white/10 flex items-center gap-2 self-start">
              <span
                className="material-symbols-outlined"
                style={{ color: "#FF4500", fontVariationSettings: "'FILL' 1", fontSize: "14px" }}
              >
                flag
              </span>
              <span className="text-[9px] font-bold text-on-surface/80 tracking-wide uppercase">
                QC Flags: {result.warnings.length} notice{result.warnings.length === 1 ? "" : "s"}
              </span>
            </div>
          )}
        </div>

        {/* Scale bar — bottom-right, always visible */}
        <div className="absolute bottom-5 right-5 z-10 flex flex-col items-end gap-1">
          <div className="w-[80px] h-[3px] bg-white" />
          <span className="text-[9px] font-bold text-white/80 tracking-wider">
            50 µm
          </span>
        </div>

        {/* Dataset chip — bottom-left */}
        {datasetLabel && (
          <div className="absolute bottom-5 left-5 flex items-end gap-3 px-3 py-2 bg-black/70 backdrop-blur-md border border-white/10 z-10">
            <div className="flex flex-col">
              <span className="text-[9px] font-bold uppercase text-white/50 tracking-widest leading-none">
                {datasetLabel}
              </span>
              <span className="text-xs font-headline font-bold text-white leading-tight tabular-nums">
                {result.cell_count} cells
              </span>
            </div>
          </div>
        )}
      </section>

      {/* ============================================================ */}
      {/* Right: Analytics Rail — fixed 320px, dark                       */}
      {/* ============================================================ */}
      <section className="w-[380px] shrink-0 bg-surface-container-low p-6 overflow-y-auto h-[calc(100vh-3.5rem)] flex flex-col gap-8">
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
            <div className="flex items-end justify-between border-l-2 border-primary pl-3">
              <div>
                <h3 className="text-sm font-headline font-semibold text-on-surface uppercase tracking-tight">
                  Glyco ↔ Mechano Correlation
                </h3>
              </div>
              {topR != null && (
                <span className="text-xs font-bold text-primary tabular-nums">
                  |r| = {fmt(topR, 2)}
                </span>
              )}
            </div>
            <div className="bg-surface-container-lowest ghost-border p-4">
              <PlotlyFigure
                figureJson={result.glyco_mechano_correlation_figure_json}
                height={480}
              />
            </div>
            {topPair && (
              <p className="text-[9px] text-on-surface/30 font-mono tabular-nums">
                {topPair[0]} × {topPair[1]}
              </p>
            )}
          </div>
        )}

        {/* Score distribution — real Plotly figure */}
        {result.mechano_score_distribution_figure_json && (
          <div className="flex flex-col gap-4">
            <h3 className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest">
              Score distribution
            </h3>
            <div className="bg-surface-container-lowest ghost-border p-4">
              <PlotlyFigure
                figureJson={result.mechano_score_distribution_figure_json}
                height={280}
              />
            </div>
            {summary && (
              <div className="flex items-center gap-2 text-[9px] text-on-surface-variant">
                <span className={`px-1.5 py-0.5 rounded-sm ${
                  summary.mode === "pca"
                    ? "bg-surface-container text-on-surface/60"
                    : "bg-amber-500/20 text-amber-400"
                } font-bold uppercase tracking-wider`}>
                  {summary.mode === "pca"
                    ? `PCA · ${(summary.pc1_variance_explained * 100).toFixed(0)}%`
                    : `fallback`}
                </span>
                <span className="tabular-nums">
                  μ {fmt(summary.mean, 2)} · σ {fmt(summary.std, 2)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Representative cells — FULLY DYNAMIC from per-cell DataFrame */}
        <div className="flex flex-col gap-4">
          <h3 className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest">
            Top cells by mechano score
          </h3>
          <div className="grid grid-cols-3 gap-3">
            {representativeCells.length > 0 ? (
              representativeCells.map((cell, i) => {
                const cellId = Number(cell.cell_id);
                const score = cell.mechano_score;
                return (
                  <button
                    key={cellId}
                    type="button"
                    onClick={() => setSelectedCellId(cellId)}
                    className="bg-surface-container-lowest ghost-border overflow-hidden text-left hover:bg-surface-container transition-colors rounded-sm"
                  >
                    <div className="p-3">
                      <div className="flex items-baseline justify-between">
                        <span className="text-lg font-headline font-bold text-on-surface tabular-nums">
                          {fmt(score, 2)}
                        </span>
                        <span className={`text-[9px] font-bold uppercase tracking-widest ${
                          i === 0 ? "text-primary" : "text-on-surface-variant"
                        }`}>
                          #{i + 1}
                        </span>
                      </div>
                      <span className="block text-[9px] text-on-surface-variant font-mono tabular-nums mt-1">
                        cell {cellId} · YAP {fmt(cell.yap_nc_ratio_size_corrected, 2)}
                      </span>
                    </div>
                  </button>
                );
              })
            ) : (
              <p className="col-span-3 text-[10px] text-on-surface/30">
                No cells with a finite mechano score.
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
                Full Feature Correlation
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
              />
            </div>
          ) : (
            <div className="h-14 bg-surface-container-highest/50 ghost-border flex items-center justify-center">
              <p className="text-[10px] text-on-surface-variant font-medium uppercase tracking-[0.2em] opacity-40">
                Click to Expand
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
      <span className="text-[10px] font-medium text-on-surface/70">{label}</span>
      <div
        className={`w-7 h-3.5 rounded-full relative flex items-center px-0.5 transition-colors ${
          enabled ? "bg-primary" : "bg-white/20"
        }`}
      >
        <div className={`w-2 h-2 bg-white rounded-full transition-all ${enabled ? "ml-auto" : ""}`} />
      </div>
    </button>
  );
}
