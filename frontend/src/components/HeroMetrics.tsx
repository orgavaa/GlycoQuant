interface Metric { value: string; label: string; }

export function HeroMetrics({ metrics }: { metrics: Metric[] }) {
  return (
    <div style={{ display: "flex", paddingBottom: 20, marginBottom: 24, borderBottom: "1px solid #f0f0f0" }}>
      {metrics.map(m => (
        <div key={m.label} style={{ flex: 1, textAlign: "center" }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: m.value === "\u2014" ? "#ddd" : "#111", lineHeight: 1, fontFeatureSettings: "'tnum'" }}>{m.value}</div>
          <div style={{ fontSize: 9, fontWeight: 600, color: "#bbb", letterSpacing: 1, textTransform: "uppercase" as const, marginTop: 6 }}>{m.label}</div>
        </div>
      ))}
    </div>
  );
}
