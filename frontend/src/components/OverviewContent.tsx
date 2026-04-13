import { useState, useEffect, useRef, useMemo } from "react";
import Plotly from "plotly.js-dist-min";
import { HeroMetrics } from "./HeroMetrics";
import { PlotlyCard } from "./PlotlyCard";
import { TopCells } from "./TopCells";
import { Card } from "./Card";
import { MLFeaturesPanel } from "./MLFeaturesPanel";
import { useJobStore } from "@/lib/jobStore";
import type { JobResult } from "@/lib/api";
import type { CellFeatures } from "@/lib/canvas/extract";
import { fmt, fmtSigned } from "@/lib/utils";

interface Props {
  result: JobResult;
  cells: CellFeatures[];
}

type ViewTab = "overview" | "ml";

export function OverviewContent({ result, cells }: Props) {
  const [activeTab, setActiveTab] = useState<ViewTab>("overview");

  return (
    <div className="flex flex-col gap-4">
      {/* Tab strip */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
        <button
          onClick={() => setActiveTab("overview")}
          className={`flex-1 py-2 px-3 rounded-md text-[12px] font-medium transition-colors ${
            activeTab === "overview" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab("ml")}
          className={`flex-1 py-2 px-3 rounded-md text-[12px] font-medium transition-colors ${
            activeTab === "ml" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          ML Analysis
        </button>
      </div>

      {activeTab === "overview"
        ? <OverviewTab result={result} cells={cells} />
        : <MLFeaturesPanel result={result} />
      }
    </div>
  );
}

function OverviewTab({ result, cells }: Props) {
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
      {/* Substitute channel warning */}
      {subs.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <div className="text-[12px] font-medium text-amber-800 mb-1">Channel substitutions active</div>
          <div className="text-[11px] text-amber-700 leading-relaxed">
            Features for {subs.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(", ")} were
            not computed — those channels contained synthetic or substitute stains.
            Values shown as — are placeholders. Assign real channels in the analysis panel to enable these features.
          </div>
        </div>
      )}

      <Card>
        <HeroMetrics metrics={[
          { value: String(result.cell_count), label: "Cells" },
          { value: fmtSigned(m.mean_mechano_score), label: "Mechano" },
          { value: glycoMechR != null ? fmt(glycoMechR) : "\u2014", label: "Top |r|" },
        ]} />
      </Card>

      {result.glyco_mechano_correlation_figure_json && (
        <PlotlyCard
          title={"Glycocalyx \u2194 Mechanotransduction"}
          subtitle={summary?.top_correlation_pair
            ? `top |r| = ${fmt(summary.top_correlation_r)} \u2014 ${summary.top_correlation_pair[0]} \u00d7 ${summary.top_correlation_pair[1]}`
            : undefined}
          figureJson={result.glyco_mechano_correlation_figure_json}
          maxHeight={360}
        />
      )}

      {result.mechano_score_distribution_figure_json && (
        <PlotlyCard
          title="Score distribution"
          figureJson={result.mechano_score_distribution_figure_json}
          maxHeight={220}
        />
      )}

      {topCells.length > 0 && (
        <Card>
          <div className="text-[11px] font-semibold text-gray-400 tracking-[1px] uppercase mb-3">
            Top deviating cells
          </div>
          <TopCells cells={topCells} onClick={id => setSelectedCellId(id)} />
        </Card>
      )}

      <CorrelationAudit figureJson={result.correlation_figure_json} />
    </div>
  );
}

function CorrelationAudit({ figureJson }: { figureJson: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <div onClick={() => setOpen(v => !v)} className="flex items-center justify-between cursor-pointer">
        <span className="text-[11px] font-semibold text-gray-400 tracking-[1px] uppercase">Full correlation audit</span>
        <span className="text-[14px] text-gray-300">{open ? "\u25BE" : "\u25B8"}</span>
      </div>
      {open && (
        <div className="mt-4">
          <PlotlyInline figureJson={figureJson} maxHeight={480} />
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
      font: { family: "Inter, sans-serif", color: "#9ca3af", size: 10 },
      margin: { l: 52, r: 20, t: 6, b: 48, pad: 2 },
      xaxis: { ...backendXaxis, gridcolor: "#f3f4f6", tickfont: { size: 10, family: "Inter" } },
      yaxis: { ...backendYaxis, gridcolor: "#f3f4f6", tickfont: { size: 10, family: "Inter" } },
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
