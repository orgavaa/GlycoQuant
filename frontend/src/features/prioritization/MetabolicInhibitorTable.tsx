import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, FlaskConical } from "lucide-react";
import type { MetabolicInhibitor } from "@/lib/api";

// Conservative interpretation notes for broad assay perturbation links.
const CONSEQUENCES: Record<string, { glyco: string; mechano: string; confidence: string }> = {
  "2-DG": {
    glyco: "May reduce carbon flux into UDP-GlcNAc pools, but it is a broad glycolysis and energy-stress perturbation.",
    mechano: "Mechanophenotype changes require viability, ATP/AMPK, and growth-rate controls.",
    confidence: "Pathway-level; broad confounding expected",
  },
  DON: {
    glyco: "Can suppress hexosamine-biosynthesis flux, but DON is a glutamine antagonist and is not GFPT1-specific.",
    mechano: "Any shift in adhesion/YAP/actin readouts must be separated from broad glutamine-metabolism effects.",
    confidence: "Pathway-level; not gene-specific",
  },
  tunicamycin: {
    glyco: "Blocks initiation of N-glycosylation and can perturb surface glycoprotein maturation.",
    mechano: "ER-stress/UPR and toxicity are major confounders for adhesion and YAP/TAZ imaging readouts.",
    confidence: "Mechanistically strong, biologically dirty",
  },
  "benzyl-GalNAc": {
    glyco: "Broad mucin-type O-glycosylation perturbation; not a clean CD44/HA-axis control.",
    mechano: "Direction requires matched marker data and rescue, not pathway annotation alone.",
    confidence: "Broad glycan perturbation",
  },
  PUGNAc: {
    glyco: "OGA inhibition increases O-GlcNAc; older and broader than Thiamet-G or GlcNAcstatin.",
    mechano: "Opposite-direction perturbation relative to OGT inhibition; phenotype direction cannot be inferred from proximity.",
    confidence: "Useful axis control; broad tool compound",
  },
};

interface Props {
  inhibitors: MetabolicInhibitor[];
}

export function MetabolicInhibitorTable({ inhibitors }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="space-y-3 p-4">
      {inhibitors.map((inh) => {
        const isOpen = expanded === inh.name;
        const cons = CONSEQUENCES[inh.name];

        return (
          <div
            key={inh.name}
            className={`border rounded-lg transition-colors ${isOpen ? "border-gray-200 bg-white" : "border-gray-100 bg-gray-50/50"}`}
          >
            <div
              className="flex items-center gap-3 px-4 py-3 cursor-pointer"
              onClick={() => setExpanded(isOpen ? null : inh.name)}
            >
              <FlaskConical size={14} strokeWidth={1.5} className="text-gray-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-gray-900">{inh.name}</div>
                <div className="text-[10px] text-gray-400">{inh.pathway} &middot; target: {inh.target}</div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                {inh.pathway_rank !== null && (
                  <span className="text-[11px] text-gray-500" style={{ fontFeatureSettings: "'tnum'" }}>
                    rank {inh.pathway_rank}
                  </span>
                )}
                {inh.pathway_score !== null && (
                  <span className="text-[11px] text-gray-400" style={{ fontFeatureSettings: "'tnum'" }}>
                    {inh.pathway_score.toFixed(3)}
                  </span>
                )}
                {isOpen ? (
                  <ChevronDown size={14} strokeWidth={1.5} className="text-gray-400" />
                ) : (
                  <ChevronRight size={14} strokeWidth={1.5} className="text-gray-400" />
                )}
              </div>
            </div>

            {isOpen && (
              <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
                {inh.mechanism && (
                  <div className="text-[11px] text-gray-600 leading-relaxed">
                    {inh.mechanism}
                  </div>
                )}

                {cons && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                    <div className="bg-emerald-50/50 border border-emerald-100 rounded-md p-2.5">
                      <div className="text-[9px] font-semibold text-emerald-600 uppercase tracking-wider mb-1">Glycan-axis caveat</div>
                      <div className="text-[10px] text-gray-600 leading-relaxed">{cons.glyco}</div>
                    </div>
                    <div className="bg-blue-50/50 border border-blue-100 rounded-md p-2.5">
                      <div className="text-[9px] font-semibold text-blue-600 uppercase tracking-wider mb-1">Mechanophenotype caveat</div>
                      <div className="text-[10px] text-gray-600 leading-relaxed">{cons.mechano}</div>
                    </div>
                  </div>
                )}

                {cons && (
                  <div className="flex items-start gap-2 text-[9px] text-gray-400">
                    <AlertTriangle size={10} strokeWidth={1.5} className="mt-0.5 flex-shrink-0" />
                    Interpretation note: {cons.confidence}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
