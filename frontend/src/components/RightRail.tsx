import { useMemo } from "react";
import { OverviewContent } from "./OverviewContent";
import { CellContent } from "./CellContent";
import { useJobStore } from "@/lib/jobStore";
import type { JobResult } from "@/lib/api";
import type { CellFeatures } from "@/lib/canvas/extract";

interface Props {
  result: JobResult;
  cells: CellFeatures[];
}

export function RightRail({ result, cells }: Props) {
  const selectedCellId = useJobStore(s => s.selectedCellId);
  const selectedCell = useMemo(
    () => selectedCellId != null ? cells.find(c => Number(c.cell_id) === selectedCellId) ?? null : null,
    [cells, selectedCellId],
  );

  return (
    <div className="w-[400px] flex-shrink-0 border-l border-gray-200 bg-gray-50 overflow-y-auto h-full p-4">
      {selectedCell
        ? <CellContent cell={selectedCell} cells={cells} />
        : <OverviewContent result={result} cells={cells} />
      }
    </div>
  );
}
