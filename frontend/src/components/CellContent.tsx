import { useMemo } from "react";
import { RadarChart, RADAR_AXES } from "./RadarChart";
import { FeatureGroup } from "./FeatureGroup";
import { useJobStore } from "@/lib/jobStore";
import { type CellFeatures, computePopStats, fmt, fmtSigned } from "@/lib/canvas/extract";

const GROUPS = [
  { name: "Glycocalyx", prefix: "glycocalyx_" },
  { name: "YAP", prefix: "yap_" },
  { name: "Focal Adhesions", prefix: "fa_" },
  { name: "Actin", prefix: "actin_" },
  { name: "Morphology", prefix: "cell_|nuclear_|nc_" },
];

export function CellContent({ cell, cells }: { cell: CellFeatures; cells: CellFeatures[] }) {
  const setSelectedCellId = useJobStore(s => s.setSelectedCellId);
  const pop = useMemo(() => computePopStats(cells), [cells]);

  const z = (key: string) => { const s = pop[key]; const v = cell[key]; if (!s || typeof v !== "number" || !Number.isFinite(v)) return 0; return (v - s.mean) / s.std; };
  const mColor = (key: string) => { const zv = z(key); return zv > 1 ? "#2e7d32" : zv < -1 ? "#c62828" : "#111"; };

  const radarValues = RADAR_AXES.map(a => { const s = pop[a.key]; const v = cell[a.key]; if (!s || typeof v !== "number") return 0.5; const range = s.max - s.min; return range === 0 ? 0.5 : (v - s.min) / range; });

  const summary = useMemo(() => {
    const parts: string[] = [];
    const g = cell.glycocalyx_pericellular_ratio; if (typeof g === "number" && pop.glycocalyx_pericellular_ratio) { if (g > pop.glycocalyx_pericellular_ratio.mean * 1.3) parts.push("thick glycocalyx"); else if (g < pop.glycocalyx_pericellular_ratio.mean * 0.7) parts.push("thin glycocalyx"); }
    const y = cell.yap_nc_ratio_size_corrected; if (typeof y === "number") { if (y > 1.3) parts.push("nuclear YAP"); else if (y < 0.8) parts.push("cytoplasmic YAP"); }
    const f = cell.fa_mature_fraction; if (typeof f === "number") parts.push(f > 0.5 ? "mature adhesions" : "nascent adhesions");
    const a = cell.actin_stress_fiber_coherence; if (typeof a === "number" && a > 0.6) parts.push("aligned stress fibers");
    return parts.length > 0 ? parts.join(", ") : "unremarkable phenotype";
  }, [cell, pop]);

  const featureGroups = useMemo(() => {
    const allKeys = Object.keys(cell).filter(k => k !== "cell_id" && !k.startsWith("deep_"));
    return GROUPS.map(g => {
      const prefixes = g.prefix.split("|");
      const features = allKeys.filter(k => prefixes.some(p => k.startsWith(p))).filter(k => cell[k] != null)
        .map(k => ({ name: k, value: cell[k] as number, zScore: z(k) })).sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore));
      return { ...g, features };
    }).filter(g => g.features.length > 0);
  }, [cell, pop]);

  return (
    <>
      <a onClick={() => setSelectedCellId(null)} style={{ fontSize: 12, fontWeight: 500, color: "#2166ac", cursor: "pointer", marginBottom: 16, display: "inline-block" }}>&larr; Overview</a>
      <div style={{ fontSize: 18, fontWeight: 700, color: "#111", marginBottom: 4 }}>Cell #{cell.cell_id}</div>
      <div style={{ fontSize: 12, color: "#999", fontStyle: "italic", marginBottom: 20, lineHeight: 1.5 }}>{summary}</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 24 }}>
        {[
          { label: "GLYCO RATIO", key: "glycocalyx_pericellular_ratio", format: fmt },
          { label: "YAP N/C", key: "yap_nc_ratio_size_corrected", format: fmt },
          { label: "MECHANO", key: "mechano_score", format: fmtSigned },
          { label: "FA MATURE", key: "fa_mature_fraction", format: (v: number | null | undefined) => v != null && Number.isFinite(v) ? ((v as number) * 100).toFixed(0) + "%" : "\u2014" },
        ].map(mi => (
          <div key={mi.key} style={{ background: "#fafafa", borderRadius: 4, padding: 12 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: mColor(mi.key), fontFeatureSettings: "'tnum'" }}>{mi.format(cell[mi.key] as number | null | undefined)}</div>
            <div style={{ fontSize: 9, fontWeight: 600, color: "#bbb", textTransform: "uppercase" as const, letterSpacing: 1, marginTop: 4 }}>{mi.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
        <RadarChart values={radarValues} size={200} />
      </div>

      {featureGroups.map((g, i) => <FeatureGroup key={g.name} name={g.name} features={g.features} defaultOpen={i === 0} />)}
    </>
  );
}
