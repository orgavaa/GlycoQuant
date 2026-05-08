import { useMemo } from "react";
import { Activity, X } from "lucide-react";
import { OverviewContent } from "./OverviewContent";
import { CellContent } from "./CellContent";
import { useJobStore } from "@/lib/jobStore";
import type { JobResult } from "@/lib/api";
import type { CellFeatures } from "@/lib/canvas/extract";
import type { DatasetContext, QcReport } from "@/lib/scientificGuards";

interface Props {
  result: JobResult;
  cells: CellFeatures[];
  onClose: () => void;
  datasetContext: DatasetContext;
  qcReport: QcReport;
}

export function RightRail({ result, cells, onClose, datasetContext, qcReport }: Props) {
  const selectedCellId = useJobStore(s => s.selectedCellId);
  const selectedCell = useMemo(
    () => selectedCellId != null ? cells.find(c => Number(c.cell_id) === selectedCellId) ?? null : null,
    [cells, selectedCellId],
  );

  return (
    <div className="flex h-full flex-col border-l border-gray-200 bg-gray-50 shadow-2xl">
      {/* Header */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-200 bg-white px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-700">
            <Activity size={15} strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase text-gray-400">Analysis inspector</div>
            <h2 className="truncate text-[14px] font-semibold text-gray-950">
              {selectedCell ? `Cell #${selectedCell.cell_id}` : "Field summary"}
            </h2>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-gray-950"
          title="Close panel"
        >
          <X size={16} strokeWidth={1.8} />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4">
        {selectedCell
          ? <CellContent cell={selectedCell} cells={cells} datasetContext={datasetContext} qcReport={qcReport} />
          : <OverviewContent result={result} cells={cells} datasetContext={datasetContext} qcReport={qcReport} />
        }
      </div>
    </div>
  );
}
