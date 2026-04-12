interface DatasetBarProps {
  datasetLabel: string | null;
  cellCount: number | null;
  pixelSizeUm?: number;
}

export function DatasetBar({ datasetLabel, cellCount, pixelSizeUm }: DatasetBarProps) {
  const parts: string[] = [];
  if (datasetLabel) parts.push(datasetLabel);
  if (cellCount != null) parts.push(`${cellCount} cells`);
  if (pixelSizeUm) parts.push(`${pixelSizeUm} \u00b5m/px`);

  return (
    <div style={{ height: 36, borderTop: "1px solid #e8e8e8", display: "flex", alignItems: "center", padding: "0 24px", fontSize: 11, color: "#bbb", letterSpacing: 0.5, flexShrink: 0, gap: 8 }}>
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && <span style={{ color: "#ddd", margin: "0 6px" }}>&middot;</span>}
          <span style={{ color: p.includes("cells") ? "#999" : undefined }}>{p}</span>
        </span>
      ))}
    </div>
  );
}
