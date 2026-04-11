/**
 * Overview — 1:1 React port of stitch/overview/code.html lines 153–327.
 *
 * Layout, Tailwind classes, and node hierarchy mirror the Stitch HTML
 * exactly. Only the dynamic data slots are bound to the real JobResult:
 *   - Hero metrics (cells / mean mechano / confidence)
 *   - Signature heatmap → real PlotlyFigure (replaces CSS-grid mockup)
 *   - Distribution → real PlotlyFigure (replaces hardcoded bars)
 *   - Audit panel → real PlotlyFigure when expanded
 *   - Representative cell click handlers → setSelectedCellId in jobStore
 *
 * Static decorative elements (overlay control toggles, magnification
 * scale, channel chips, lh3.* placeholder cell crops) are kept as
 * Stitch defaults. The shell (top nav, right sidebar) is rendered by
 * App.tsx and is NOT included here.
 */
import { useMemo, useState } from "react";
import { PlotlyFigure } from "@/components/PlotlyFigure";
import { useJobStore } from "@/lib/jobStore";
import { fmt } from "@/lib/utils";
import type { JobResult } from "@/lib/api";

interface OverviewViewProps {
  result: JobResult;
  datasetLabel: string | null;
}

// Cell-crop placeholder URLs from the Stitch HTML, kept verbatim. They
// stay as visual defaults until per-cell PNG crops are streamed from
// the backend (Phase 2 inspection upgrade).
const STITCH_CELL_IMAGES = [
  {
    src: "https://lh3.googleusercontent.com/aida-public/AB6AXuBjJLrYZCSDwCfM28Lct7G60j9xeDIW4EMBGSurGafm80hq9bRqFwkjTtYQdJIoAkzbp_vGYuZk3-Pxkp-zQGTTtUSquUffMQOs2rLoHmmywOWJh5ak2jr77PmdCc6ziXQNMFYlMhy_sLgf5YfIkWfxy3y_f5aq_eK31A0-jTI9v6M4rrUaBCDcQEsW18Cn3mBQu4AQsBpBK6fVWKt6C7Li5eybcw9_6tLPGBDxgz6QIZckd_fwYKSt_V1bHZTeqFQoHn1AnNllgpk",
    state: "Quiescent",
    stateColor: "text-on-surface",
    fallbackId: "ID_0428-A",
    filter: "filter grayscale contrast-125",
  },
  {
    src: "https://lh3.googleusercontent.com/aida-public/AB6AXuBv5b_aof3eTwkCxloERahujtImZEPhsqbkNsJv7mRjJSunyuhp3mzwcciEfHn0mGyG4SR3AlZBoRXxQ8446w9x2OiT8KoxWXOuFwMrP_CBZNSm0HbSNIZqlRF-b-yVSdrFrHcGW0n2hXnaMLBJFy_uRB_kcC6gFxsFKTFx8JwBC5zn3WaGiz24WkyujB8TLtlOrhc9sU1NLNJQnAKIxNPS562uc_Jib1cunKrI9O2zzoxJfUcrTVEzCjEJtjeJdfdwHwVCmTPpxqY",
    state: "High-Flow",
    stateColor: "text-primary",
    fallbackId: "ID_0428-B",
    filter: "filter contrast-150",
  },
  {
    src: "https://lh3.googleusercontent.com/aida-public/AB6AXuAXqCsHPxXLSMsXhwos_bREzC4wNTtxp9KONoucpfh_ybfxgae5-0Zg-5Gn3EgsPapvIhH-7Yk4Nwf91JhYn3PLJDTEBW7Q_of-EGXIsogaxIC7My_L7ClTiIbrb40SIcl9Zj_w-tEeTa375Z1xeB_o6t2t4iHt18R2aapqQYQp4P9mHxj8z0nSseT2b9i6_eIcqXiEyQYLnE_rxOMbk3ypxxQAvo34VkdQdpuP5rGf72Bo0RpcVHJsWoybQvgzeBCxsKMN9BvVBRM",
    state: "Transitional",
    stateColor: "text-on-surface",
    fallbackId: "ID_0428-C",
    filter: "filter brightness-110",
  },
];

