import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { PriorGeneEntry } from "@/lib/api";

interface RankingTableProps {
  genes: PriorGeneEntry[];
  geneformerAvailable: boolean;
  selectedGene: string | null;
  onSelectGene: (gene: string) => void;
}

function ScoreBar({
  value,
  maxValue = 1,
}: {
  value: number | null;
  maxValue?: number;
}) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  const pct = Math.min(100, (value / maxValue) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-1.5 w-20 overflow-hidden rounded-full bg-muted">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-brand"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="font-mono text-xs tabular-nums">{value.toFixed(3)}</span>
    </div>
  );
}

export function RankingTable({
  genes,
  geneformerAvailable,
  selectedGene,
  onSelectGene,
}: RankingTableProps) {
  return (
    <div className="max-h-[520px] overflow-auto rounded-xl border">
      <Table>
        <TableHeader className="sticky top-0 z-10">
          <TableRow>
            <TableHead>Gene</TableHead>
            {geneformerAvailable && (
              <>
                <TableHead>GF rank</TableHead>
                <TableHead>GF score</TableHead>
              </>
            )}
            <TableHead>Path rank</TableHead>
            <TableHead>Path score</TableHead>
            {geneformerAvailable && <TableHead>|ΔRank|</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {genes.map((g) => (
            <TableRow
              key={g.gene}
              className={cn(
                "cursor-pointer",
                selectedGene === g.gene && "bg-primary/5",
              )}
              onClick={() => onSelectGene(g.gene)}
            >
              <TableCell className="font-sans font-semibold text-foreground">
                {g.gene}
              </TableCell>
              {geneformerAvailable && (
                <>
                  <TableCell>{g.geneformer_rank ?? "—"}</TableCell>
                  <TableCell>
                    <ScoreBar value={g.geneformer_score} />
                  </TableCell>
                </>
              )}
              <TableCell>{g.pathway_rank ?? "—"}</TableCell>
              <TableCell>
                <ScoreBar value={g.pathway_score} />
              </TableCell>
              {geneformerAvailable && (
                <TableCell
                  className={cn(
                    g.abs_rank_divergence && g.abs_rank_divergence >= 5
                      ? "font-bold text-[hsl(var(--warning))]"
                      : "",
                  )}
                >
                  {g.abs_rank_divergence ?? "—"}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
