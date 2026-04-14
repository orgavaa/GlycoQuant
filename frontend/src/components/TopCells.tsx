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
  // Max |z| across the selected cells anchors the diverging bar (0 → maxAbs on each side).
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
      {/* Scale legend — explicitly orients the reader on the diverging axis */}
      <div className="flex items-center gap-2 pb-2 mb-1 border-b border-gray-100 text-[9px] font-medium tracking-wider uppercase">
        <span className="text-blue-700">{"\u2190"} below image mean</span>
        <div className="flex-1 h-[3px] rounded-full bg-gradient-to-r from-blue-500 via-gray-200 to-red-500" />
        <span className="text-red-700">above image mean {"\u2192"}</span>
      </div>
      {cells.map((cell, i) => {
        const ms = (cell.mechano_score as number) ?? 0;
        const tag = phenotypeTag(cell);
        const isPos = ms >= 0;
        const halfPct = Math.min(50, (Math.abs(ms) / maxAbs) * 50);
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

            <div className="min-w-0">
              <div className="flex items-baseline gap-2 mb-1.5">
                <span
                  className={`text-[13px] font-semibold ${isPos ? "text-red-700" : "text-blue-700"}`}
                  style={{ fontFeatureSettings: "'tnum'" }}
                >
                  {fmtSigned(ms)}
                </span>
                <span className="text-[10px] text-gray-400 uppercase tracking-wider">mechano z</span>
                <span className="text-[10px] text-gray-300">·</span>
                <span className="text-[11px] text-gray-500" style={{ fontFeatureSettings: "'tnum'" }}>
                  glyco {fmt(cell.glycocalyx_pericellular_ratio as number | null)}
                </span>
              </div>

              {/* Diverging bar: anchored at image mean (centre). Blue grows leftward (below mean), red grows rightward (above mean). */}
              <div className="relative h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="absolute top-0 bottom-0 left-1/2 w-px bg-gray-300" aria-hidden />
                {isPos ? (
                  <div
                    className="absolute top-0 bottom-0 bg-red-500 rounded-r-full"
                    style={{ left: "50%", width: `${halfPct}%` }}
                  />
                ) : (
                  <div
                    className="absolute top-0 bottom-0 bg-blue-600 rounded-l-full"
                    style={{ right: "50%", width: `${halfPct}%` }}
                  />
                )}
              </div>

              {tag.text && (
                <div className={`mt-1.5 inline-flex text-[9px] font-medium px-1.5 py-0.5 rounded border ${tag.color} ${tag.bg}`}>
                  {tag.text}
                </div>
              )}
            </div>

            <ChevronRight
              size={14}
              strokeWidth={1.5}
              className="text-gray-300 group-hover:text-gray-500 transition-colors flex-shrink-0"
            />
          </div>
        );
      })}
      <div className="text-[10px] text-gray-400 mt-3 leading-relaxed">
        Mechano z-score is computed within this image (population mean = 0). The bar diverges from the centre: red <strong>right</strong> = above mean, blue <strong>left</strong> = below mean. Length is proportional to |z|.
      </div>
    </div>
  );
}