export function OverviewView({ result, datasetLabel }: OverviewViewProps) {
  const setSelectedCellId = useJobStore((s) => s.setSelectedCellId);
  const [showAudit, setShowAudit] = useState(false);

  // Pick top-3 representative cell IDs from real per-cell DataFrame so
  // clicking a Stitch placeholder card jumps to the right Single Cell.
  const topCellIds = useMemo(() => {
    try {
      const rows = JSON.parse(result.features_df_json) as Array<
        Record<string, number>
      >;
      const scored = rows.filter(
        (r) =>
          typeof r.mechano_score === "number" && Number.isFinite(r.mechano_score),
      );
      return [...scored]
        .sort((a, b) => (b.mechano_score ?? 0) - (a.mechano_score ?? 0))
        .slice(0, 3)
        .map((r) => Number(r.cell_id));
    } catch {
      return [];
    }
  }, [result.features_df_json]);

  const summary = result.mechano_score_summary;
  const m = result.hero_metrics;

  // Stitch shows "1,248 / 0.62 / 94%". Bind real data:
  const cellCountStr = result.cell_count.toLocaleString();
  const meanMechanoStr = fmt(m.mean_mechano_score, 2);
  const confidencePct =
    summary && summary.mode === "pca"
      ? Math.round(summary.pc1_variance_explained * 100)
      : null;

  const topR = summary?.top_correlation_r;
  const topPair = summary?.top_correlation_pair;

  return (
    <div className="grid grid-cols-12 gap-0 min-h-[calc(100vh-3.5rem)]">
      {/* ============================================================ */}
      {/* Left: Microscopy Canvas (7 Columns)                           */}
      {/* ============================================================ */}
      <section className="col-span-7 relative h-[calc(100vh-3.5rem)] bg-inverse-surface overflow-hidden group">
        {/* Real Plotly segmentation figure fills the canvas */}
        <div className="absolute inset-0">
          <PlotlyFigure
            figureJson={result.segmentation_figure_json}
            height={undefined as unknown as number}
            className="w-full h-full"
          />
        </div>

        {/* Floating Image Controls — top-left stack */}
        <div className="absolute top-6 left-6 flex flex-col gap-2 z-10">
          <div className="bg-surface/80 backdrop-blur-md p-4 ghost-border flex flex-col gap-3 min-w-[200px]">
            <div className="flex items-center justify-between border-b border-outline-variant/10 pb-2">
              <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-tighter">
                Overlay Controls
              </span>
              <span className="material-symbols-outlined text-xs">tune</span>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between cursor-pointer">
                <span className="text-[11px] font-medium text-on-surface">
                  Segmentation
                </span>
                <div className="w-8 h-4 bg-primary rounded-full relative flex items-center px-1">
                  <div className="w-2.5 h-2.5 bg-white rounded-full ml-auto" />
                </div>
              </div>
              <div className="flex items-center justify-between cursor-pointer">
                <span className="text-[11px] font-medium text-on-surface">
                  Glycocalyx Score
                </span>
                <div className="w-8 h-4 bg-surface-container-highest rounded-full relative flex items-center px-1">
                  <div className="w-2.5 h-2.5 bg-white rounded-full" />
                </div>
              </div>
              <div className="flex items-center justify-between cursor-pointer">
                <span className="text-[11px] font-medium text-on-surface">
                  Mechanotransduction
                </span>
                <div className="w-8 h-4 bg-primary rounded-full relative flex items-center px-1">
                  <div className="w-2.5 h-2.5 bg-white rounded-full ml-auto" />
                </div>
              </div>
            </div>
            <div className="mt-2 pt-2 border-t border-outline-variant/10">
              <div className="flex gap-1.5">
                <div
                  className="w-3 h-3"
                  style={{ backgroundColor: "#0000FF" }}
                  title="DAPI"
                />
                <div
                  className="w-3 h-3"
                  style={{ backgroundColor: "#00FF00" }}
                  title="WGA"
                />
                <div
                  className="w-3 h-3"
                  style={{ backgroundColor: "#FF00FF" }}
                  title="YAP"
                />
                <div
                  className="w-3 h-3"
                  style={{ backgroundColor: "#FFBF00" }}
                  title="Actin"
                />
                <div
                  className="w-3 h-3"
                  style={{ backgroundColor: "#FF4500" }}
                  title="Focal Adhesions"
                />
              </div>
            </div>
          </div>

          {/* QC flag chip — only when warnings exist */}
          {result.warnings && result.warnings.length > 0 && (
            <div className="bg-surface/80 backdrop-blur-md px-3 py-1.5 ghost-border flex items-center gap-2 self-start">
              <span
                className="material-symbols-outlined"
                style={{
                  color: "#FF4500",
                  fontVariationSettings: "'FILL' 1",
                  fontSize: "14px",
                }}
              >
                flag
              </span>
              <span className="text-[10px] font-bold text-on-surface tracking-wide uppercase">
                QC Flags: {result.warnings.length} Anomal
                {result.warnings.length === 1 ? "y" : "ies"} Detected
              </span>
            </div>
          )}
        </div>

        {/* Focus Scale Indicator — bottom-left */}
        <div className="absolute bottom-6 left-6 flex items-end gap-1 px-3 py-2 bg-surface/80 backdrop-blur-md ghost-border z-10">
          <div className="w-1 h-8 bg-on-surface/10 rounded-full relative overflow-hidden">
            <div className="absolute bottom-0 left-0 w-full h-[62%] bg-primary" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase text-on-surface-variant leading-none">
              Magnification
            </span>
            <span className="text-sm font-headline font-bold text-on-surface leading-tight">
              20.0x
            </span>
          </div>
        </div>

        {/* Bottom-right dataset chip */}
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
      {/* Right: Analytics Panel (5 Columns)                            */}
      {/* ============================================================ */}
      <section className="col-span-5 bg-surface-container-low p-8 overflow-y-auto h-[calc(100vh-3.5rem)] flex flex-col gap-10">
        {/* Hero Metrics */}
        <div className="grid grid-cols-3 gap-6">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
              Cells Analyzed
            </span>
            <span className="text-3xl font-headline font-medium text-on-surface tabular-nums">
              {cellCountStr}
            </span>
            <div className="w-full h-[1px] bg-outline-variant/20 mt-2" />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
              Mean Mechanotransduction
            </span>
            <span className="text-3xl font-headline font-medium text-on-surface tabular-nums">
              {meanMechanoStr}
            </span>
            <div className="w-full h-[1px] bg-outline-variant/20 mt-2" />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
              Confidence Score
            </span>
            <span className="text-3xl font-headline font-medium text-on-surface tabular-nums">
              {confidencePct != null ? confidencePct : "—"}
              {confidencePct != null && (
                <span className="text-sm ml-0.5">%</span>
              )}
            </span>
            <div className="w-full h-[1px] bg-outline-variant/20 mt-2" />
          </div>
        </div>

        {/* Signature Figure: Heatmap */}
        <div className="flex flex-col gap-4">
          <div className="flex items-end justify-between border-l-2 border-primary pl-4">
            <div>
              <h3 className="text-sm font-headline font-semibold text-on-surface uppercase tracking-tight">
                Glycocalyx ↔ Nuclear YAP Correlation
              </h3>
              <p className="text-[11px] text-on-surface-variant mt-0.5">
                Primary quantitative signature heatmap for mechanosensitive
                state.
              </p>
            </div>
            {topR != null && (
              <span className="text-[11px] font-bold text-primary tabular-nums">
                top |r| = {fmt(topR, 3)}
              </span>
            )}
          </div>
          <div className="bg-surface-container-lowest p-4 ghost-border relative">
            {/* Real Plotly heatmap replaces the Stitch CSS-grid mockup */}
            {result.glyco_mechano_correlation_figure_json && (
              <PlotlyFigure
                figureJson={result.glyco_mechano_correlation_figure_json}
                height={360}
              />
            )}
            <div className="absolute bottom-2 right-4 flex items-center gap-4 pointer-events-none">
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-bold uppercase text-on-surface-variant">
                  Low
                </span>
                <div className="w-20 h-1.5 bg-gradient-to-r from-[#0000FF] to-[#FF4500]" />
                <span className="text-[9px] font-bold uppercase text-on-surface-variant">
                  High
                </span>
              </div>
            </div>
          </div>
          {topPair && (
            <p className="text-[10px] text-on-surface-variant">
              <span className="font-mono">{topPair[0]}</span>
              <span className="mx-1.5 text-on-surface-variant/60">×</span>
              <span className="font-mono">{topPair[1]}</span>
            </p>
          )}
        </div>

        {/* Distribution Plot */}
        <div className="flex flex-col gap-4">
          <h3 className="text-xs font-label font-bold text-on-surface-variant uppercase tracking-widest flex items-center gap-2">
            Mechanotransduction score distribution
            <span className="w-full h-[1px] bg-outline-variant/15 flex-1" />
          </h3>
          <div className="bg-surface-container-lowest ghost-border py-2 px-2">
            {result.mechano_score_distribution_figure_json && (
              <PlotlyFigure
                figureJson={result.mechano_score_distribution_figure_json}
                height={200}
              />
            )}
          </div>
          {summary && (
            <div className="flex items-center gap-3 text-[10px]">
              {summary.mode === "pca" ? (
                <span className="px-1.5 py-0.5 ghost-border bg-surface-container-lowest text-on-surface font-medium uppercase tracking-wider">
                  PCA · PC1 {(summary.pc1_variance_explained * 100).toFixed(0)}
                  % var · {summary.n_cells_used} cells
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

        {/* Cell Strip — Representative cells */}
        <div className="flex flex-col gap-4">
          <h3 className="text-xs font-label font-bold text-on-surface-variant uppercase tracking-widest">
            Representative cell morphological states
          </h3>
          <div className="grid grid-cols-3 gap-3">
            {STITCH_CELL_IMAGES.map((cell, i) => {
              const realId = topCellIds[i];
              const idLabel = realId != null ? `cell_${realId}` : cell.fallbackId;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => realId != null && setSelectedCellId(realId)}
                  className="bg-surface-container-lowest ghost-border overflow-hidden text-left hover:border-primary/30 transition-colors"
                >
                  <img
                    alt={`Cell sample ${i + 1}`}
                    className={`w-full h-24 object-cover ${cell.filter}`}
                    src={cell.src}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                  <div className="p-2 border-t border-outline-variant/10">
                    <span
                      className={`block text-[10px] font-bold ${cell.stateColor} uppercase`}
                    >
                      State: {cell.state}
                    </span>
                    <span className="block text-[9px] text-on-surface-variant font-mono tabular-nums">
                      {idLabel}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Audit Panel (Collapsed) */}
        <div className="mt-auto pt-6 border-t border-outline-variant/15 group">
          <button
            type="button"
            onClick={() => setShowAudit((v) => !v)}
            className="w-full flex items-center justify-between mb-4"
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
