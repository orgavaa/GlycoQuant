import { Download } from "lucide-react";
import { exportUrl } from "@/lib/api";
import { useJobStore } from "@/lib/jobStore";

export type ViewId = "analysis" | "ranking" | "methods";

interface TopBarProps {
  activeView: ViewId;
  onChangeView: (v: ViewId) => void;
}

export function TopBar({ activeView, onChangeView }: TopBarProps) {
  const latestJobId = useJobStore((s) => s.latestJobId);
  const canExport = !!latestJobId;
  const handleExport = () => {
    if (!latestJobId) return;
    // The endpoint returns a StreamingResponse with
    // Content-Disposition: attachment — a top-level assign triggers
    // the browser's native download flow and preserves the suggested
    // filename ("glycoquant-<id8>-<timestamp>.zip").
    window.location.assign(exportUrl(latestJobId));
  };
  return (
    <nav className="h-14 bg-white border-b border-gray-200 flex items-center px-6 flex-shrink-0 z-50">
      <img src="/logo.png" alt="GlycoQuant" className="h-7 w-7 rounded mr-2" draggable={false} />
      <span className="font-bold text-[16px] text-gray-900 tracking-[-0.3px]">GlycoQuant</span>
      <div className="flex gap-8 ml-12">
        <NavTab label="Analysis" active={activeView === "analysis"} onClick={() => onChangeView("analysis")} />
        <NavTab label="Ranking" active={activeView === "ranking"} onClick={() => onChangeView("ranking")} />
        <NavTab label="Methods" active={activeView === "methods"} onClick={() => onChangeView("methods")} />
      </div>
      <div className="flex-1" />
      <button
        onClick={handleExport}
        disabled={!canExport}
        title={
          canExport
            ? "Download per-cell features, results summary, and provenance bundle as a zip"
            : "Run an analysis first — the export bundle needs a completed job"
        }
        className={`flex items-center gap-1.5 text-xs font-medium border rounded-md px-3 py-1.5 transition-colors ${
          canExport
            ? "text-gray-700 border-gray-300 hover:bg-gray-50"
            : "text-gray-400 border-gray-200 cursor-not-allowed"
        }`}
      >
        <Download size={14} strokeWidth={1.5} />
        Export
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
