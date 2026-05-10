import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import type { PriorGeneEntry } from "@/lib/api";

interface RankingTableProps {
  genes: PriorGeneEntry[];
  geneformerAvailable: boolean;
  selectedGene: string | null;
  onSelectGene: (gene: string) => void;
  staticRankByGene?: Record<string, number | null> | null;
}

export function RankingTable({ genes, geneformerAvailable, selectedGene, onSelectGene, staticRankByGene = null }: RankingTableProps) {
  const showDelta = staticRankByGene !== null;
  // Signed column only renders when at least one gene carries the field —
  // the static /priors response doesn't, the contextual /priors/contextual
  // response does.
  const showSigned = genes.some(
    (g) => g.pathway_signed_score !== null && g.pathway_signed_score !== undefined,
  );
  return (
    <div className="max-h-[520px] overflow-auto">
      <table className="w-full text-left">
        <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Gene</th>
            {geneformerAvailable && (
              <>
                <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">GF rank</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">GF score</th>
              </>
            )}
            <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">STRING rank</th>
            <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">STRING score</th>
            {showSigned && (
              <th
                className="px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider"
                title="Field-relative sidecar. Positive = close to over-activated adhesion-actomyosin-YAP/TAZ axes. Negative = close to under-activated axes."
              >
                Signed
              </th>
            )}
            {showDelta && (
              <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider" title="Change vs. static ranking">&Delta;</th>
            )}
            {geneformerAvailable && (
              <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">|&Delta;Rank|</th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {genes.map((g) => {
            let delta: number | null = null;
            if (showDelta && staticRankByGene) {
              const staticRank = staticRankByGene[g.gene];
              if (typeof staticRank === "number" && typeof g.pathway_rank === "number") {
                delta = staticRank - g.pathway_rank;
              }
            }
            const isSelected = selectedGene === g.gene;
            return (
              <tr
                key={g.gene}
                className={`cursor-pointer transition-colors ${isSelected ? "bg-gray-100" : "hover:bg-gray-50"}`}
                onClick={() => onSelectGene(g.gene)}
              >
                <td className="px-4 py-3 font-semibold text-[13px] text-gray-900">{g.gene}</td>
                {geneformerAvailable && (
                  <>
                    <td className="px-4 py-3 text-[13px] text-gray-500" style={{ fontFeatureSettings: "'tnum'" }}>{g.geneformer_rank ?? "\u2014"}</td>
                    <td className="px-4 py-3"><ScoreBar value={g.geneformer_score} /></td>
                  </>
                )}
                <td className="px-4 py-3 text-[13px] text-gray-900" style={{ fontFeatureSettings: "'tnum'" }}>{g.pathway_rank ?? "\u2014"}</td>
                <td className="px-4 py-3"><ScoreBar value={g.pathway_score} /></td>
                {showSigned && (
                  <td className="px-4 py-3">
                    <SignedCell value={g.pathway_signed_score ?? null} />
                  </td>
                )}
                {showDelta && <td className="px-4 py-3"><DeltaCell delta={delta} /></td>}
                {geneformerAvailable && (
                  <td className={`px-4 py-3 text-[13px] ${g.abs_rank_divergence && g.abs_rank_divergence >= 5 ? "font-bold text-amber-600" : "text-gray-500"}`} style={{ fontFeatureSettings: "'tnum'" }}>
                    {g.abs_rank_divergence ?? "\u2014"}
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

function SignedCell({ value }: { value: number | null }) {
  if (value === null || value === undefined) {
    return <span className="text-gray-400 text-[11px]">&mdash;</span>;
  }
  // |value| < 0.02 is treated as neutral — below the noise floor of the
  // weighted-median aggregator on typical images.
  const dir: "up" | "down" | "neutral" =
    Math.abs(value) < 0.02 ? "neutral" : value > 0 ? "up" : "down";
  const Icon = dir === "up" ? ArrowUp : dir === "down" ? ArrowDown : Minus;
  const color =
    dir === "up" ? "text-red-600" : dir === "down" ? "text-blue-600" : "text-gray-400";
  const tone =
    dir === "up" ? "text-red-700" : dir === "down" ? "text-blue-700" : "text-gray-500";
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px]"
      style={{ fontFeatureSettings: "'tnum'" }}
    >
      <Icon size={10} strokeWidth={2} className={color} />
      <span className={tone}>
        {value >= 0 ? "+" : ""}
        {value.toFixed(2)}
      </span>
    </span>
  );
}

function ScoreBar({ value }: { value: number | null }) {
  if (value === null) return <span className="text-gray-400 text-[11px]">&mdash;</span>;
  const pct = Math.min(100, value * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-1.5 w-16 overflow-hidden bg-gray-100 rounded-full">
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, background: "#111827" }} />
      </div>
      <span className="text-[11px] text-gray-700" style={{ fontFeatureSettings: "'tnum'" }}>{value.toFixed(3)}</span>
    </div>
  );
}

function DeltaCell({ delta }: { delta: number | null }) {
  if (delta === null) return <span className="text-gray-400 text-[11px]">&mdash;</span>;
  if (delta === 0) return <span className="text-gray-400 text-[11px]" style={{ fontFeatureSettings: "'tnum'" }}>0</span>;
  return (
    <span className={`text-[11px] font-semibold ${delta > 0 ? "text-emerald-600" : "text-red-500"}`} style={{ fontFeatureSettings: "'tnum'" }}>
      {delta > 0 ? "+" : ""}{delta}
    </span>
  );
}
