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

    if (highGlyco && highMech) return { text: "WGA-high / high mechano", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" };
    if (highGlyco && lowMech) return { text: "WGA-high / low mechano", color: "text-amber-700", bg: "bg-amber-50 border-amber-200" };
    if (lowGlyco && highMech) return { text: "WGA-low / high mechano", color: "text-blue-700", bg: "bg-blue-50 border-blue-200" };
    if (lowGlyco && lowMech) return { text: "WGA-low / low mechano", color: "text-rose-700", bg: "bg-rose-50 border-rose-200" };
    if (highMech) return { text: "high mechano", color: "text-blue-700", bg: "bg-blue-50 border-blue-200" };
    if (lowMech) return { text: "low mechano", color: "text-rose-700", bg: "bg-rose-50 border-rose-200" };
    if (highGlyco) return { text: "WGA-high", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" };
    if (lowGlyco) return { text: "WGA-low", color: "text-amber-700", bg: "bg-amber-50 border-amber-200" };
  }
  return { text: "", color: "", bg: "" };
}

export function TopCells({ cells, onClick }: Props) {
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
      <div className="mb-1 flex items-center gap-2 border-b border-gray-100 pb-2 text-[9px] font-medium uppercase">
        <span className="text-gray-500">below mean</span>
        <div className="h-px flex-1 bg-gradient-to-r from-blue-500 via-gray-200 to-red-500" />
        <span className="text-gray-500">above mean</span>
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
            className={`group grid grid-cols-[44px,1fr,auto] items-center gap-3 rounded-md px-2 py-2.5 -mx-2 cursor-pointer transition hover:bg-gray-50 ${
              i < cells.length - 1 ? "border-b border-gray-100" : ""
            }`}
          >
            <span className="font-mono text-[11px] text-gray-400" style={{ fontFeatureSettings: "'tnum'" }}>
              #{cell.cell_id}
            </span>

            <div className="min-w-0">
              <div className="mb-1.5 flex items-baseline gap-2">
                <span
                  className={`text-[13px] font-semibold ${isPos ? "text-red-600" : "text-blue-600"}`}
                  style={{ fontFeatureSettings: "'tnum'" }}
                >
                  {fmtSigned(ms)}
                </span>
                <span className="text-[10px] uppercase text-gray-400">mechano z</span>
                <span className="text-[10px] text-gray-300">/</span>
                <span className="text-[11px] text-gray-500" style={{ fontFeatureSettings: "'tnum'" }}>
                  WGA {fmt(cell.glycocalyx_pericellular_ratio as number | null)}
                </span>
              </div>

              <div className="relative h-1.5 overflow-hidden rounded-full bg-gray-100">
                <div className="absolute bottom-0 top-0 left-1/2 w-px bg-gray-300" aria-hidden />
                {isPos ? (
                  <div
                    className="absolute bottom-0 top-0 rounded-r-full bg-red-500/85"
                    style={{ left: "50%", width: `${halfPct}%` }}
                  />
                ) : (
                  <div
                    className="absolute bottom-0 top-0 rounded-l-full bg-blue-600/85"
                    style={{ right: "50%", width: `${halfPct}%` }}
                  />
                )}
              </div>

              {tag.text && (
                <div className={`mt-1.5 inline-flex rounded border px-1.5 py-0.5 text-[9px] font-medium ${tag.color} ${tag.bg}`}>
                  {tag.text}
                </div>
              )}
            </div>

            <ChevronRight
              size={14}
              strokeWidth={1.5}
              className="flex-shrink-0 text-gray-300 transition group-hover:text-gray-500"
            />
          </div>
        );
      })}
      <div className="mt-3 text-[10px] leading-relaxed text-gray-400">
        Mechano z-score is computed within this image. The bar diverges from the image mean.
      </div>
    </div>
  );
}
