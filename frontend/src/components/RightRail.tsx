/**
 * RightRail — 320px fixed panel. Content swaps by context.
 * Overview mode: hero metrics + heatmap + histogram + top cells.
 * Single cell mode: cell header + summary + radar + feature groups.
 */
import { useMemo } from "react";
import { HeroMetrics } from "./HeroMetrics";
import { PlotlyDark } from "./PlotlyDark";
import { RadarChart } from "./RadarChart";
import { FeatureGroup } from "./FeatureGroup";
import { CellSummary } from "./CellSummary";
import { useJobStore } from "@/lib/jobStore";
import type { JobResult } from "@/lib/api";
import { FEATURE_GROUPS, RADAR_AXES } from "@/types";
import { useState } from "react";

interface CellRow {
  cell_id: number;
  [key: string]: number | undefined;
}

interface RightRailProps {
  result: JobResult;
  onDeselectCell: () => void;
}

function fmt(v: number | null | undefined, decimals = 2): string {
  if (v == null || !Number.isFinite(v)) return "\u2014";
  return v.toFixed(decimals);
}

function fmtSigned(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "\u2014";
  return (v >= 0 ? "+" : "") + v.toFixed(2);
}

export function RightRail({ result, onDeselectCell }: RightRailProps) {
  const selectedCellId = useJobStore((s) => s.selectedCellId);
  const setSelectedCellId = useJobStore((s) => s.setSelectedCellId);

  const rows: CellRow[] = useMemo(() => {
    try {
      return JSON.parse(result.features_df_json) as CellRow[];
    } catch {
      return [];
    }
  }, [result.features_df_json]);

  // Population statistics for z-scores and normalization
  const popStats = useMemo(() => {
    const stats: Record<string, { mean: number; std: number; min: number; max: number; median: number }> = {};
    if (rows.length === 0) return stats;
    // Collect all numeric feature keys (excluding cell_id and deep_*)
    const keys = Object.keys(rows[0]).filter(
      (k) => k !== "cell_id" && !k.startsWith("deep_"),
    );
    for (const key of keys) {
      const vals = rows
        .map((r) => r[key])
        .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
      if (vals.length === 0) continue;
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      const std = Math.sqrt(
        vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length,
      );
      const sorted = [...vals].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      stats[key] = {
        mean,
        std: std || 1,
        min: sorted[0],
        max: sorted[sorted.length - 1],
        median,
      };
    }
    return stats;
  }, [rows]);

  const selectedCell = useMemo(
    () =>
      selectedCellId != null
        ? rows.find((r) => Number(r.cell_id) === selectedCellId) ?? null
        : null,
    [rows, selectedCellId],
  );

  const summary = result.mechano_score_summary;
  const m = result.hero_metrics;

  // Top 3 cells by |mechano_score|
  const topCells = useMemo(() => {
    const scored = rows.filter(
      (r) => typeof r.mechano_score === "number" && Number.isFinite(r.mechano_score),
    );
    return [...scored]
      .sort((a, b) => Math.abs(b.mechano_score ?? 0) - Math.abs(a.mechano_score ?? 0))
      .slice(0, 3);
  }, [rows]);

  // Single Cell Mode
  if (selectedCell) {
    const zScore = (key: string): number => {
      const s = popStats[key];
      const v = selectedCell[key];
      if (!s || typeof v !== "number" || !Number.isFinite(v)) return 0;
      return (v - s.mean) / s.std;
    };

    const metricColor = (key: string): string => {
      const z = zScore(key);
      if (z > 1) return "#4CAF50";
      if (z < -1) return "#f44336";
      return "#eee";
    };

    // Radar values normalized to [0, 1] within population
    const radarValues = RADAR_AXES.map((axis) => {
      const s = popStats[axis.key];
      const v = selectedCell[axis.key];
      if (!s || typeof v !== "number" || !Number.isFinite(v)) return 0.5;
      const range = s.max - s.min;
      if (range === 0) return 0.5;
      return (v - s.min) / range;
    });

    // Build feature groups with z-scores
    const featureGroupEntries = FEATURE_GROUPS.map((group) => {
      const features = group.features
        .filter((f) => selectedCell[f] !== undefined)
        .map((f) => ({
          name: f,
          value: selectedCell[f] ?? 0,
          zScore: zScore(f),
        }));
      return { ...group, features };
    }).filter((g) => g.features.length > 0);

    // Population medians for CellSummary
    const popMedians: Record<string, number> = {};
    for (const [k, v] of Object.entries(popStats)) {
      popMedians[k] = v.median;
    }

    return (
      <div className="w-[320px] shrink-0 bg-[#111] border-l border-[#222] overflow-y-auto h-full">
        <div className="p-4 space-y-4">
          {/* Back button */}
          <button
            type="button"
            onClick={onDeselectCell}
            className="text-[10px] text-[#666] hover:text-[#ccc] transition-colors"
          >
            &larr; Overview
          </button>

          {/* Cell header */}
          <div>
            <div className="text-[18px] font-bold mono text-[#eee]">
              Cell #{selectedCellId}
            </div>
            <CellSummary cell={selectedCell} populationMedians={popMedians} />
          </div>

          {/* Key metrics — 4 columns */}
          <div className="grid grid-cols-4 gap-1">
            {[
              { label: "GLYCO", key: "glycocalyx_pericellular_ratio", format: fmt },
              { label: "YAP N/C", key: "yap_nc_ratio_size_corrected", format: fmt },
              { label: "MECHANO", key: "mechano_score", format: fmtSigned },
              { label: "FA MATURE", key: "fa_mature_fraction", format: (v: number | undefined) => v != null && Number.isFinite(v) ? (v * 100).toFixed(0) + "%" : "\u2014" },
            ].map((m) => (
              <div key={m.key} className="text-center">
                <div
                  className="text-[18px] font-bold mono leading-none"
                  style={{ color: metricColor(m.key) }}
                >
                  {m.format(selectedCell[m.key])}
                </div>
                <div className="label mt-1">{m.label}</div>
              </div>
            ))}
          </div>

          {/* Radar chart */}
          <div className="flex justify-center">
            <RadarChart values={radarValues} size={180} />
          </div>

          {/* Feature groups */}
          <div className="space-y-1">
            {featureGroupEntries.map((group, i) => (
              <FeatureGroup
                key={group.name}
                groupName={group.name}
                features={group.features}
                defaultOpen={i === 0}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Overview Mode
  return (
    <div className="w-[320px] shrink-0 bg-[#111] border-l border-[#222] overflow-y-auto h-full">
      <div className="p-4 space-y-6">
        {/* Hero metrics */}
        <HeroMetrics
          metrics={[
            { label: "CELLS", value: String(result.cell_count) },
            { label: "MECHANO", value: fmtSigned(m.mean_mechano_score) },
            {
              label: "GLYCO\u2194MECH",
              value: summary?.top_correlation_r != null
                ? `r=${fmt(summary.top_correlation_r)}`
                : "\u2014",
            },
          ]}
        />

        {/* Glyco-mechano heatmap */}
        {result.glyco_mechano_correlation_figure_json && (
          <div>
            <PlotlyDark
              figureJson={result.glyco_mechano_correlation_figure_json}
              height={240}
              title={
                summary?.top_correlation_pair
                  ? `top |r| = ${fmt(summary.top_correlation_r)} \u2014 ${summary.top_correlation_pair[0]} \u00d7 ${summary.top_correlation_pair[1]}`
                  : undefined
              }
            />
          </div>
        )}

        {/* Score distribution */}
        {result.mechano_score_distribution_figure_json && (
          <div>
            <div className="label mb-1">Score distribution</div>
            <PlotlyDark
              figureJson={result.mechano_score_distribution_figure_json}
              height={80}
            />
          </div>
        )}

        {/* Top deviating cells */}
        {topCells.length > 0 && (
          <div>
            <div className="label mb-2">Top deviating cells</div>
            <div className="space-y-1">
              {topCells.map((cell) => (
                <button
                  key={cell.cell_id}
                  type="button"
                  onClick={() => setSelectedCellId(Number(cell.cell_id))}
                  className="w-full text-left py-1.5 px-2 hover:bg-[#1a1a1a] transition-colors text-[11px] mono"
                >
                  <span className="text-[#888]">#{cell.cell_id}</span>
                  <span className="ml-2 text-[#eee]">
                    mechano {fmtSigned(cell.mechano_score)}
                  </span>
                  <span className="ml-2 text-[#666]">
                    glyco {fmt(cell.glycocalyx_pericellular_ratio)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Full correlation audit — collapsed */}
        <CorrelationAudit figureJson={result.correlation_figure_json} />
      </div>
    </div>
  );
}

function CorrelationAudit({ figureJson }: { figureJson: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between py-1"
      >
        <span className="label">Full correlation audit</span>
        <span className="text-[8px] text-[#666]">{open ? "\u25be" : "\u25b8"}</span>
      </button>
      {open && (
        <PlotlyDark figureJson={figureJson} height={400} />
      )}
    </div>
  );
}
