/**
 * RankingTable — 22 glycocalyx genes sorted by pathway rank.
 * Restyled for the Stitch design: ghost-border table, no vertical
 * lines, uppercase tracking-widest headers, surface-container-high
 * header row, outline-variant/10 horizontal dividers.
 */
import { cn } from "@/lib/utils";
import type { PriorGeneEntry } from "@/lib/api";

interface RankingTableProps {
  genes: PriorGeneEntry[];
  geneformerAvailable: boolean;
  selectedGene: string | null;
  onSelectGene: (gene: string) => void;
  staticRankByGene?: Record<string, number | null> | null;
}

export function RankingTable({
  genes,
  geneformerAvailable,
  selectedGene,
  onSelectGene,
  staticRankByGene = null,
}: RankingTableProps) {
  const showDelta = staticRankByGene !== null;
  return (
    <div className="max-h-[520px] overflow-auto">
      <table className="w-full text-left">
        <thead className="sticky top-0 z-10 bg-surface-container-high">
          <tr>
            <th className="p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Gene</th>
            {geneformerAvailable && (
              <>
                <th className="p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">GF rank</th>
                <th className="p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">GF score</th>
              </>
            )}
            <th className="p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Path rank</th>
            <th className="p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Path score</th>
            {showDelta && (
              <th className="p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest" title="Change vs. static ranking">Δ</th>
            )}
            {geneformerAvailable && (
              <th className="p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">|ΔRank|</th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/10">
          {genes.map((g) => {
            let delta: number | null = null;
            if (showDelta && staticRankByGene) {
              const staticRank = staticRankByGene[g.gene];
              if (typeof staticRank === "number" && typeof g.pathway_rank === "number") {
                delta = staticRank - g.pathway_rank;
              }
            }
            return (
              <tr
                key={g.gene}
                className={cn(
                  "cursor-pointer hover:bg-surface-container/40 transition-colors",
                  selectedGene === g.gene && "bg-primary-container/20",
                )}
                onClick={() => onSelectGene(g.gene)}
              >
                <td className="p-3 font-headline font-semibold text-sm text-on-surface">{g.gene}</td>
                {geneformerAvailable && (
                  <>
                    <td className="p-3 text-sm font-mono tabular-nums text-on-surface-variant">{g.geneformer_rank ?? "—"}</td>
                    <td className="p-3"><ScoreBar value={g.geneformer_score} /></td>
                  </>
                )}
                <td className="p-3 text-sm font-mono tabular-nums text-on-surface">{g.pathway_rank ?? "—"}</td>
                <td className="p-3"><ScoreBar value={g.pathway_score} /></td>
                {showDelta && (
                  <td className="p-3"><DeltaCell delta={delta} /></td>
                )}
                {geneformerAvailable && (
                  <td className={cn(
                    "p-3 text-sm font-mono tabular-nums",
                    g.abs_rank_divergence && g.abs_rank_divergence >= 5
                      ? "font-bold text-amber-600"
                      : "text-on-surface-variant",
                  )}>
                    {g.abs_rank_divergence ?? "—"}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ScoreBar({ value }: { value: number | null }) {
  if (value === null) return <span className="text-on-surface-variant text-xs">—</span>;
  const pct = Math.min(100, value * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-1 w-16 overflow-hidden bg-surface-container-highest">
        <div className="absolute inset-y-0 left-0 bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-xs tabular-nums text-on-surface">{value.toFixed(3)}</span>
    </div>
  );
}

function DeltaCell({ delta }: { delta: number | null }) {
  if (delta === null) return <span className="text-on-surface-variant text-xs">—</span>;
  if (delta === 0) return <span className="text-on-surface-variant text-xs font-mono">0</span>;
  return (
    <span className={cn(
      "text-xs font-mono font-semibold tabular-nums",
      delta > 0 ? "text-emerald-600" : "text-error-stitch",
    )}>
      {delta > 0 ? "+" : ""}{delta}
    </span>
  );
}
