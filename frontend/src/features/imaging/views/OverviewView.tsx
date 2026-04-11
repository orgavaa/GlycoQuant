/**
 * Overview — Stitch hero screen.
 *
 * Layout per stitch/overview/code.html:
 *   - Full-bleed 12-col grid below the fixed top nav (no inner max-width)
 *   - Cols 1-7: dark microscopy canvas (bg-inverse-surface) with
 *               glassmorphic floating overlay controls top-left,
 *               magnification indicator bottom-left, QC flag chip
 *   - Cols 8-12: light analytics rail (bg-surface-container-low p-8)
 *               containing hero metrics → signature heatmap → score
 *               distribution → representative cell strip → collapsed
 *               full-feature audit panel
 *
 * Strict content order matches UI_SCIENCE_GUIDELINES §3 and the
 * Stitch reference screen pixel-for-pixel.
 */
import { useMemo, useState } from "react";
import { PlotlyFigure } from "@/components/PlotlyFigure";
import { useJobStore } from "@/lib/jobStore";
import { fmt } from "@/lib/utils";
import type { JobResult } from "@/lib/api";
import { HeroMetrics } from "../HeroMetrics";

interface OverviewViewProps {
  result: JobResult;
  datasetLabel: string | null;
}

export function OverviewView({ result, datasetLabel }: OverviewViewProps) {
  const setSelectedCellId = useJobStore((s) => s.setSelectedCellId);
  const [showAudit, setShowAudit] = useState(false);

  // Top-3 representative cells by mechano_score (descending).
  const representativeCells = useMemo(() => {
    try {
      const rows = JSON.parse(result.features_df_json) as Array<
        Record<string, number>
      >;
      const scored = rows.filter(
        (r) =>
          typeof r.mechano_score === "number" && Number.isFinite(r.mechano_score),
      );
      const sorted =
        scored.length > 0
          ? [...scored].sort(
              (a, b) => (b.mechano_score ?? 0) - (a.mechano_score ?? 0),
            )
          : rows.slice(0, 3);
      return sorted.slice(0, 3);
    } catch {
      return [];
    }
  }, [result.features_df_json]);

  const summary = result.mechano_score_summary;
  const topR = summary?.top_correlation_r;

  return (
    <div className="grid grid-cols-12 gap-0 min-h-[calc(100vh-3.5rem)]">
      {/* ============================================================ */}
      {/* Cols 1-7: Microscopy canvas (dark, full-bleed)                */}
      {/* ============================================================ */}
      <section className="col-span-7 relative bg-inverse-surface overflow-hidden">
        <div className="absolute inset-0">
          <PlotlyFigure
            figureJson={result.segmentation_figure_json}
            height={"100%" as unknown as number}
            downloadName="glycoquant_segmented"
          />
        </div>

        {/* Floating overlay controls — glassmorphic, top-left */}
        <div className="absolute top-6 left-6 z-10 flex flex-col gap-2 pointer-events-auto">
          <div className="bg-surface/80 backdrop-blur-md p-4 ghost-border flex flex-col gap-3 min-w-[220px]">
            <div className="flex items-center justify-between ghost-border-b pb-2">
              <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
                Overlay Controls
              </span>
              <span className="material-symbols-outlined text-xs">tune</span>
            </div>
            <div className="flex flex-col gap-2">
              <OverlayToggle label="Segmentation" enabled />
              <OverlayToggle label="Glycocalyx Score" enabled={false} />
              <OverlayToggle label="Mechanotransduction" enabled />
            </div>
            <div className="mt-2 pt-2 ghost-border-t">
              <div className="flex gap-1.5">
                <ChannelChip color="#0000FF" title="DAPI" />
                <ChannelChip color="#00FF00" title="WGA" />
                <ChannelChip color="#FF00FF" title="YAP" />
                <ChannelChip color="#FFBF00" title="Actin" />
                <ChannelChip color="#FF4500" title="Focal Adhesions" />
              </div>
            </div>
          </div>

          {/* QC flag chip */}
          {result.warnings && result.warnings.length > 0 && (
            <div className="bg-surface/80 backdrop-blur-md px-3 py-1.5 ghost-border flex items-center gap-2 self-start">
              <span
                className="material-symbols-outlined text-channel-fa"
                style={{
                  fontVariationSettings: "'FILL' 1",
                  fontSize: "14px",
                }}
              >
                flag
              </span>
              <span className="text-[10px] font-bold text-on-surface tracking-wide uppercase">
                QC Flags: {result.warnings.length} notice
                {result.warnings.length === 1 ? "" : "s"}
              </span>
            </div>
          )}
        </div>

        {/* Bottom-left dataset / cell-count indicator */}
        <div className="absolute bottom-6 left-6 z-10 flex items-end gap-3 px-3 py-2 bg-surface/80 backdrop-blur-md ghost-border">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase text-on-surface-variant tracking-widest leading-none">
              {datasetLabel ?? "Uploaded Image"}
            </span>
            <span className="text-sm font-headline font-bold text-on-surface leading-tight tabular-nums">
              {result.cell_count} cells
            </span>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* Cols 8-12: Analytics rail                                     */}
      {/* ============================================================ */}
      <section className="col-span-5 bg-surface-container-low p-8 overflow-y-auto h-[calc(100vh-3.5rem)] flex flex-col gap-10">
        {/* (1) Hero metrics — 3 columns, hairline dividers */}
        <HeroMetrics result={result} />

        {/* (2) Signature heatmap — Tier 1 with primary border accent */}
        {result.glyco_mechano_correlation_figure_json && (
          <div className="flex flex-col gap-4">
            <div className="flex items-end justify-between border-l-2 border-primary pl-4">
              <div>
                <h3 className="text-sm font-headline font-semibold text-on-surface uppercase tracking-tight">
                  Glycocalyx ↔ Mechanotransduction
                </h3>
                <p className="text-[11px] text-on-surface-variant mt-0.5">
                  Single-cell Spearman cross-block correlation. Asterisks
                  mark Bonferroni-significant pairs (p &lt; 0.05).
                </p>
              </div>
              {topR != null && (
                <span className="text-[11px] font-bold text-primary tabular-nums whitespace-nowrap">
                  top |r| = {fmt(topR, 2)}
                </span>
              )}
            </div>
            <div className="bg-surface-container-lowest p-4 ghost-border">
              <PlotlyFigure
                figureJson={result.glyco_mechano_correlation_figure_json}
                height={420}
                downloadName="glycoquant_glyco_mechano_correlation"
              />
            </div>
            {summary?.top_correlation_pair && (
              <p className="text-[10px] text-on-surface-variant">
                <span className="font-mono">{summary.top_correlation_pair[0]}</span>
                <span className="mx-1.5 text-on-surface-variant/60">×</span>
                <span className="font-mono">{summary.top_correlation_pair[1]}</span>
              </p>
            )}
          </div>
        )}

        {/* (3) Mechano score distribution — Tier 1 */}
        {result.mechano_score_distribution_figure_json && (
          <div className="flex flex-col gap-4">
            <h3 className="text-xs font-label font-bold text-on-surface-variant uppercase tracking-widest flex items-center gap-2">
              <span>Mechanotransduction Score Distribution</span>
              <span className="flex-1 h-[1px] bg-outline-variant/15" />
            </h3>
            <div className="bg-surface-container-lowest ghost-border p-2">
              <PlotlyFigure
                figureJson={result.mechano_score_distribution_figure_json}
                height={220}
                downloadName="glycoquant_mechano_score_distribution"
              />
            </div>
            {summary && (
              <div className="flex items-center gap-3 text-[10px]">
                {summary.mode === "pca" ? (
                  <span className="px-1.5 py-0.5 ghost-border bg-surface-container-lowest text-on-surface font-medium uppercase tracking-wider">
                    PCA · PC1{" "}
                    {(summary.pc1_variance_explained * 100).toFixed(0)}% var ·{" "}
                    {summary.n_cells_used} cells
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 border border-amber-500/40 bg-amber-500/10 text-amber-700 font-bold uppercase tracking-wider">
                    Weighted-sum fallback · {summary.n_cells_used} cells
                  </span>
                )}
                <span className="text-on-surface-variant tabular-nums">
                  μ {fmt(summary.mean, 2)} · σ {fmt(summary.std, 2)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* (4) Representative cells — Tier 2 */}
        <div className="flex flex-col gap-4">
          <h3 className="text-xs font-label font-bold text-on-surface-variant uppercase tracking-widest">
            Representative Cell Morphological States
          </h3>
          <div className="grid grid-cols-3 gap-3">
            {representativeCells.length > 0 ? (
              representativeCells.map((cell, i) => (
                <button
                  key={cell.cell_id}
                  type="button"
                  onClick={() => setSelectedCellId(Number(cell.cell_id))}
                  className="bg-surface-container-lowest ghost-border overflow-hidden text-left hover:border-primary/30 transition-colors group"
                >
                  <div className="aspect-square bg-inverse-surface flex items-center justify-center text-on-surface-variant/30 text-[10px] uppercase tracking-widest">
                    cell&nbsp;crop
                  </div>
                  <div className="p-2 ghost-border-t">
                    <span className="block text-[10px] font-bold text-on-surface uppercase">
                      {i === 0
                        ? "State: High-Activation"
                        : i === 1
                          ? "State: Mid-Activation"
                          : "State: Lower-Activation"}
                    </span>
                    <span className="block text-[9px] text-on-surface-variant font-mono tabular-nums">
                      cell {cell.cell_id} · score {fmt(cell.mechano_score, 2)}
                    </span>
                  </div>
                </button>
              ))
            ) : (
              <p className="col-span-3 text-xs text-on-surface-variant">
                No cells with a finite mechano score in this run.
              </p>
            )}
          </div>
        </div>

        {/* (5) Full-feature correlation audit — collapsed by default */}
        <div className="mt-auto pt-6 ghost-border-t">
          <button
            type="button"
            onClick={() => setShowAudit((v) => !v)}
            className="w-full flex items-center justify-between mb-4 group"
          >
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-on-surface-variant">
                analytics
              </span>
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
                downloadName="glycoquant_correlation"
              />
            </div>
          ) : (
            <div className="h-16 bg-surface-container-highest/40 ghost-border flex items-center justify-center">
              <p className="text-[10px] text-on-surface-variant font-medium uppercase tracking-[0.2em] opacity-50">
                Matrix Render Inhibited · Click to Expand
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------
// Tiny presentational helpers — no need for separate files
// ---------------------------------------------------------------------

function OverlayToggle({
  label,
  enabled,
}: {
  label: string;
  enabled: boolean;
}) {
  return (
    <div className="flex items-center justify-between cursor-pointer">
      <span className="text-[11px] font-medium text-on-surface">{label}</span>
      <div
        className={`w-8 h-4 rounded-full relative flex items-center px-1 ${
          enabled ? "bg-primary" : "bg-surface-container-highest"
        }`}
      >
        <div
          className={`w-2.5 h-2.5 bg-white rounded-full ${
            enabled ? "ml-auto" : ""
          }`}
        />
      </div>
    </div>
  );
}

function ChannelChip({ color, title }: { color: string; title: string }) {
  return <div className="w-3 h-3" style={{ backgroundColor: color }} title={title} />;
}
