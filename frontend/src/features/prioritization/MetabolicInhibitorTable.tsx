import type { MetabolicInhibitor } from "@/lib/api";

interface Props {
  inhibitors: MetabolicInhibitor[];
}

export function MetabolicInhibitorTable({ inhibitors }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Inhibitor</th>
            <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Pathway</th>
            <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Primary target</th>
            <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">In panel</th>
            <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Pathway rank</th>
            <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Pathway score</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {inhibitors.map((inh) => (
            <tr key={inh.name} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3 font-semibold text-[13px] text-gray-900">{inh.name}</td>
              <td className="px-4 py-3 text-[13px] text-gray-500">{inh.pathway}</td>
              <td className="px-4 py-3 text-[13px] text-gray-900" style={{ fontFeatureSettings: "'tnum'" }}>{inh.target}</td>
              <td className="px-4 py-3 text-[13px]">
                {inh.pathway_rank !== null ? (
                  <span className="text-emerald-500">&#10003;</span>
                ) : (
                  <span className="text-gray-300">&mdash;</span>
                )}
              </td>
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
