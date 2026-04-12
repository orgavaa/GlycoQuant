import type { CellFeatures } from "@/lib/canvas/extract";
import { fmt, fmtSigned } from "@/lib/canvas/extract";

interface Props { cells: CellFeatures[]; onClick: (id: number) => void; }

export function TopCells({ cells, onClick }: Props) {
  return (
    <div>
      {cells.map(cell => {
        const ms = cell.mechano_score as number;
        return (
          <div key={cell.cell_id} onClick={() => onClick(Number(cell.cell_id))} style={{
            display: "flex", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f0f0f0",
            cursor: "pointer", fontSize: 12,
          }}>
            <span style={{ color: "#999", width: 36, flexShrink: 0, fontWeight: 500 }}>#{cell.cell_id}</span>
            <span style={{ fontWeight: 600, color: ms >= 0 ? "#c62828" : "#2166ac", fontFeatureSettings: "'tnum'" }}>m {fmtSigned(ms)}</span>
            <span style={{ color: "#999", marginLeft: "auto", fontSize: 11, fontFeatureSettings: "'tnum'" }}>glyco {fmt(cell.glycocalyx_pericellular_ratio as number | null)}</span>
          </div>
        );
      })}
    </div>
  );
}
