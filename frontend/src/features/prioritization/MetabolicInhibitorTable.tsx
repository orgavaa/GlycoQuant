import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { MetabolicInhibitor } from "@/lib/api";

interface MetabolicInhibitorTableProps {
  inhibitors: MetabolicInhibitor[];
}

export function MetabolicInhibitorTable({
  inhibitors,
}: MetabolicInhibitorTableProps) {
  return (
    <div className="rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Inhibitor</TableHead>
            <TableHead>Pathway</TableHead>
            <TableHead>Primary target</TableHead>
            <TableHead>In panel</TableHead>
            <TableHead>Pathway rank</TableHead>
            <TableHead>Pathway score</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {inhibitors.map((inh) => (
            <TableRow key={inh.name}>
              <TableCell className="font-sans font-semibold text-foreground">
                {inh.name}
              </TableCell>
              <TableCell className="font-sans text-xs text-muted-foreground">
                {inh.pathway}
              </TableCell>
              <TableCell>{inh.target}</TableCell>
              <TableCell>
                {inh.pathway_rank !== null ? (
                  <span className="text-brand">✓</span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>{inh.pathway_rank ?? "—"}</TableCell>
              <TableCell>
                {inh.pathway_score !== null
                  ? inh.pathway_score.toFixed(3)
                  : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
