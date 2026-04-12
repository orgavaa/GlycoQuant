import { useState, useEffect, useRef, useMemo } from "react";
import Plotly from "plotly.js-dist-min";
import { HeroMetrics } from "./HeroMetrics";
import { PlotlyCard } from "./PlotlyCard";
import { TopCells } from "./TopCells";
import { Card } from "./Card";
import { useJobStore } from "@/lib/jobStore";
import type { JobResult } from "@/lib/api";
import type { CellFeatures } from "@/lib/canvas/extract";
import { fmt, fmtSigned } from "@/lib/utils";

interface Props {
  result: JobResult;
  cells: CellFeatures[];
}

export function OverviewContent({ result, cells }: Props) {
  const setSelectedCellId = useJobStore(s => s.setSelectedCellId);
  const summary = result.mechano_score_summary;
  const m = result.hero_metrics;

  const topCells = useMemo(() => {
    const scored = cells.filter(c => typeof c.mechano_score === "number" && Number.isFinite(c.mechano_score));
    return [...scored]
      .sort((a, b) => Math.abs(b.mechano_score as number) - Math.abs(a.mechano_score as number))
      .slice(0, 5);
  }, [cells]);

  // Compute the third hero metric: prefer top_glyco_mechano_r from hero_metrics,
  // fall back to mechano_score_summary
  const glycoMechR = m.top_glyco_mechano_r ?? summary?.top_correlation_r ?? null;

  return (
    <div className="flex flex-col gap-4">
      {/* Hero metrics */}
      <Card>
        <HeroMetrics metrics={[
          { value: String(result.cell_count), label: "Cells" },
          { value: fmtSigned(m.mean_mechano_score), label: "Mechano" },
          { value: glycoMechR != null ? fmt(glycoMechR) : "\u2014", label: "Top |r|" },
        ]} />
      </Card>

      {/* Glyco-Mechano correlation heatmap */}
      {result.glyco_mechano_correlation_figure_json && (
        <PlotlyCard
          title="Glycocalyx \u2194 Mechanotransduction"
          subtitle={summary?.top_correlation_pair
            ? `top |r| = ${fmt(summary.top_correlation_r)} \u2014 ${summary.top_correlation_pair[0]} \u00d7 ${summary.top_correlation_pair[1]}`
            : undefined}
          figureJson={result.glyco_mechano_correlation_figure_json}
          maxHeight={260}
        />
      )}

      {/* Score distribution histogram */}
      {result.mechano_score_distribution_figure_json && (
        <PlotlyCard
          title="Score distribution"
          figureJson={result.mechano_score_distribution_figure_json}
          maxHeight={160}
        />
      )}

      {/* Top deviating cells */}
      {topCells.length > 0 && (
        <Card>
          <div className="text-[10px] font-semibold text-gray-400 tracking-[1.5px] uppercase mb-2">
            Top deviating cells
          </div>
          <TopCells cells={topCells} onClick={id => setSelectedCellId(id)} />
        </Card>
      )}

      {/* Collapsed correlation audit */}
      <CorrelationAudit figureJson={result.correlation_figure_json} />
    </div>
  );
}

function CorrelationAudit({ figureJson }: { figureJson: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <div onClick={() => setOpen(v => !v)} className="flex items-center justify-between cursor-pointer">
        <span className="text-[10px] font-semibold text-gray-400 tracking-[1.5px] uppercase">Full correlation audit</span>
        <span className="text-[12px] text-gray-300">{open ? "\u25BE" : "\u25B8"}</span>
      </div>
      {open && (
        <div className="mt-3">
          <PlotlyRailInline figureJson={figureJson} maxHeight={360} />
        </div>
      )}
    </Card>
  );
}

function PlotlyRailInline({ figureJson, maxHeight }: { figureJson: string; maxHeight: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    let parsed: { data: unknown[]; layout: Record<string, unknown> };
    try { parsed = JSON.parse(figureJson); } catch { return; }

    const backendXaxis = (parsed.layout?.xaxis ?? {}) as Record<string, unknown>;
    const backendYaxis = (parsed.layout?.yaxis ?? {}) as Record<string, unknown>;

    const layout = {
      ...parsed.layout,
      height: maxHeight,
      autosize: true,
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "#fff",
      font: { family: "Inter, sans-serif", color: "#9ca3af", size: 9 },
      margin: { l: 40, r: 8, t: 4, b: 32, pad: 0 },
      xaxis: { ...backendXaxis, gridcolor: "#f3f4f6", tickfont: { size: 8, family: "Inter" } },
      yaxis: { ...backendYaxis, gridcolor: "#f3f4f6", tickfont: { size: 8, family: "Inter" } },
    };

    // Style heatmap colorbars
    const data = (parsed.data as Record<string, unknown>[]).map(trace => {
      if (trace.type === "heatmap" && trace.colorbar) {
        return {
          ...trace,
          colorbar: {
            ...(trace.colorbar as Record<string, unknown>),
            thickness: 10,
            len: 0.8,
            tickfont: { size: 8, color: "#9ca3af" },
            outlinewidth: 0,
          },
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
