import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { FeatureGroup } from "./FeatureGroup";
import { Card } from "./Card";
import { useJobStore } from "@/lib/jobStore";
import { type CellFeatures, computePopStats } from "@/lib/canvas/extract";
import { fmt, fmtSigned } from "@/lib/utils";

const GROUPS = [
  { name: "WGA / Pericellular Glycans", prefix: "glycocalyx_" },
  { name: "YAP", prefix: "yap_" },
  { name: "Focal Adhesions", prefix: "fa_" },
  { name: "Actin", prefix: "actin_" },
  { name: "Morphology", prefix: "cell_|nuclear_|nc_" },
];

const SUMMARY_AXES = [
  { key: "glycocalyx_pericellular_ratio", label: "WGA peri." },
  { key: "yap_nc_ratio_size_corrected", label: "YAP N/C" },
  { key: "fa_mature_fraction", label: "FA mature" },
  { key: "actin_stress_fiber_coherence", label: "Actin coher." },
  { key: "cell_area", label: "Spread area" },
  { key: "mechano_score", label: "Mechanophen." },
];

function prettyFeature(raw: string): string {
  return raw
    .replace(/^glycocalyx_/, "WGA ")
    .replace(/^mechano_score$/, "mechanophenotype score")
    .replace(/^mechano_/, "mechanophenotype ")
    .replace(/^yap_/, "YAP ")
    .replace(/^fa_/, "FA ")
    .replace(/^actin_/, "actin ")
    .replace(/^cell_/, "cell ")
    .replace(/^nuclear_/, "nuclear ")
    .replace(/^nc_/, "N/C ")
    .replace(/_/g, " ");
}

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
    return zv > 1 ? "text-red-700" : zv < -1 ? "text-blue-700" : "text-gray-900";
  };

  const summary = useMemo(() => {
    const parts: string[] = [];
    const gz = z("glycocalyx_pericellular_ratio");
    if (Number.isFinite(gz)) {
      if (gz > 1) parts.push("WGA-high pericellular signal");
      else if (gz < -1) parts.push("WGA-low pericellular signal");
    }
    const y = cell.yap_nc_ratio_size_corrected;
    if (typeof y === "number") {
      if (y > 1.3) parts.push("YAP nuclear-enriched");
      else if (y < 0.8) parts.push("YAP cytoplasmic-enriched");
    }
    const f = cell.fa_mature_fraction;
    if (typeof f === "number") parts.push(f > 0.5 ? "FA-mature" : "FA-nascent");
    const a = cell.actin_stress_fiber_coherence;
    if (typeof a === "number" && a > 0.6) parts.push("aligned stress fibers");
    return parts.length > 0 ? parts.join(" / ") : "near-field-average profile";
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
    { label: "WGA pericellular", key: "glycocalyx_pericellular_ratio", format: (v: number | null | undefined) => fmt(v) },
    { label: "YAP N/C", key: "yap_nc_ratio_size_corrected", format: (v: number | null | undefined) => fmt(v) },
    { label: "Mechanophenotype z", key: "mechano_score", format: (v: number | null | undefined) => fmtSigned(v) },
    { label: "FA mature", key: "fa_mature_fraction", format: (v: number | null | undefined) => v != null && Number.isFinite(v) ? ((v as number) * 100).toFixed(0) + "%" : "\u2014" },
  ];

  const axisItems = SUMMARY_AXES.map(axis => ({
    ...axis,
    value: cell[axis.key] as number | null | undefined,
    zScore: z(axis.key),
  }));

  const topDeviations = useMemo(() => {
    return Object.keys(cell)
      .filter(k => k !== "cell_id" && !k.startsWith("deep_"))
      .map(k => {
        const value = cell[k];
        return {
          name: k,
          value: typeof value === "number" ? value : null,
          zScore: z(k),
        };
      })
      .filter(item => item.value != null && Number.isFinite(item.zScore))
      .sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore))
      .slice(0, 6);
  }, [cell, pop]);

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
          className="inline-flex cursor-pointer items-center gap-1 font-medium text-gray-600 hover:text-gray-950"
        >
          <ChevronLeft size={14} strokeWidth={1.5} />
          Overview
        </a>
        <div className="flex-1" />
        <button
          onClick={() => prevId != null && setSelectedCellId(prevId)}
          disabled={prevId == null}
          className="inline-flex items-center px-1.5 py-0.5 text-gray-500 hover:text-gray-900 disabled:text-gray-300 disabled:cursor-not-allowed"
          title="Previous cell"
        >
          <ChevronLeft size={14} strokeWidth={1.5} />
        </button>
        <span className="text-[10px] text-gray-400" style={{ fontFeatureSettings: "'tnum'" }}>
          {currentIdx + 1} / {sortedIds.length}
        </span>
        <button
          onClick={() => nextId != null && setSelectedCellId(nextId)}
          disabled={nextId == null}
          className="inline-flex items-center px-1.5 py-0.5 text-gray-500 hover:text-gray-900 disabled:text-gray-300 disabled:cursor-not-allowed"
          title="Next cell"
        >
          <ChevronRight size={14} strokeWidth={1.5} />
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
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className={`text-[20px] font-bold leading-none ${mColor(mi.key)}`} style={{ fontFeatureSettings: "'tnum'" }}>
                  {mi.format(cell[mi.key] as number | null | undefined)}
                </div>
                <div className="mt-1 text-[9px] font-semibold uppercase text-gray-500">{mi.label}</div>
              </div>
              <span className="text-[10px] text-gray-400" style={{ fontFeatureSettings: "'tnum'" }}>
                z {fmtSigned(z(mi.key))}
              </span>
            </div>
            <DeviationBar zScore={z(mi.key)} />
          </Card>
        ))}
      </div>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <div className="text-[11px] font-semibold uppercase text-gray-500">
            Axis deviations vs field
          </div>
          <div className="text-[10px] text-gray-400">z-score</div>
        </div>
        <div className="space-y-2.5">
          {axisItems.map(item => (
            <AxisRow key={item.key} label={item.label} zScore={item.zScore} />
          ))}
        </div>
      </Card>

      {topDeviations.length > 0 && (
        <Card>
          <div className="mb-3 text-[11px] font-semibold uppercase text-gray-500">
            Largest feature deviations
          </div>
          <div className="space-y-2">
            {topDeviations.map(item => (
              <div key={item.name} className="grid grid-cols-[1fr,70px,54px] items-center gap-2 text-[11px]">
                <span className="truncate text-gray-600" title={item.name}>
                  {prettyFeature(item.name)}
                </span>
                <span className="text-right font-medium text-gray-800" style={{ fontFeatureSettings: "'tnum'" }}>
                  {item.value != null ? item.value.toFixed(3) : "\u2014"}
                </span>
                <span className={`text-right font-medium ${item.zScore >= 0 ? "text-red-700" : "text-blue-700"}`} style={{ fontFeatureSettings: "'tnum'" }}>
                  {fmtSigned(item.zScore)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Feature groups */}
      <Card>
        {featureGroups.some(g => g.prefix === "glycocalyx_") && (
          <div className="mb-2 rounded-md bg-gray-50 px-2.5 py-2 text-[10px] leading-relaxed text-gray-500">
            WGA reports lectin-accessible GlcNAc/sialic-acid-rich glycoconjugate signal; it is not a complete glycocalyx composition or thickness measurement.
          </div>
        )}
        {featureGroups.map((g, i) => (
          <FeatureGroup key={g.name} name={g.name} features={g.features} defaultOpen={i === 0} />
        ))}
      </Card>
    </div>
  );
}

function DeviationBar({ zScore }: { zScore: number }) {
  const abs = Math.min(1, Math.abs(zScore) / 3);
  const width = `${abs * 50}%`;
  return (
    <div className="relative mt-2 h-1.5 rounded-full bg-gray-100">
      <div className="absolute left-1/2 top-[-2px] h-[10px] w-px bg-gray-300" />
      {zScore >= 0 ? (
        <div className="absolute bottom-0 left-1/2 top-0 rounded-r-full bg-red-500/85" style={{ width }} />
      ) : (
        <div className="absolute bottom-0 right-1/2 top-0 rounded-l-full bg-blue-600/85" style={{ width }} />
      )}
    </div>
  );
}

function AxisRow({ label, zScore }: { label: string; zScore: number }) {
  return (
    <div className="grid grid-cols-[88px,1fr,48px] items-center gap-2 text-[11px]">
      <div className="truncate text-gray-600">{label}</div>
      <DeviationBar zScore={zScore} />
      <div
        className={`text-right font-medium ${zScore >= 0 ? "text-red-700" : "text-blue-700"}`}
        style={{ fontFeatureSettings: "'tnum'" }}
      >
        {fmtSigned(zScore)}
      </div>
    </div>
  );
}
