import { useMemo, useState } from "react";
import { RadarChart, RADAR_AXES } from "./RadarChart";
import { useJobStore } from "@/lib/jobStore";
import { type CellFeatures, computePopStats, fmt, fmtSigned } from "@/lib/canvas/extract";

interface SingleCellContentProps {
  cell: CellFeatures;
  cells: CellFeatures[];
}

const FEATURE_GROUPS = [
  { name: "Glycocalyx", prefix: "glycocalyx_" },
  { name: "YAP", prefix: "yap_" },
  { name: "Focal Adhesions", prefix: "fa_" },
  { name: "Actin", prefix: "actin_" },
  { name: "Morphology", prefix: "cell_|nuclear_|nc_" },
];

export function SingleCellContent({ cell, cells }: SingleCellContentProps) {
  const setSelectedCellId = useJobStore(s => s.setSelectedCellId);
  const popStats = useMemo(() => computePopStats(cells), [cells]);

  const zScore = (key: string): number => {
    const s = popStats[key];
    const v = cell[key];
    if (!s || typeof v !== "number" || !Number.isFinite(v)) return 0;
    return (v - s.mean) / s.std;
  };

  const metricColor = (key: string): string => {
    const z = zScore(key);
    if (z > 1) return "#4CAF50";
    if (z < -1) return "#ef5350";
    return "#eee";
  };

  const radarValues = RADAR_AXES.map(axis => {
    const s = popStats[axis.key];
    const v = cell[axis.key];
    if (!s || typeof v !== "number" || !Number.isFinite(v)) return 0.5;
    const range = s.max - s.min;
    return range === 0 ? 0.5 : (v - s.min) / range;
  });

  const summary = useMemo(() => {
    const parts: string[] = [];
    const glyco = cell.glycocalyx_pericellular_ratio;
    if (typeof glyco === "number") {
      if (glyco > (popStats.glycocalyx_pericellular_ratio?.mean ?? 1) * 1.3) parts.push("thick glycocalyx");
      else if (glyco < (popStats.glycocalyx_pericellular_ratio?.mean ?? 1) * 0.7) parts.push("thin glycocalyx");
    }
    const yap = cell.yap_nc_ratio_size_corrected;
    if (typeof yap === "number") {
      if (yap > 1.3) parts.push("nuclear YAP");
      else if (yap < 0.8) parts.push("cytoplasmic YAP");
    }
    const fa = cell.fa_mature_fraction;
    if (typeof fa === "number") parts.push(fa > 0.5 ? "mature adhesions" : "nascent adhesions");
    return parts.length > 0 ? parts.join(", ") : "unremarkable phenotype";
  }, [cell, popStats]);

  const featureGroups = useMemo(() => {
    const allKeys = Object.keys(cell).filter(k => k !== "cell_id" && !k.startsWith("deep_"));
    return FEATURE_GROUPS.map(g => {
      const prefixes = g.prefix.split("|");
      const features = allKeys
        .filter(k => prefixes.some(p => k.startsWith(p)))
        .filter(k => cell[k] !== undefined && cell[k] !== null)
        .map(k => ({ name: k, value: cell[k] as number, zScore: zScore(k) }))
        .sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore));
      return { ...g, features };
    }).filter(g => g.features.length > 0);
  }, [cell, popStats]);

  return (
    <>
      <div onClick={() => setSelectedCellId(null)} style={{
        fontSize: 12, color: "#4A90D9", cursor: "pointer", marginBottom: 16, fontWeight: 500,
      }}>
        &larr; Back to Overview
      </div>

      <div style={{ fontSize: 20, fontWeight: 700, color: "#eee", marginBottom: 4 }}>
        Cell #{cell.cell_id}
      </div>
      <div style={{ fontSize: 12, color: "#888", fontStyle: "italic", marginBottom: 20 }}>
        {summary}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
        {[
          { label: "GLYCO", key: "glycocalyx_pericellular_ratio", format: fmt },
          { label: "YAP N/C", key: "yap_nc_ratio_size_corrected", format: fmt },
          { label: "MECHANO", key: "mechano_score", format: fmtSigned },
          { label: "FA MATURE", key: "fa_mature_fraction", format: (v: number | null | undefined) =>
            v != null && Number.isFinite(v) ? ((v as number) * 100).toFixed(0) + "%" : "\u2014" },
        ].map(mi => (
          <div key={mi.key} style={{ background: "#1a1a1a", borderRadius: 4, padding: "12px 10px" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: metricColor(mi.key), fontVariantNumeric: "tabular-nums" }}>
              {mi.format(cell[mi.key] as number | null | undefined)}
            </div>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "#666", marginTop: 4, fontWeight: 500 }}>{mi.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
        <RadarChart values={radarValues} size={170} />
      </div>

      {featureGroups.map((g, gi) => (
        <FeatureGroup key={g.name} name={g.name} features={g.features} defaultOpen={gi === 0} />
      ))}
    </>
  );
}

function FeatureGroup({ name, features, defaultOpen }: {
  name: string; features: { name: string; value: number; zScore: number }[]; defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 10 }}>
      <div onClick={() => setOpen(v => !v)} style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        cursor: "pointer", padding: "6px 0",
      }}>
        <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "#666", fontWeight: 600 }}>
          {name} ({features.length})
        </span>
        <span style={{ fontSize: 12, color: "#555" }}>{open ? "\u25be" : "\u25b8"}</span>
      </div>
      {open && features.map(f => {
        const zColor = f.zScore > 1 ? "#4CAF50" : f.zScore < -1 ? "#ef5350" : "#555";
        const zBg = f.zScore > 1 ? "rgba(76,175,80,0.12)" : f.zScore < -1 ? "rgba(239,83,80,0.12)" : "transparent";
        return (
          <div key={f.name} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "4px 0", fontSize: 11, borderBottom: "1px solid #1a1a1a",
          }}>
            <span style={{ color: "#888", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginRight: 8 }}>{f.name}</span>
            <span style={{ color: "#ddd", fontWeight: 500, fontVariantNumeric: "tabular-nums", width: 60, textAlign: "right", flexShrink: 0 }}>
              {Number.isFinite(f.value) ? f.value.toFixed(3) : "\u2014"}
            </span>
            <span style={{
              width: 52, textAlign: "right", fontSize: 10, padding: "2px 4px", borderRadius: 3, flexShrink: 0,
              color: zColor, background: zBg, fontVariantNumeric: "tabular-nums",
            }}>
              z={Number.isFinite(f.zScore) ? (f.zScore >= 0 ? "+" : "") + f.zScore.toFixed(1) : "\u2014"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
