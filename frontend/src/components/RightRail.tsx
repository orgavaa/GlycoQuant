import { useMemo } from "react";
import { X } from "lucide-react";
import { OverviewContent } from "./OverviewContent";
import { CellContent } from "./CellContent";
import { useJobStore } from "@/lib/jobStore";
import type { JobResult } from "@/lib/api";
import type { CellFeatures } from "@/lib/canvas/extract";

interface Props {
  result: JobResult;
  cells: CellFeatures[];
  onClose: () => void;
}

export function RightRail({ result, cells, onClose }: Props) {
  const selectedCellId = useJobStore(s => s.selectedCellId);
  const selectedCell = useMemo(
    () => selectedCellId != null ? cells.find(c => Number(c.cell_id) === selectedCellId) ?? null : null,
    [cells, selectedCellId],
  );

  return (
    <div className="h-full flex flex-col bg-white/95 backdrop-blur-xl border-l border-gray-200 shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 flex-shrink-0">
        <h2 className="text-[14px] font-semibold text-gray-900">
          {selectedCell ? `Cell #${selectedCell.cell_id}` : "Field summary"}
        </h2>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-md hover:bg-gray-100"
          title="Close panel"
        >
          <X size={16} strokeWidth={1.5} />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-5">
        {selectedCell
          ? <CellContent cell={selectedCell} cells={cells} />
          : <OverviewContent result={result} cells={cells} />
        }
      </div>
    </div>
  );
}
