import { useMemo } from "react";
import { OverviewContent } from "./OverviewContent";
import { SingleCellContent } from "./SingleCellContent";
import { useJobStore } from "@/lib/jobStore";
import type { JobResult } from "@/lib/api";
import { type CellFeatures } from "@/lib/canvas/extract";

interface RightRailProps {
  result: JobResult;
  cells: CellFeatures[];
}

export function RightRail({ result, cells }: RightRailProps) {
  const selectedCellId = useJobStore(s => s.selectedCellId);

  const selectedCell = useMemo(() => {
    if (selectedCellId == null) return null;
    return cells.find(c => Number(c.cell_id) === selectedCellId) ?? null;
  }, [cells, selectedCellId]);

  return (
    <div style={{
      width: 340, flexShrink: 0, background: "#111",
      borderLeft: "1px solid #1a1a1a", overflowY: "auto", height: "100%",
      padding: "24px 20px",
    }}>
      {selectedCell ? (
        <SingleCellContent cell={selectedCell} cells={cells} />
      ) : (
        <OverviewContent result={result} cells={cells} />
      )}
    </div>
  );
}
