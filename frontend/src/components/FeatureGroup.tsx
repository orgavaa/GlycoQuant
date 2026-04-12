import { useState } from "react";

interface Feature { name: string; value: number; zScore: number; }

export function FeatureGroup({ name, features, defaultOpen = false }: { name: string; features: Feature[]; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 10 }}>
      <div onClick={() => setOpen(v => !v)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", padding: "6px 0" }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: "#bbb", letterSpacing: 1.5, textTransform: "uppercase" as const }}>{name} ({features.length})</span>
        <span style={{ fontSize: 12, color: "#ccc" }}>{open ? "\u25be" : "\u25b8"}</span>
      </div>
      {open && features.map(f => {
        const zBg = f.zScore > 1 ? "#e8f5e9" : f.zScore < -1 ? "#ffebee" : "transparent";
        const zColor = f.zScore > 1 ? "#2e7d32" : f.zScore < -1 ? "#c62828" : "#ccc";
        return (
          <div key={f.name} style={{ display: "flex", alignItems: "center", padding: "4px 0", fontSize: 11, borderBottom: "1px solid #f0f0f0" }}>
            <span style={{ color: "#999", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginRight: 8 }}>{f.name}</span>
            <span style={{ color: "#222", fontWeight: 500, fontFeatureSettings: "'tnum'", width: 60, textAlign: "right", flexShrink: 0 }}>{Number.isFinite(f.value) ? f.value.toFixed(3) : "\u2014"}</span>
            <span style={{ fontSize: 10, fontWeight: 500, padding: "1px 5px", borderRadius: 3, width: 54, textAlign: "right", flexShrink: 0, marginLeft: 6, color: zColor, background: zBg, fontFeatureSettings: "'tnum'" }}>
              z={Number.isFinite(f.zScore) ? (f.zScore >= 0 ? "+" : "") + f.zScore.toFixed(1) : "\u2014"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
