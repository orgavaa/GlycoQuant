interface StatusBarProps {
  datasetLabel: string | null;
  cellCount: number | null;
  pixelSizeUm?: number;
  deepBackend?: string | null;
}

export function StatusBar({ datasetLabel, cellCount, pixelSizeUm, deepBackend }: StatusBarProps) {
  const parts: string[] = [];
  if (datasetLabel) parts.push(datasetLabel);
  if (cellCount != null) parts.push(`${cellCount} cells`);
  if (pixelSizeUm) parts.push(`${pixelSizeUm} \u00b5m/px`);
  if (deepBackend) parts.push(deepBackend.replace(/_/g, " "));

  return (
    <div style={{
      height: 32, background: "#0d0d0d", borderTop: "1px solid #1a1a1a",
      display: "flex", alignItems: "center", padding: "0 20px",
      color: "#555", fontSize: 11, flexShrink: 0, gap: 8, fontFamily: "inherit",
    }}>
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && <span style={{ color: "#333", margin: "0 6px" }}>&middot;</span>}
          <span style={{ color: p.includes("cells") ? "#aaa" : undefined }}>{p}</span>
        </span>
      ))}
    </div>
  );
}
