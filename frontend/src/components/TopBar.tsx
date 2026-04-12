/**
 * TopBar — 40px dark nav. Logo left, view tabs center, Export right.
 */
export type ViewId = "overview" | "single" | "compare" | "prioritization" | "experiment";

interface TopBarProps {
  activeView: ViewId;
  onChangeView: (v: ViewId) => void;
  hasResult: boolean;
}

const TABS: { id: ViewId; label: string; requiresResult: boolean }[] = [
  { id: "overview", label: "Overview", requiresResult: true },
  { id: "single", label: "Single Cell", requiresResult: true },
  { id: "compare", label: "Compare", requiresResult: true },
];

export function TopBar({ activeView, onChangeView, hasResult }: TopBarProps) {
  return (
    <nav className="h-10 bg-[#111] flex items-center justify-between px-4 border-b border-[#333] shrink-0 z-50">
      <button
        type="button"
        onClick={() => onChangeView("overview")}
        className="text-sm font-bold tracking-tight text-[#eee] hover:text-white transition-colors flex items-center gap-2"
      >
        <img src="/favicon.png" alt="" className="h-4 w-4" draggable={false} />
        GlycoQuant
      </button>

      <div className="flex items-center gap-5">
        {TABS.map((tab) => {
          const disabled = tab.requiresResult && !hasResult;
          const active = tab.id === activeView;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => !disabled && onChangeView(tab.id)}
              disabled={disabled}
              className={`text-[10px] uppercase tracking-[0.1em] transition-colors pb-0.5 ${
                active
                  ? "text-white border-b border-[#343dff]"
                  : disabled
                    ? "text-[#444] cursor-not-allowed"
                    : "text-[#888] hover:text-[#ccc]"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

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
