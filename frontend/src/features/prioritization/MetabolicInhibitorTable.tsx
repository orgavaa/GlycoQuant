/**
 * MetabolicInhibitorTable — where each drug sits in the ranked panel.
 * Clean white table design.
 */
import { Check } from "lucide-react";
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
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Inhibitor</th>
            <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Pathway</th>
            <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Primary target</th>
            <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">In panel</th>
            <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Pathway rank</th>
            <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Pathway score</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {inhibitors.map((inh) => (
            <tr key={inh.name} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3 font-semibold text-sm text-gray-900">
                {inh.name}
              </td>
              <td className="px-4 py-3 text-sm text-gray-500">
                {inh.pathway}
              </td>
              <td className="px-4 py-3 text-sm font-mono text-gray-900">
                {inh.target}
              </td>
              <td className="px-4 py-3 text-sm">
                {inh.pathway_rank !== null ? (
                  <Check className="w-4 h-4 text-emerald-500" />
                ) : (
                  <span className="text-gray-300">\u2014</span>
                )}
              </td>
              <td className="px-4 py-3 text-sm font-mono tabular-nums text-gray-900">
                {inh.pathway_rank ?? "\u2014"}
              </td>
              <td className="px-4 py-3 text-sm font-mono tabular-nums text-gray-700">
                {inh.pathway_score !== null
                  ? inh.pathway_score.toFixed(3)
                  : "\u2014"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
