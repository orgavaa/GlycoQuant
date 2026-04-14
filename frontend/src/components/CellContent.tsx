import { useMemo } from "react";
import { RadarChart, RADAR_AXES } from "./RadarChart";
import { FeatureGroup } from "./FeatureGroup";
import { Card } from "./Card";
import { useJobStore } from "@/lib/jobStore";
import { type CellFeatures, computePopStats } from "@/lib/canvas/extract";
import { fmt, fmtSigned } from "@/lib/utils";

const GROUPS = [
  { name: "Glycocalyx", prefix: "glycocalyx_" },
  { name: "YAP", prefix: "yap_" },
  { name: "Focal Adhesions", prefix: "fa_" },
  { name: "Actin", prefix: "actin_" },
  { name: "Morphology", prefix: "cell_|nuclear_|nc_" },
];

interface Props {
  cell: CellFeatures;
  cells: CellFeatures[];
}

export function CellContent({ cell, cells }: Props) {
  const setSelectedCellId = useJobStore(s => s.setSelectedCellId);
  const pop = useMemo(() => computePopStats(cells), [cells]);

  const z = (key: string) => {
    const s = pop[key]; const v = cell[key];
    if (!s || typeof v !== "number" || !Number.isFinite(v)) return 0;
    return (v - s.mean) / s.std;
  };

  const mColor = (key: string) => {
    const zv = z(key);
    return zv > 1 ? "text-emerald-600" : zv < -1 ? "text-red-600" : "text-gray-900";
  };

  const radarValues = RADAR_AXES.map(a => {
    const s = pop[a.key]; const v = cell[a.key];
    if (!s || typeof v !== "number") return 0.5;
    const range = s.max - s.min;
    return range === 0 ? 0.5 : (v - s.min) / range;
  });

  const summary = useMemo(() => {
    const parts: string[] = [];
    const g = cell.glycocalyx_pericellular_ratio;
    if (typeof g === "number" && pop.glycocalyx_pericellular_ratio) {
      if (g > pop.glycocalyx_pericellular_ratio.mean * 1.3) parts.push("thick glycocalyx");
      else if (g < pop.glycocalyx_pericellular_ratio.mean * 0.7) parts.push("thin glycocalyx");
    }
    const y = cell.yap_nc_ratio_size_corrected;
    if (typeof y === "number") {
      if (y > 1.3) parts.push("nuclear YAP");
      else if (y < 0.8) parts.push("cytoplasmic YAP");
    }
    const f = cell.fa_mature_fraction;
    if (typeof f === "number") parts.push(f > 0.5 ? "mature adhesions" : "nascent adhesions");
    const a = cell.actin_stress_fiber_coherence;
    if (typeof a === "number" && a > 0.6) parts.push("aligned stress fibers");
    return parts.length > 0 ? parts.join(", ") : "unremarkable phenotype";
  }, [cell, pop]);

  const featureGroups = useMemo(() => {
    const allKeys = Object.keys(cell).filter(k => k !== "cell_id" && !k.startsWith("deep_"));
    return GROUPS.map(g => {
      const prefixes = g.prefix.split("|");
      const features = allKeys
        .filter(k => prefixes.some(p => k.startsWith(p)))
        .filter(k => cell[k] != null)
        .map(k => ({ name: k, value: cell[k] as number, zScore: z(k) }))
        .sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore));
      return { ...g, features };
    }).filter(g => g.features.length > 0);
  }, [cell, pop]);

  const metricItems = [
    { label: "GLYCO RATIO", key: "glycocalyx_pericellular_ratio", format: (v: number | null | undefined) => fmt(v) },
    { label: "YAP N/C", key: "yap_nc_ratio_size_corrected", format: (v: number | null | undefined) => fmt(v) },
    { label: "MECHANO", key: "mechano_score", format: (v: number | null | undefined) => fmtSigned(v) },
    { label: "FA MATURE", key: "fa_mature_fraction", format: (v: number | null | undefined) => v != null && Number.isFinite(v) ? ((v as number) * 100).toFixed(0) + "%" : "\u2014" },
  ];

  // Cell navigation: next / previous in the cells array
  const sortedIds = useMemo(
    () => cells.map(c => Number(c.cell_id)).sort((a, b) => a - b),
    [cells]
  );
  const currentIdx = sortedIds.indexOf(Number(cell.cell_id));
  const prevId = currentIdx > 0 ? sortedIds[currentIdx - 1] : null;
  const nextId = currentIdx >= 0 && currentIdx < sortedIds.length - 1 ? sortedIds[currentIdx + 1] : null;

  return (
    <div className="flex flex-col gap-4">
      {/* Navigation row */}
      <div className="flex items-center gap-2 text-[12px]">
        <a
          onClick={() => setSelectedCellId(null)}
          className="font-medium text-blue-600 cursor-pointer hover:underline"
        >
          &larr; Overview
        </a>
        <div className="flex-1" />
        <button
          onClick={() => prevId != null && setSelectedCellId(prevId)}
          disabled={prevId == null}
          className="px-2 py-0.5 text-gray-500 hover:text-gray-900 disabled:text-gray-300 disabled:cursor-not-allowed"
          title="Previous cell"
        >
          &larr;
        </button>
        <span className="text-[10px] text-gray-400" style={{ fontFeatureSettings: "'tnum'" }}>
          {currentIdx + 1} / {sortedIds.length}
        </span>
        <button
          onClick={() => nextId != null && setSelectedCellId(nextId)}
          disabled={nextId == null}
          className="px-2 py-0.5 text-gray-500 hover:text-gray-900 disabled:text-gray-300 disabled:cursor-not-allowed"
          title="Next cell"
        >
          &rarr;
        </button>
      </div>

      {/* Summary */}
      <div>
        <div className="text-[12px] text-gray-500 leading-relaxed">{summary}</div>
      </div>

      {/* 2x2 metric cards */}
      <div className="grid grid-cols-2 gap-2.5">
        {metricItems.map(mi => (
          <Card key={mi.key} className="!p-3">
            <div className={`text-[20px] font-bold ${mColor(mi.key)}`} style={{ fontFeatureSettings: "'tnum'" }}>
              {mi.format(cell[mi.key] as number | null | undefined)}
            </div>
            <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-[1px] mt-1">{mi.label}</div>
          </Card>
        ))}
      </div>

      {/* Radar chart */}
      <Card className="flex justify-center">
        <RadarChart values={radarValues} size={220} />
      </Card>

      {/* Feature groups */}
      <Card>
        {featureGroups.map((g, i) => (
          <FeatureGroup key={g.name} name={g.name} features={g.features} defaultOpen={i === 0} />
        ))}
      </Card>
    </div>
  );
}
