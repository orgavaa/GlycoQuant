/**
 * RightRail — 320px fixed panel. Content swaps by context.
 * Overview mode: hero metrics + heatmap + histogram + rep cells.
 * Single cell mode: crops + state summary + features.
 */
import { useMemo } from "react";
import { PlotlyChart } from "./PlotlyChart";
import { useJobStore } from "@/lib/jobStore";
import type { JobResult } from "@/lib/api";

interface RightRailProps {
  result: JobResult;
  onDeselectCell: () => void;
}

interface CellRow {
  cell_id: number;
  [key: string]: number | undefined;
}

function fmt(v: number | null | undefined, decimals = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(decimals);
}

export function RightRail({ result, onDeselectCell }: RightRailProps) {
  const selectedCellId = useJobStore((s) => s.selectedCellId);

  const rows: CellRow[] = useMemo(() => {
    try {
      return JSON.parse(result.features_df_json) as CellRow[];
    } catch {
      return [];
    }
  }, [result.features_df_json]);

  const selectedCell = useMemo(
    () =>
      selectedCellId != null
        ? rows.find((r) => Number(r.cell_id) === selectedCellId) ?? null
        : null,
    [rows, selectedCellId],
  );

  const summary = result.mechano_score_summary;
  const m = result.hero_metrics;

  // Top 3 cells by mechano score
  const topCells = useMemo(() => {
    const scored = rows.filter(
      (r) => typeof r.mechano_score === "number" && Number.isFinite(r.mechano_score),
    );
    return [...scored]
      .sort((a, b) => (b.mechano_score ?? 0) - (a.mechano_score ?? 0))
      .slice(0, 3);
  }, [rows]);

  // Single cell mode
  if (selectedCell) {
    return (
      <div className="w-[320px] shrink-0 bg-[#111] border-l border-[#333] overflow-y-auto h-full p-4 space-y-5">
        <button
          type="button"
          onClick={onDeselectCell}
          className="text-[10px] text-[#888] hover:text-[#ccc] uppercase tracking-[0.08em] transition-colors"
        >
          ← Back to overview
        </button>

        <div>
          <div className="label mb-1">Individual profile</div>
          <div className="text-2xl font-bold mono">
            C-{String(selectedCellId).padStart(4, "0")}
          </div>
        </div>

        {/* State summary */}
        <p className="text-[11px] text-[#888] leading-relaxed italic border-l-2 border-[#333] pl-3">
          {generateStateSummary(selectedCell)}
        </p>

        {/* Key metrics grid */}
        <div className="grid grid-cols-2 gap-2">
          <MetricBlock label="Mechano" value={fmt(selectedCell.mechano_score)} accent />
          <MetricBlock label="Glyco ratio" value={fmt(selectedCell.glycocalyx_pericellular_ratio)} />
          <MetricBlock label="YAP N/C" value={fmt(selectedCell.yap_nc_ratio_size_corrected)} />
          <MetricBlock label="FA mature" value={fmt(selectedCell.fa_mature_fraction)} />
          <MetricBlock label="Actin coher" value={fmt(selectedCell.actin_stress_fiber_coherence, 3)} />
          <MetricBlock label="Cell area" value={fmt(selectedCell.cell_area, 0)} />
        </div>

        {/* All features — collapsible */}
        <details className="group">
          <summary className="label cursor-pointer hover:text-[#ccc] transition-colors">
            All features ({Object.keys(selectedCell).length - 1})
          </summary>
          <div className="mt-2 max-h-[300px] overflow-y-auto space-y-0.5">
            {Object.entries(selectedCell)
              .filter(([k]) => k !== "cell_id" && !k.startsWith("deep_"))
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, v]) => (
                <div key={k} className="flex justify-between text-[10px] py-0.5 border-b border-[#1a1a1a]">
                  <span className="text-[#888] truncate mr-2">{k}</span>
                  <span className="mono text-[#eee]">
                    {typeof v === "number" && Number.isFinite(v) ? v.toFixed(3) : "—"}
                  </span>
                </div>
              ))}
          </div>
        </details>
      </div>
    );
  }

  // Overview mode
  return (
    <div className="w-[320px] shrink-0 bg-[#111] border-l border-[#333] overflow-y-auto h-full p-4 space-y-6">
      {/* Hero metrics */}
      <div className="space-y-4">
        <HeroMetric label="Cells analyzed" value={String(result.cell_count)} />
        <HeroMetric label="Mean mechano" value={fmt(m.mean_mechano_score)} />
        <HeroMetric
          label="Top glyco↔mechano |r|"
          value={fmt(summary?.top_correlation_r)}
        />
      </div>

      {/* Heatmap */}
      {result.glyco_mechano_correlation_figure_json && (
        <div>
          <div className="label mb-2">Glyco ↔ mechano correlation</div>
          <PlotlyChart
            figureJson={result.glyco_mechano_correlation_figure_json}
            height={220}
          />
          {summary?.top_correlation_pair && (
            <div className="text-[9px] text-[#666] mono mt-1">
              {summary.top_correlation_pair[0]} × {summary.top_correlation_pair[1]}
            </div>
          )}
        </div>
      )}

      {/* Score distribution */}
      {result.mechano_score_distribution_figure_json && (
        <div>
          <div className="label mb-2">Score distribution</div>
          <PlotlyChart
            figureJson={result.mechano_score_distribution_figure_json}
            height={100}
          />
        </div>
      )}

      {/* Representative cells */}
      {topCells.length > 0 && (
        <div>
          <div className="label mb-2">Top cells by mechano score</div>
          <div className="space-y-1">
            {topCells.map((cell, i) => (
              <button
                key={cell.cell_id}
                type="button"
                onClick={() => useJobStore.getState().setSelectedCellId(Number(cell.cell_id))}
                className="w-full flex items-center justify-between py-1.5 px-2 bg-[#1a1a1a] hover:bg-[#222] transition-colors text-[10px]"
              >
                <span className="text-[#888]">#{i + 1} · cell {cell.cell_id}</span>
                <span className="mono text-[#eee]">{fmt(cell.mechano_score)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function HeroMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="text-2xl font-bold mono mt-0.5">{value}</div>
      <div className="h-px bg-[#333] mt-2" />
    </div>
  );
}

function MetricBlock({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="bg-[#1a1a1a] p-2">
      <div className="text-[9px] text-[#888] uppercase tracking-[0.08em]">{label}</div>
      <div className={`text-lg font-bold mono mt-0.5 ${accent ? "text-[#343dff]" : "text-[#eee]"}`}>
        {value}
      </div>
    </div>
  );
}

function generateStateSummary(cell: CellRow): string {
  const parts: string[] = [];
  const glyco = cell.glycocalyx_pericellular_ratio;
  if (typeof glyco === "number") {
    parts.push(glyco > 1.5 ? "High glycocalyx" : glyco < 0.8 ? "Low glycocalyx" : "Moderate glycocalyx");
  }
  const yap = cell.yap_nc_ratio_size_corrected;
  if (typeof yap === "number") {
    parts.push(yap > 1.5 ? "nuclear YAP" : yap < 0.8 ? "cytoplasmic YAP" : "balanced YAP");
  }
  const fa = cell.fa_mature_fraction;
  if (typeof fa === "number") {
    parts.push(fa > 0.5 ? "mature adhesions" : "nascent adhesions");
  }
  return parts.length > 0 ? parts.join(", ") + "." : "Insufficient data.";
}
