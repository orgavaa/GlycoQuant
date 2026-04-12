/**
 * StatusBar — 32px bottom bar. Dataset metadata + cell count.
 */
interface StatusBarProps {
  datasetLabel: string | null;
  cellCount: number | null;
  condition?: string;
  pixelSizeUm?: number;
  deepBackend?: string | null;
}

export function StatusBar({ datasetLabel, cellCount, condition, pixelSizeUm, deepBackend }: StatusBarProps) {
  const parts: string[] = [];
  if (datasetLabel) parts.push(datasetLabel);
  if (condition) parts.push(condition);
  if (cellCount != null) parts.push(`${cellCount} cells`);
  if (pixelSizeUm) parts.push(`${pixelSizeUm} \u00b5m/px`);
  if (deepBackend) parts.push(deepBackend.replace(/_/g, " "));

  return (
    <div className="h-8 bg-[#0d0d0d] flex items-center px-4 border-t border-[#222] shrink-0 text-[10px] tracking-[0.06em] text-[#666] gap-2 mono">
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && <span className="mx-1 text-[#333]">&middot;</span>}
          <span className={i === parts.length - 1 || p.includes("cells") ? "text-[#aaa]" : ""}>
            {p}
          </span>
        </span>
      ))}
    </div>
  );
}
