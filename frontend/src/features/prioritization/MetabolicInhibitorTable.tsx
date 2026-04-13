import { useState } from "react";
import type { MetabolicInhibitor } from "@/lib/api";

interface Props {
  inhibitors: MetabolicInhibitor[];
}

export function MetabolicInhibitorTable({ inhibitors }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Inhibitor</th>
            <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Pathway</th>
            <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Target</th>
            <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Rank</th>
            <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Score</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {inhibitors.map((inh) => (
            <tr key={inh.name} className="group">
              <td className="px-4 py-3" colSpan={inh.name === expanded ? undefined : 1}>
                <div>
                  <button
                    onClick={() => setExpanded(expanded === inh.name ? null : inh.name)}
                    className="font-semibold text-[13px] text-gray-900 hover:text-blue-600 transition-colors text-left"
                  >
                    {inh.name}
                    <span className="text-[10px] text-gray-400 ml-1">{expanded === inh.name ? "\u25BE" : "\u25B8"}</span>
                  </button>
                  {expanded === inh.name && inh.mechanism && (
                    <div className="mt-2 text-[11px] text-gray-500 leading-relaxed max-w-md">
                      {inh.mechanism}
                    </div>
                  )}
                </div>
              </td>
              <td className="px-4 py-3 text-[13px] text-gray-500">{inh.pathway}</td>
              <td className="px-4 py-3 text-[13px] text-gray-900" style={{ fontFeatureSettings: "'tnum'" }}>{inh.target}</td>
              <td className="px-4 py-3 text-[13px] text-gray-900" style={{ fontFeatureSettings: "'tnum'" }}>{inh.pathway_rank ?? "\u2014"}</td>
              <td className="px-4 py-3 text-[13px] text-gray-700" style={{ fontFeatureSettings: "'tnum'" }}>
                {inh.pathway_score !== null ? inh.pathway_score.toFixed(3) : "\u2014"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
