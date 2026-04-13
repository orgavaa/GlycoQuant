import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AlertCircle, ArrowRight, FlaskConical, Target } from "lucide-react";
import { Card } from "@/components/Card";
import { PlotlyFigure } from "@/components/PlotlyFigure";
import { fetchDrillDown } from "@/lib/api";

// Known intervention effects for key glycocalyx genes
const INTERVENTION_EFFECTS: Record<string, { glyco: string; mechano: string }> = {
  CD44: {
    glyco: "Reduced hyaluronan anchoring, thinner pericellular coat, decreased glycocalyx heterogeneity.",
    mechano: "Decreased integrin clustering, reduced YAP nuclear translocation, lower mechano score.",
  },
  SDC1: {
    glyco: "Loss of heparan-sulfate chains, reduced pericellular matrix density, altered growth factor sequestration.",
    mechano: "Disrupted focal adhesion maturation, reduced stress fiber coherence.",
  },
  SDC4: {
    glyco: "Diminished syndecan-4 mediated cell spreading, reduced pericellular ratio.",
    mechano: "Impaired PKC-alpha signalling, reduced Rho/ROCK activation, lower actin coherence.",
  },
  GFPT1: {
    glyco: "Reduced UDP-GlcNAc flux, decreased N- and O-glycosylation of surface glycoproteins.",
    mechano: "Reduced O-GlcNAcylation of YAP (Ser109), altered integrin glycosylation and clustering.",
  },
  OGT: {
    glyco: "Reduced O-GlcNAc modification of nucleocytoplasmic glycoproteins.",
    mechano: "Direct effect on YAP O-GlcNAcylation; altered transcriptional mechanoresponse.",
  },
  MGAT5: {
    glyco: "Reduced N-glycan branching on integrins and growth factor receptors.",
    mechano: "Altered integrin clustering dynamics, modified galectin lattice formation.",
  },
};

// Metabolic inhibitor links
const INHIBITOR_LINKS: Record<string, string[]> = {
  GFPT1: ["DON (hexosamine pathway inhibitor)"],
  OGT: ["PUGNAc (O-GlcNAcase inhibitor, indirect)"],
  MGAT5: ["tunicamycin (N-glycosylation inhibitor, indirect)"],
  CD44: ["benzyl-GalNAc (O-glycosylation inhibitor, partial)"],
};

interface DrillDownPanelProps {
  gene: string;
  mechanoSignature: string[];
  onGeneChange: (gene: string) => void;
  availableGenes: string[];
}

