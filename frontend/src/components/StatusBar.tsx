/**
 * StatusBar — 32px bottom bar showing dataset + cell count + condition.
 */
interface StatusBarProps {
  datasetLabel: string | null;
  cellCount: number | null;
  condition?: string;
}

export function StatusBar({ datasetLabel, cellCount, condition }: StatusBarProps) {
  return (
    <div className="h-8 bg-[#111] flex items-center px-4 border-t border-[#333] shrink-0 text-[10px] uppercase tracking-[0.08em] text-[#888] gap-4">
      {cellCount != null && (
        <span className="text-[#eee] mono">{cellCount} cells</span>
      )}
      {datasetLabel && <span>· {datasetLabel}</span>}
      {condition && <span>· {condition}</span>}
    </div>
  );
}
