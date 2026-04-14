import { useMemo } from "react";
import { ChevronRight } from "lucide-react";
import type { CellFeatures } from "@/lib/canvas/extract";
import { fmt, fmtSigned } from "@/lib/utils";

interface Props {
  cells: CellFeatures[];
  onClick: (id: number) => void;
}

function phenotypeTag(cell: CellFeatures): { text: string; color: string; bg: string } {
  const glyco = cell.glycocalyx_pericellular_ratio as number | undefined;
  const mechano = cell.mechano_score as number | undefined;

  if (glyco != null && mechano != null) {
    const highGlyco = glyco > 0.8;
    const lowGlyco = glyco < 0.4;
    const highMech = mechano > 1.0;
    const lowMech = mechano < -1.0;

    if (highGlyco && highMech) return { text: "thick glyco · high mechano", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" };
    if (highGlyco && lowMech) return { text: "thick glyco · low mechano", color: "text-amber-700", bg: "bg-amber-50 border-amber-200" };
    if (lowGlyco && highMech) return { text: "thin glyco · high mechano", color: "text-blue-700", bg: "bg-blue-50 border-blue-200" };
    if (lowGlyco && lowMech) return { text: "thin glyco · low mechano", color: "text-rose-700", bg: "bg-rose-50 border-rose-200" };
    if (highMech) return { text: "high mechano", color: "text-blue-700", bg: "bg-blue-50 border-blue-200" };
    if (lowMech) return { text: "low mechano", color: "text-rose-700", bg: "bg-rose-50 border-rose-200" };
    if (highGlyco) return { text: "thick glycocalyx", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" };
    if (lowGlyco) return { text: "thin glycocalyx", color: "text-amber-700", bg: "bg-amber-50 border-amber-200" };
  }
  return { text: "", color: "", bg: "" };
}

export function TopCells({ cells, onClick }: Props) {
  // Compute a magnitude scale to size the deviation bar
  const maxAbs = useMemo(() => {
    let m = 0;
    for (const c of cells) {
      const v = Math.abs((c.mechano_score as number) ?? 0);
      if (Number.isFinite(v) && v > m) m = v;
    }
    return m || 1;
  }, [cells]);

  return (
    <div>
      {cells.map((cell, i) => {
        const ms = (cell.mechano_score as number) ?? 0;
        const tag = phenotypeTag(cell);
        const isPos = ms >= 0;
        const barPct = Math.min(100, (Math.abs(ms) / maxAbs) * 100);
        const barColor = isPos ? "bg-red-500" : "bg-blue-600";
        return (
          <div
            key={cell.cell_id}
            onClick={() => onClick(Number(cell.cell_id))}
            className={`group grid grid-cols-[44px,1fr,auto] items-center gap-3 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors rounded-md px-2 -mx-2 ${
              i < cells.length - 1 ? "border-b border-gray-100" : ""
            }`}
          >
            {/* Cell ID */}
            <span className="text-[11px] text-gray-400 font-mono tracking-tight" style={{ fontFeatureSettings: "'tnum'" }}>
              #{cell.cell_id}
            </span>

            {/* Deviation bar + value + tag */}
            <div className="min-w-0">
              <div className="flex items-baseline gap-2 mb-1">
                <span
                  className={`text-[13px] font-semibold ${isPos ? "text-red-600" : "text-blue-700"}`}
                  style={{ fontFeatureSettings: "'tnum'" }}
                >
                  {fmtSigned(ms)}
                </span>
                <span className="text-[10px] text-gray-400 uppercase tracking-wider">mechano</span>
                <span className="text-[10px] text-gray-300">·</span>
                <span className="text-[11px] text-gray-500" style={{ fontFeatureSettings: "'tnum'" }}>
                  glyco {fmt(cell.glycocalyx_pericellular_ratio as number | null)}
                </span>
              </div>
              <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full ${barColor} transition-all`}
                  style={{ width: `${barPct}%` }}
                />
              </div>
              {tag.text && (
                <div className={`mt-1.5 inline-flex text-[9px] font-medium px-1.5 py-0.5 rounded border ${tag.color} ${tag.bg}`}>
                  {tag.text}
                </div>
              )}
            </div>

            {/* Affordance */}
            <ChevronRight
              size={14}
              strokeWidth={1.5}
              className="text-gray-300 group-hover:text-gray-500 transition-colors flex-shrink-0"
            />
          </div>
        );
      })}
      <div className="text-[10px] text-gray-400 mt-3 leading-relaxed">
        Mechano score is z-scored within this image. Bar length encodes |deviation| relative to the most extreme cell shown.
      </div>
    </div>
  );
}