export function DrillDownPanel({ gene, mechanoSignature, onGeneChange, availableGenes }: DrillDownPanelProps) {
  const [selectedTarget, setSelectedTarget] = useState<string>(mechanoSignature[0] ?? "YAP1");
  const [showNetwork, setShowNetwork] = useState(false);

  const drillQuery = useQuery({
    queryKey: ["drill", gene],
    queryFn: () => fetchDrillDown(gene),
    enabled: !!gene,
  });

  const drill = drillQuery.data;
  const evidence = drill?.evidence_per_target[selectedTarget];
  const effects = INTERVENTION_EFFECTS[gene];
  const inhibitors = INHIBITOR_LINKS[gene];

  return (
    <div className="space-y-5">
      {/* Gene selector */}
      <div className="flex items-center gap-4">
        <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Glycocalyx gene</label>
        <select
          value={gene}
          onChange={(e) => onGeneChange(e.target.value)}
          className="bg-white border border-gray-200 rounded-md px-3 py-2 text-[13px] text-gray-900 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {availableGenes.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <span className="text-[9px] px-2 py-0.5 rounded bg-gray-50 text-gray-400 border border-gray-100 ml-auto">
          Precomputed prior
        </span>
      </div>

      {/* 1. Per-target proximity heatmap — compact, full width */}
      <Card>
        <h3 className="text-[13px] font-semibold text-gray-900 mb-0.5">Per-target proximity</h3>
        <p className="text-[10px] text-gray-400 mb-2">
          Proximity of {gene} to each mechanotransduction target in STRING v12. Dark = close.
        </p>
        {drillQuery.isLoading ? (
          <div className="flex h-[100px] items-center justify-center">
            <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : drill ? (
          <PlotlyFigure figureJson={drill.heatmap_figure_json} />
        ) : null}
      </Card>

      {/* 2. Expected intervention effect */}
      {effects && (
        <Card>
          <div className="flex items-center gap-2 mb-2">
            <Target size={14} strokeWidth={1.5} className="text-gray-400" />
            <h3 className="text-[13px] font-semibold text-gray-900">Expected intervention effect</h3>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="bg-emerald-50/50 border border-emerald-100 rounded-md p-3">
              <div className="text-[9px] font-semibold text-emerald-600 uppercase tracking-wider mb-1">Glycocalyx</div>
              <div className="text-[11px] text-gray-600 leading-relaxed">{effects.glyco}</div>
            </div>
            <div className="bg-blue-50/50 border border-blue-100 rounded-md p-3">
              <div className="text-[9px] font-semibold text-blue-600 uppercase tracking-wider mb-1">Mechanotransduction</div>
              <div className="text-[11px] text-gray-600 leading-relaxed">{effects.mechano}</div>
            </div>
          </div>
          <div className="mt-2 text-[9px] text-gray-400 italic">
            Based on published literature. Experimental evidence indirect.
          </div>
        </Card>
      )}

      {/* 3. Metabolic inhibitor links */}
      {inhibitors && inhibitors.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 mb-2">
            <FlaskConical size={14} strokeWidth={1.5} className="text-gray-400" />
            <h3 className="text-[13px] font-semibold text-gray-900">Metabolic inhibitor links</h3>
          </div>
          <div className="space-y-1">
            {inhibitors.map(inh => (
              <div key={inh} className="flex items-center gap-2 text-[11px]">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                <span className="text-gray-600">{inh}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 4. Shortest path evidence for selected target */}
      <Card>
        <div className="flex items-center gap-3 mb-3">
          <h3 className="text-[13px] font-semibold text-gray-900">Path evidence</h3>
          <select
            value={selectedTarget}
            onChange={(e) => setSelectedTarget(e.target.value)}
            className="ml-auto bg-white border border-gray-200 rounded-md px-2 py-1 text-[11px] text-gray-900 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {mechanoSignature.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        {!evidence ? (
          <p className="text-[12px] text-gray-500">No pathway evidence for {gene} → {selectedTarget}</p>
        ) : evidence.path.length === 0 ? (
          <div className="flex items-start gap-2 text-[12px] text-gray-500">
            <AlertCircle size={14} strokeWidth={1.5} className="text-gray-400 mt-0.5 flex-shrink-0" />
            {gene} → {selectedTarget} unreachable in STRING v12 at the current confidence threshold.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {evidence.path.map((node, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  <span className="px-2 py-0.5 bg-gray-50 border border-gray-200 rounded text-[11px] font-medium text-gray-900">{node}</span>
                  {i < evidence.path.length - 1 && <ArrowRight size={12} strokeWidth={1.5} className="text-gray-300" />}
                </span>
              ))}
            </div>
            <div className="text-[11px] text-gray-500">
              Dijkstra distance: <span className="font-medium text-gray-800" style={{ fontFeatureSettings: "'tnum'" }}>{evidence.distance?.toFixed(3) ?? "\u2014"}</span>
            </div>
            {evidence.path_edges.length > 0 && (
              <div className="space-y-1">
                {evidence.path_edges.map((e, i) => (
                  <div key={i} className="flex items-center gap-2 text-[10px] text-gray-500">
                    <span className="text-gray-700">{e.from}</span>
                    <span className="text-gray-300">\u2194</span>
                    <span className="text-gray-700">{e.to}</span>
                    <span className="ml-auto" style={{ fontFeatureSettings: "'tnum'" }}>conf {e.confidence.toFixed(3)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* 5. Network graph (optional, collapsed by default) */}
      {drill?.network_figure_json && (
        <Card>
          <div
            className="flex items-center justify-between cursor-pointer"
            onClick={() => setShowNetwork(v => !v)}
          >
            <h3 className="text-[13px] font-semibold text-gray-900">Pathway network</h3>
            <span className="text-[12px] text-gray-300">{showNetwork ? "\u25BE" : "\u25B8"}</span>
          </div>
          {showNetwork && (
            <div className="mt-3">
              <p className="text-[10px] text-gray-400 mb-2">
                All shortest paths from {gene} to reachable targets. Edge width proportional to STRING confidence.
              </p>
              <PlotlyFigure figureJson={drill.network_figure_json} />
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
