import type { CellFeatures } from "@/lib/canvas/extract";
import { fmt, fmtSigned } from "@/lib/utils";

interface Props {
  cells: CellFeatures[];
  onClick: (id: number) => void;
}

export function TopCells({ cells, onClick }: Props) {
  return (
    <div>
      {cells.map((cell, i) => {
        const ms = cell.mechano_score as number;
        return (
          <div
            key={cell.cell_id}
            onClick={() => onClick(Number(cell.cell_id))}
            className={`flex items-center py-2.5 cursor-pointer text-[12px] hover:bg-gray-50 transition-colors rounded-md px-2 -mx-2 ${
              i < cells.length - 1 ? "border-b border-gray-100" : ""
            }`}
          >
            <span className="text-gray-400 w-[36px] flex-shrink-0 font-medium">#{cell.cell_id}</span>
            <span
              className={`font-semibold ${ms >= 0 ? "text-red-600" : "text-blue-700"}`}
              style={{ fontFeatureSettings: "'tnum'" }}
            >
              m {fmtSigned(ms)}
            </span>
            <span className="text-gray-400 ml-auto text-[11px]" style={{ fontFeatureSettings: "'tnum'" }}>
              glyco {fmt(cell.glycocalyx_pericellular_ratio as number | null)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
