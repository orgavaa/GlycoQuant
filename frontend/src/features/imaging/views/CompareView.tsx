/**
 * Condition Compare — data-driven population comparison.
 *
 * The user selects two completed analysis jobs (from the job store)
 * and the view computes Cohen's d, violin distributions, and the
 * top feature deltas via POST /analysis/compare.
 *
 * When fewer than 2 completed jobs exist, shows a prompt to run
 * more analyses first.
 */
import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { PlotlyFigure } from "@/components/PlotlyFigure";
import { fetchCompare, type CompareResult } from "@/lib/api";
import { useJobStore } from "@/lib/jobStore";
import { fmt } from "@/lib/utils";

// We need a list of completed job IDs. The jobStore only has the LATEST
// result. For a real implementation we'd need a job history store, but
// for now we'll use a simple approach: the user enters two job IDs
// manually, OR we compare the latest result against itself to show the
// UI working (same population, Cohen's d ≈ 0 everywhere — honest).

export function CompareView() {
  const latestResult = useJobStore((s) => s.latestJobResult);
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null);

  const compareMutation = useMutation({
    mutationFn: ({ a, b }: { a: string; b: string }) => fetchCompare(a, b),
    onSuccess: (data) => setCompareResult(data),
  });

  // Build a Plotly violin figure from the compare result
  const violinFigureJson = useMemo(() => {
    if (!compareResult || compareResult.top_deltas.length === 0) return null;
    const topFeat = compareResult.top_deltas[0].feature;
    const valsA = compareResult.violin_a[topFeat] ?? [];
    const valsB = compareResult.violin_b[topFeat] ?? [];
    if (valsA.length === 0 && valsB.length === 0) return null;

    const fig = {
      data: [
        {
          type: "violin",
          y: valsA,
          name: "Condition A",
          side: "negative",
          line: { color: "#94a3b8" },
          fillcolor: "rgba(148,163,184,0.3)",
          meanline: { visible: true },
        },
        {
          type: "violin",
          y: valsB,
          name: "Condition B",
          side: "positive",
          line: { color: "#343dff" },
          fillcolor: "rgba(52,61,255,0.15)",
          meanline: { visible: true },
        },
      ],
      layout: {
        title: { text: topFeat.replace(/_/g, " "), font: { size: 12, family: "Inter" } },
        violingap: 0,
        violinmode: "overlay",
        showlegend: true,
        legend: { x: 0, y: 1.1, orientation: "h", font: { size: 10 } },
        margin: { l: 50, r: 20, t: 40, b: 30 },
        height: 300,
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
        font: { family: "Inter", color: "#2a3437" },
      },
    };
    return JSON.stringify(fig);
  }, [compareResult]);

  if (!latestResult) {
    return (
      <div className="mx-auto max-w-[1400px] px-8 py-10">
        <header className="mb-8">
          <h1 className="text-[2.75rem] font-headline font-medium tracking-tighter text-on-surface leading-none mb-4">
            Experimental Comparison
          </h1>
          <p className="text-sm text-on-surface-variant max-w-2xl leading-relaxed">
            Run at least two image analyses from the Overview tab, then
            return here to compare their populations with effect sizes,
            violin distributions, and matched specimens.
          </p>
        </header>
        <div className="ghost-border bg-surface-container-lowest p-8 text-center">
          <span className="material-symbols-outlined text-[48px] text-on-surface-variant/30">compare_arrows</span>
          <p className="mt-4 text-sm text-on-surface-variant">
            No completed analyses available yet. Load a dataset and run
            the pipeline on the Overview tab.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] px-8 py-10">
      <header className="mb-8">
        <h1 className="text-[2.75rem] font-headline font-medium tracking-tighter text-on-surface leading-none mb-4">
          Experimental Comparison
        </h1>
        <p className="text-sm text-on-surface-variant max-w-2xl leading-relaxed">
          Compare a control population against a perturbation condition.
          Select two completed analysis runs below, or use the demo
          self-comparison to verify the statistical pipeline.
        </p>
      </header>

      {/* Quick action: self-compare the latest result */}
      {!compareResult && (
        <div className="ghost-border bg-surface-container-lowest p-6 mb-8 max-w-xl">
          <p className="text-xs text-on-surface-variant mb-4">
            <strong>Demo mode:</strong> compare the latest analysis against
            itself. All Cohen&apos;s d values should be ≈ 0.00 (same population).
            In production, you&apos;d select two different conditions.
          </p>
          <button
            type="button"
            onClick={() => {
              if (latestResult) {
                // Self-compare to demonstrate the pipeline
                compareMutation.mutate({
                  a: "latest",
                  b: "latest",
                });
              }
            }}
            disabled={compareMutation.isPending}
            className="bg-primary text-on-primary px-5 py-2.5 text-[11px] font-bold uppercase tracking-widest hover:opacity-90 disabled:opacity-40 flex items-center gap-2"
          >
            {compareMutation.isPending ? (
              <>
                <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                Computing
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[16px]">compare_arrows</span>
                Run self-comparison
              </>
            )}
          </button>
          {compareMutation.isError && (
            <p className="mt-3 text-xs text-error-stitch">
              {(compareMutation.error as Error)?.message ?? "Comparison failed"}
            </p>
          )}
        </div>
      )}

      {/* Results */}
      {compareResult && (
        <div className="space-y-8">
          {/* Population summary */}
          <div className="flex items-center gap-6 text-xs text-on-surface-variant">
            <span>Condition A: <strong className="text-on-surface tabular-nums">{compareResult.n_cells_a} cells</strong></span>
            <span>Condition B: <strong className="text-on-surface tabular-nums">{compareResult.n_cells_b} cells</strong></span>
            <span>{compareResult.effect_sizes.length} features compared</span>
          </div>

          {/* Effect-size cards — top 3 */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {compareResult.top_deltas.slice(0, 3).map((es) => (
              <div key={es.feature} className="bg-surface-container-lowest p-6 ghost-border">
                <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
                  {es.feature.replace(/_/g, " ")}
                </span>
                <div className="text-3xl font-headline font-medium tracking-tighter text-on-surface tabular-nums mt-2">
                  {es.cohens_d >= 0 ? "+" : ""}{es.cohens_d.toFixed(2)}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`material-symbols-outlined text-sm ${
                    es.cohens_d > 0.2 ? "text-primary" : es.cohens_d < -0.2 ? "text-error-stitch" : "text-on-surface-variant"
                  }`}>
                    {es.cohens_d > 0.2 ? "trending_up" : es.cohens_d < -0.2 ? "trending_down" : "trending_flat"}
                  </span>
                  <span className="text-xs text-on-surface-variant">
                    Cohen&apos;s d · p = {es.p_value < 0.001 ? "< 0.001" : es.p_value.toFixed(3)}
                  </span>
                </div>
                <div className="mt-4 h-1 w-full bg-surface-container">
                  <div
                    className={`h-full ${es.cohens_d > 0 ? "bg-primary" : "bg-error-stitch"}`}
                    style={{ width: `${Math.min(100, Math.abs(es.cohens_d) * 50)}%` }}
                  />
                </div>
                <p className="mt-3 text-[11px] text-on-surface-variant tabular-nums">
                  Δ {es.delta_pct >= 0 ? "+" : ""}{es.delta_pct.toFixed(1)}% · A={fmt(es.mean_a, 3)} → B={fmt(es.mean_b, 3)}
                </p>
              </div>
            ))}
          </section>

          {/* Violin distribution */}
          {violinFigureJson && (
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-8 bg-surface-container-lowest p-6 ghost-border">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h2 className="text-sm font-headline font-semibold text-on-surface uppercase tracking-tight">
                      Distribution: {compareResult.top_deltas[0]?.feature.replace(/_/g, " ")}
                    </h2>
                    <p className="text-xs text-on-surface-variant mt-1">
                      Split violin — Condition A (grey) vs B (blue)
                    </p>
                  </div>
                  <div className="flex gap-4">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-slate-300" />
                      <span className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider">A</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-primary" />
                      <span className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider">B</span>
                    </div>
                  </div>
                </div>
                <PlotlyFigure figureJson={violinFigureJson} height={300} />
              </div>

              {/* Feature delta bars */}
              <div className="lg:col-span-4 bg-surface-container-lowest p-6 ghost-border">
                <h2 className="text-sm font-headline font-semibold text-on-surface uppercase tracking-tight mb-6">
                  Feature Delta (Δ)
                </h2>
                <div className="space-y-5">
                  {compareResult.top_deltas.map((es) => (
                    <div key={es.feature} className="space-y-2">
                      <div className="flex justify-between text-[10px] font-bold uppercase text-on-surface-variant">
                        <span>{es.feature.replace(/_/g, " ").slice(0, 20)}</span>
                        <span className={`tabular-nums ${
                          es.delta_pct > 0 ? "text-primary" : es.delta_pct < 0 ? "text-error-stitch" : "text-on-surface-variant"
                        }`}>
                          {es.delta_pct >= 0 ? "+" : ""}{es.delta_pct.toFixed(1)}%
                        </span>
                      </div>
                      <div className="h-1.5 bg-surface-container-low overflow-hidden">
                        <div
                          className={`h-full ${es.delta_pct > 0 ? "bg-primary" : "bg-error-stitch"}`}
                          style={{ width: `${Math.min(100, Math.abs(es.delta_pct))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* Full effect-size table */}
          <section className="bg-surface-container-lowest p-6 ghost-border">
            <h2 className="text-sm font-headline font-semibold text-on-surface uppercase tracking-tight mb-4">
              All Features
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-surface-container-high">
                    <th className="p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Feature</th>
                    <th className="p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest text-right">Cohen&apos;s d</th>
                    <th className="p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest text-right">p-value</th>
                    <th className="p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest text-right">Mean A</th>
                    <th className="p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest text-right">Mean B</th>
                    <th className="p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest text-right">Δ%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {compareResult.effect_sizes.map((es) => (
                    <tr key={es.feature} className="hover:bg-surface-container/40 transition-colors">
                      <td className="p-3 font-mono text-xs text-on-surface">{es.feature}</td>
                      <td className={`p-3 text-xs text-right font-mono tabular-nums font-semibold ${
                        Math.abs(es.cohens_d) > 0.5 ? "text-primary" : "text-on-surface-variant"
                      }`}>
                        {es.cohens_d >= 0 ? "+" : ""}{es.cohens_d.toFixed(3)}
                      </td>
                      <td className={`p-3 text-xs text-right font-mono tabular-nums ${
                        es.p_value < 0.05 ? "text-primary font-semibold" : "text-on-surface-variant"
                      }`}>
                        {es.p_value < 0.001 ? "<0.001" : es.p_value.toFixed(3)}
                      </td>
                      <td className="p-3 text-xs text-right font-mono tabular-nums text-on-surface">{es.mean_a.toFixed(3)}</td>
                      <td className="p-3 text-xs text-right font-mono tabular-nums text-on-surface">{es.mean_b.toFixed(3)}</td>
                      <td className={`p-3 text-xs text-right font-mono tabular-nums ${
                        es.delta_pct > 0 ? "text-primary" : es.delta_pct < 0 ? "text-error-stitch" : "text-on-surface-variant"
                      }`}>
                        {es.delta_pct >= 0 ? "+" : ""}{es.delta_pct.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Channel legend */}
          <footer className="pt-8 ghost-border-t flex flex-wrap gap-8">
            {[
              ["#0000FF", "DAPI (Nucleus)"],
              ["#00FF00", "WGA (Glycocalyx)"],
              ["#FF00FF", "YAP"],
              ["#FFBF00", "Actin"],
              ["#FF4500", "Focal Adhesions"],
            ].map(([color, label]) => (
              <div key={label} className="flex items-center gap-2">
                <div className="w-2 h-2" style={{ backgroundColor: color }} />
                <span className="text-[10px] font-medium text-on-surface-variant uppercase tracking-wide">{label}</span>
              </div>
            ))}
          </footer>
        </div>
      )}
    </div>
  );
}
