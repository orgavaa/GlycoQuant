/**
 * Overview — the hero screen for Tab 1.
 *
 * Implements the strict 12-column grid and content order from
 * UI_SCIENCE_GUIDELINES §3:
 *
 *   1. Hero metrics (3 numbers)
 *   2. Microscopy canvas (cols 1–7 desktop)
 *   3. Glyco↔mechano correlation heatmap (cols 8–12, top)
 *   4. Mechano score distribution (cols 8–12, below heatmap)
 *   5. Representative cells (full width, secondary)
 *   6. All-feature correlation in a collapsed panel
 *
 * The single sentence this screen exists to answer:
 *   "From the same image, we quantify glycocalyx state,
 *    mechanotransduction state, and their coupling."
 */
import { ChevronDown, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { PlotlyFigure } from "@/components/PlotlyFigure";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  const [showAllCorr, setShowAllCorr] = useState(false);

  // Top 3 representative cells by mechano score (highest activation).
  // Falls back to the first three rows if mechano_score is missing.
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

  return (
    <div className="space-y-6">
      {/* (1) Hero metrics — three numbers, no more */}
      <HeroMetrics result={result} />

      {/* (2 + 3 + 4) 12-column grid: image left, evidence right */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* (2) Microscopy canvas — Tier 1 card, dominant left pane */}
        <Card className="lg:col-span-7">
          <CardHeader className="flex flex-row items-baseline justify-between pb-3">
            <div>
              <CardTitle className="text-[0.95rem]">Microscopy canvas</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Cell outlines overlaid on the cytoplasmic channel. Click a cell
                to inspect it on the Single Cell tab.
              </p>
            </div>
            <span className="text-[0.72rem] text-muted-foreground">
              {result.cell_count} cells · {datasetLabel ?? "uploaded image"}
            </span>
          </CardHeader>
          <CardContent>
            <PlotlyFigure
              figureJson={result.segmentation_figure_json}
              height={520}
              downloadName="glycoquant_segmented"
            />
            <p className="mt-2 text-[0.7rem] leading-snug text-muted-foreground">
              Quick-pick a cell:&nbsp;
              {representativeCells.slice(0, 3).map((cell, i) => (
                <button
                  key={cell.cell_id}
                  type="button"
                  onClick={() => setSelectedCellId(Number(cell.cell_id))}
                  className="mx-1 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[0.68rem] text-foreground hover:bg-foreground/5"
                >
                  #{cell.cell_id} ({i === 0 ? "top" : i === 1 ? "2nd" : "3rd"})
                </button>
              ))}
            </p>
          </CardContent>
        </Card>

        {/* Right rail: heatmap + score distribution stacked */}
        <div className="space-y-6 lg:col-span-5">
          {/* (3) Glyco↔mechano correlation heatmap — Tier 1 */}
          {result.glyco_mechano_correlation_figure_json && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-[0.95rem]">
                  Glycocalyx ↔ mechanotransduction
                </CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Single-cell Spearman correlation. Asterisks mark
                  Bonferroni-significant pairs (p &lt; 0.05).
                </p>
              </CardHeader>
              <CardContent>
                <PlotlyFigure
                  figureJson={result.glyco_mechano_correlation_figure_json}
                  height={420}
                  downloadName="glycoquant_glyco_mechano_correlation"
                />
                {summary?.top_correlation_pair && (
                  <p className="mt-2 text-[0.7rem] leading-snug text-muted-foreground">
                    Top: <span className="font-mono">{summary.top_correlation_pair[0]}</span>
                    <span className="mx-1">×</span>
                    <span className="font-mono">{summary.top_correlation_pair[1]}</span>
                    <span className="ml-2 text-foreground">
                      r = {fmt(summary.top_correlation_r, 2)}
                    </span>
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* (4) Mechano score distribution — Tier 1 */}
          {result.mechano_score_distribution_figure_json && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-[0.95rem]">
                  Mechano score distribution
                </CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Per-cell PC1 over the curated mechano-feature panel.
                </p>
              </CardHeader>
              <CardContent>
                <PlotlyFigure
                  figureJson={result.mechano_score_distribution_figure_json}
                  height={260}
                  downloadName="glycoquant_mechano_score_distribution"
                />
                {summary && (
                  <div className="mt-2 flex items-center gap-2 text-[0.7rem] leading-snug">
                    {summary.mode === "pca" ? (
                      <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-foreground">
                        PCA · PC1 explains{" "}
                        {(summary.pc1_variance_explained * 100).toFixed(0)}% over{" "}
                        {summary.n_cells_used} cells
                      </span>
                    ) : (
                      <span className="rounded border border-amber-500/50 bg-amber-500/10 px-1.5 py-0.5 text-amber-700 dark:text-amber-300">
                        Weighted-sum fallback · only {summary.n_cells_used} cells
                      </span>
                    )}
                    <span className="text-muted-foreground">
                      μ = {fmt(summary.mean, 2)} · σ = {fmt(summary.std, 2)}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* (5) Representative cells strip — Tier 2 secondary plots */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-[0.95rem]">
            Representative cells (top 3 by mechano score)
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Anchor exemplars for the activation distribution above. Click any
            chip to inspect.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {representativeCells.map((cell, i) => (
              <button
                key={cell.cell_id}
                type="button"
                onClick={() => setSelectedCellId(Number(cell.cell_id))}
                className="group flex flex-col items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-left hover:border-foreground/30 hover:bg-muted/70"
              >
                <span className="text-[0.7rem] uppercase tracking-wide text-muted-foreground">
                  #{i + 1} · cell {cell.cell_id}
                </span>
                <span className="font-mono text-[1.1rem] font-semibold text-foreground">
                  {fmt(cell.mechano_score, 2)}
                </span>
                <span className="text-[0.72rem] text-muted-foreground">
                  YAP corr {fmt(cell.yap_nc_ratio_size_corrected, 2)} · FA mature{" "}
                  {fmt(cell.fa_mature_fraction, 2)}
                </span>
              </button>
            ))}
            {representativeCells.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No cells with a finite mechano score to display.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* (6) All-feature correlation — Tier 3, collapsed by default */}
      <Card>
        <button
          type="button"
          onClick={() => setShowAllCorr((v) => !v)}
          className="flex w-full items-center justify-between gap-3 px-6 py-4 text-left"
        >
          <div>
            <h3 className="text-[0.95rem] font-semibold text-foreground">
              All-feature correlation matrix
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Full square Pearson correlation across every feature column. Hidden
              by default — drill in if you need to audit dependencies.
            </p>
          </div>
          {showAllCorr ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
        {showAllCorr && (
          <CardContent>
            <PlotlyFigure
              figureJson={result.correlation_figure_json}
              height={500}
              downloadName="glycoquant_correlation"
            />
          </CardContent>
        )}
      </Card>
    </div>
  );
}
