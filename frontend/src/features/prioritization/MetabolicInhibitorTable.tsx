import { useState } from "react";
import { ChevronDown, ChevronRight, FlaskConical, AlertTriangle } from "lucide-react";
import { Card } from "@/components/Card";
import type { MetabolicInhibitor } from "@/lib/api";

// Expected consequences for each inhibitor
const CONSEQUENCES: Record<string, { glyco: string; mechano: string; confidence: string }> = {
  "2-DG": {
    glyco: "Reduced glycocalyx biosynthesis via depleted UDP-GlcNAc pools.",
    mechano: "Indirect: reduced glycosylation of surface integrins and YAP regulators.",
    confidence: "Moderate — pleiotropic metabolic effects",
  },
  DON: {
    glyco: "Direct depletion of hexosamine pathway flux; thinner glycocalyx expected.",
    mechano: "Reduced O-GlcNAcylation of YAP and cytoskeletal regulators.",
    confidence: "Strong — rate-limiting enzyme targeted",
  },
  tunicamycin: {
    glyco: "Complete block of N-glycoprotein maturation; syndecans/glypicans affected.",
    mechano: "Disrupted integrin N-glycosylation alters mechanosensing.",
    confidence: "Strong — well-characterized mechanism",
  },
  "benzyl-GalNAc": {
    glyco: "Reduced mucin-type O-glycosylation; altered surface charge.",
    mechano: "Indirect: glycocalyx charge affects integrin accessibility.",
    confidence: "Moderate — partial specificity",
  },
  PUGNAc: {
    glyco: "Hyper-O-GlcNAcylation; paradoxical glycocalyx effects possible.",
    mechano: "Direct: YAP Ser109 O-GlcNAcylation altered; complex downstream effects.",
    confidence: "Moderate — gain-of-function, hard to predict",
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
            {/* Header row */}
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
                {isOpen ? <ChevronDown size={14} strokeWidth={1.5} className="text-gray-400" /> : <ChevronRight size={14} strokeWidth={1.5} className="text-gray-400" />}
              </div>
            </div>

            {/* Expanded detail */}
            {isOpen && (
              <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
                {/* Mechanism */}
                {inh.mechanism && (
                  <div className="text-[11px] text-gray-600 leading-relaxed">
                    {inh.mechanism}
                  </div>
                )}

                {/* Expected consequences */}
                {cons && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                    <div className="bg-emerald-50/50 border border-emerald-100 rounded-md p-2.5">
                      <div className="text-[9px] font-semibold text-emerald-600 uppercase tracking-wider mb-1">Expected glyco effect</div>
                      <div className="text-[10px] text-gray-600 leading-relaxed">{cons.glyco}</div>
                    </div>
                    <div className="bg-blue-50/50 border border-blue-100 rounded-md p-2.5">
                      <div className="text-[9px] font-semibold text-blue-600 uppercase tracking-wider mb-1">Expected mechano effect</div>
                      <div className="text-[10px] text-gray-600 leading-relaxed">{cons.mechano}</div>
                    </div>
                  </div>
                )}

                {/* Confidence note */}
                {cons && (
                  <div className="flex items-start gap-2 text-[9px] text-gray-400 italic">
                    <AlertTriangle size={10} strokeWidth={1.5} className="mt-0.5 flex-shrink-0" />
                    Evidence strength: {cons.confidence}
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
