/**
 * MetabolicInhibitorTable — where each drug sits in the ranked panel.
 * Restyled for the Stitch design language.
 */
import type { MetabolicInhibitor } from "@/lib/api";

interface MetabolicInhibitorTableProps {
  inhibitors: MetabolicInhibitor[];
}

export function MetabolicInhibitorTable({
  inhibitors,
}: MetabolicInhibitorTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="bg-surface-container-high">
            <th className="p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Inhibitor</th>
            <th className="p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Pathway</th>
            <th className="p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Primary target</th>
            <th className="p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">In panel</th>
            <th className="p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Pathway rank</th>
            <th className="p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Pathway score</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/10">
          {inhibitors.map((inh) => (
            <tr key={inh.name} className="hover:bg-surface-container/40 transition-colors">
              <td className="p-3 font-headline font-semibold text-sm text-on-surface">
                {inh.name}
              </td>
              <td className="p-3 text-xs text-on-surface-variant">
                {inh.pathway}
              </td>
              <td className="p-3 text-sm font-mono text-on-surface">
                {inh.target}
              </td>
              <td className="p-3 text-sm">
                {inh.pathway_rank !== null ? (
                  <span className="text-primary font-bold">&#10003;</span>
                ) : (
                  <span className="text-on-surface-variant">—</span>
                )}
              </td>
              <td className="p-3 text-sm font-mono tabular-nums text-on-surface">
                {inh.pathway_rank ?? "—"}
              </td>
              <td className="p-3 text-sm font-mono tabular-nums text-on-surface">
                {inh.pathway_score !== null
                  ? inh.pathway_score.toFixed(3)
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
