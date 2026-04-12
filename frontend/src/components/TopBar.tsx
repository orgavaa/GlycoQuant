/**
 * TopBar — 40px dark nav. Logo left, view tabs center, Export right.
 */
export type ViewId = "overview" | "single" | "compare" | "prioritization" | "experiment";

interface TopBarProps {
  onChangeView: (v: ViewId) => void;
}

export function TopBar({ onChangeView }: TopBarProps) {
  return (
    <nav className="h-10 bg-[#111] flex items-center justify-between px-4 border-b border-[#333] shrink-0 z-50">
      <button
        type="button"
        onClick={() => onChangeView("overview")}
        className="flex items-center gap-2 hover:opacity-80 transition-opacity"
      >
        <img src="/favicon.png" alt="" className="h-4 w-4" draggable={false} />
        <span className="text-sm font-semibold tracking-tight text-[#eee]">GlycoQuant</span>
      </button>

      <div className="flex items-center gap-3">
        <button
          type="button"
          className="text-[10px] uppercase tracking-[0.1em] text-[#888] hover:text-[#ccc] transition-colors"
          onClick={() => onChangeView("prioritization")}
        >
          Ranking
        </button>
        <button
          type="button"
          className="text-[10px] uppercase tracking-[0.08em] px-3 py-1 bg-[#343dff] text-white hover:opacity-90 transition-opacity"
        >
          Export
        </button>
      </div>
    </nav>
  );
}
