/**
 * TopBar — 40px dark nav. Logo left, view tabs center, Export right.
 */
export type ViewId = "overview" | "single" | "compare" | "prioritization" | "experiment";

const NAV_TABS: { id: ViewId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "single", label: "Single Cell" },
  { id: "compare", label: "Compare" },
  { id: "prioritization", label: "Ranking" },
  { id: "experiment", label: "Experiment" },
];

interface TopBarProps {
  activeView: ViewId;
  onChangeView: (v: ViewId) => void;
  hasResult: boolean;
}

export function TopBar({ activeView, onChangeView, hasResult }: TopBarProps) {
  return (
    <nav className="h-10 bg-[#0d0d0d] flex items-center justify-between px-4 border-b border-[#222] shrink-0 z-50">
      <button
        type="button"
        onClick={() => onChangeView("overview")}
        className="flex items-center gap-2 hover:opacity-80 transition-opacity"
      >
        <img src="/favicon.png" alt="" className="h-4 w-4" draggable={false} />
        <span className="text-sm font-semibold tracking-tight text-[#eee]">GlycoQuant</span>
      </button>

      <div className="flex items-center gap-1">
        {NAV_TABS.map((tab) => {
          const isActive =
            tab.id === activeView ||
            (tab.id === "overview" && activeView === "single");
          const disabled = !hasResult && tab.id !== "overview";
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => !disabled && onChangeView(tab.id)}
              disabled={disabled}
              className={`px-3 py-1.5 text-[10px] uppercase tracking-[0.08em] transition-colors ${
                isActive
                  ? "text-[#eee] border-b border-[#00ffff]"
                  : disabled
                    ? "text-[#444] cursor-not-allowed"
                    : "text-[#666] hover:text-[#aaa]"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        className="text-[10px] uppercase tracking-[0.08em] px-3 py-1 bg-[#222] text-[#888] hover:text-[#eee] hover:bg-[#333] transition-colors"
      >
        Export
      </button>
    </nav>
  );
}
