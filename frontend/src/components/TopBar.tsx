export type ViewId = "analysis" | "ranking";

interface TopBarProps {
  activeView: ViewId;
  onChangeView: (v: ViewId) => void;
}

export function TopBar({ activeView, onChangeView }: TopBarProps) {
  return (
    <nav className="h-14 bg-white border-b border-gray-200 flex items-center px-6 flex-shrink-0 z-50">
      <span className="font-bold text-[16px] text-gray-900 tracking-[-0.3px]">GlycoQuant</span>
      <div className="flex gap-8 ml-12">
        <NavTab label="Analysis" active={activeView === "analysis"} onClick={() => onChangeView("analysis")} />
        <NavTab label="Ranking" active={activeView === "ranking"} onClick={() => onChangeView("ranking")} />
      </div>
      <div className="flex-1" />
      <button className="text-xs font-medium text-gray-500 border border-gray-300 rounded-md px-3 py-1.5 hover:bg-gray-50 transition-colors">
        Export &#8595;
      </button>
    </nav>
  );
}

function NavTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`bg-transparent border-none font-medium text-[13px] cursor-pointer py-[17px] border-b-2 transition-colors ${
        active
          ? "text-gray-900 border-b-blue-600"
          : "text-gray-400 border-b-transparent hover:text-gray-600"
      }`}
    >
      {label}
    </button>
  );
}
