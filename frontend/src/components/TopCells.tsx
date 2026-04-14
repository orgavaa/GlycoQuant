import type { CellFeatures } from "@/lib/canvas/extract";
import { fmt, fmtSigned } from "@/lib/utils";

interface Props {
  cells: CellFeatures[];
  onClick: (id: number) => void;
}

function phenotypeTag(cell: CellFeatures): { text: string; color: string } {
  const glyco = cell.glycocalyx_pericellular_ratio as number | undefined;
  const mechano = cell.mechano_score as number | undefined;

  if (glyco != null && mechano != null) {
    const highGlyco = glyco > 0.8;
    const lowGlyco = glyco < 0.4;
    const highMech = mechano > 1.0;
    const lowMech = mechano < -1.0;

    if (highGlyco && highMech) return { text: "thick glyco / high mechano", color: "text-emerald-600" };
    if (highGlyco && lowMech) return { text: "thick glyco / low mechano", color: "text-amber-600" };
    if (lowGlyco && highMech) return { text: "thin glyco / high mechano", color: "text-blue-600" };
    if (lowGlyco && lowMech) return { text: "thin glyco / low mechano", color: "text-red-600" };
    if (highMech) return { text: "high mechano", color: "text-blue-600" };
    if (lowMech) return { text: "low mechano", color: "text-red-600" };
    if (highGlyco) return { text: "thick glycocalyx", color: "text-emerald-600" };
    if (lowGlyco) return { text: "thin glycocalyx", color: "text-amber-600" };
  }
  return { text: "", color: "" };
}

export function TopCells({ cells, onClick }: Props) {
  return (
    <div>
      {cells.map((cell, i) => {
        const ms = cell.mechano_score as number;
        const tag = phenotypeTag(cell);
        return (
          <div
            key={cell.cell_id}
            onClick={() => onClick(Number(cell.cell_id))}
            className={`flex items-center py-2.5 cursor-pointer text-[12px] hover:bg-gray-50 transition-colors rounded-md px-2 -mx-2 ${
              i < cells.length - 1 ? "border-b border-gray-100" : ""
            }`}
          >
            <span className="text-gray-400 w-[36px] flex-shrink-0 font-medium">#{cell.cell_id}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className={`font-semibold ${ms >= 0 ? "text-red-600" : "text-blue-700"}`}
                  style={{ fontFeatureSettings: "'tnum'" }}
                >
                  m {fmtSigned(ms)}
                </span>
                <span className="text-gray-400 text-[11px]" style={{ fontFeatureSettings: "'tnum'" }}>
                  glyco {fmt(cell.glycocalyx_pericellular_ratio as number | null)}
                </span>
              </div>
              {tag.text && (
                <div className={`text-[9px] ${tag.color} mt-0.5`}>{tag.text}</div>
              )}
            </div>
          </div>
        );
      })}
      <div className="text-[9px] text-gray-400 mt-2">
        Deviation measured against within-image score distribution.
      </div>
    </div>
  );
}
