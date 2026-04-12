import { useMemo } from "react";
import { OverviewContent } from "./OverviewContent";
import { CellContent } from "./CellContent";
import { useJobStore } from "@/lib/jobStore";
import type { JobResult } from "@/lib/api";
import type { CellFeatures } from "@/lib/canvas/extract";

export function RightRail({ result, cells }: { result: JobResult; cells: CellFeatures[] }) {
  const selectedCellId = useJobStore(s => s.selectedCellId);
  const selectedCell = useMemo(() => selectedCellId != null ? cells.find(c => Number(c.cell_id) === selectedCellId) ?? null : null, [cells, selectedCellId]);

  return (
    <div style={{ width: 340, flexShrink: 0, borderLeft: "1px solid #e8e8e8", background: "#fff", overflowY: "auto", height: "100%", padding: "24px 20px" }}>
      {selectedCell ? <CellContent cell={selectedCell} cells={cells} /> : <OverviewContent result={result} cells={cells} />}
    </div>
  );
}
