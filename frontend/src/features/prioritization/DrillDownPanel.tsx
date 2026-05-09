import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AlertCircle, ArrowRight, ArrowLeftRight, FlaskConical, Target } from "lucide-react";
import { Card } from "@/components/Card";
import { PlotlyFigure } from "@/components/PlotlyFigure";
import { fetchDrillDown } from "@/lib/api";

// Literature-linked hypotheses for key glycan/pericellular matrix genes.
const INTERVENTION_EFFECTS: Record<string, { glyco: string; mechano: string }> = {
  CD44: {
    glyco: "CD44 perturbation may alter hyaluronan retention and pericellular HA organization. Direction and magnitude are cell-state dependent.",
    mechano: "May shift adhesion-, actin-, and YAP/TAZ-associated imaging readouts. Mechanophenotype score direction requires matched controls.",
  },
  SDC1: {
    glyco: "Perturbation may reduce heparan-sulfate-bearing proteoglycan signal and alter growth-factor sequestration at the cell surface.",
    mechano: "Can plausibly affect adhesion maturation and stress-fiber organization through integrin and growth-factor coupling.",
  },
  SDC4: {
    glyco: "Perturbation may alter syndecan-4-dependent spreading and pericellular proteoglycan organization.",
    mechano: "Reported links to PKC-alpha and Rho/ROCK signalling make actin coherence and adhesion features relevant readouts.",
  },
  GFPT1: {
    glyco: "GFPT1 perturbation changes hexosamine-biosynthesis flux and can affect N-/O-glycosylation of surface glycoproteins.",
    mechano: "Potentially alters integrin glycosylation and O-GlcNAc-sensitive mechanophenotype-associated readouts.",
  },
  OGT: {
    glyco: "OGT perturbation changes O-GlcNAc modification of nucleocytoplasmic proteins, not extracellular glycocalyx composition directly.",
    mechano: "May affect YAP/TAZ-associated transcriptional regulation through O-GlcNAc cycling; direction requires matched perturbation data.",
  },
  MGAT5: {
    glyco: "MGAT5 perturbation can alter N-glycan branching on integrins and growth-factor receptors.",
    mechano: "May shift integrin clustering dynamics and galectin-lattice-mediated receptor organization.",
  },
};

// Assay perturbation links; most are pathway-level and not gene-specific inhibitors.
const INHIBITOR_LINKS: Record<string, string[]> = {
  GFPT1: ["DON (hexosamine pathway inhibitor; pathway-level perturbation)"],
  OGT: ["PUGNAc / Thiamet-G (OGA inhibition; increases O-GlcNAc and is opposite-direction to OGT inhibition)"],
  MGAT5: ["tunicamycin (N-glycosylation inhibitor; broad and indirect)"],
  CD44: ["hyaluronidase or HA-blocking perturbation (closer CD44/HA axis test than benzyl-GalNAc)"],
};

interface DrillDownPanelProps {
  gene: string;
  mechanoSignature: string[];
  onGeneChange: (gene: string) => void;
  availableGenes: string[];
}

export function DrillDownPanel({ gene, mechanoSignature, onGeneChange, availableGenes }: DrillDownPanelProps) {
  const [selectedTarget, setSelectedTarget] = useState<string>(mechanoSignature[0] ?? "YAP1");
  const [showNetwork, setShowNetwork] = useState(true);

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
        <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Ranked gene</label>
        <select
          value={gene}
          onChange={(e) => onGeneChange(e.target.value)}
          className="bg-white border border-gray-200 rounded-md px-3 py-2 text-[13px] text-gray-900 cursor-pointer focus:outline-none focus:ring-1 focus:ring-gray-950"
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
            <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-950 rounded-full animate-spin" />
          </div>
        ) : drill ? (
          <PlotlyFigure figureJson={drill.heatmap_figure_json} />
        ) : null}
      </Card>

      {/* 2. Mechanistic hypothesis */}
      {effects && (
        <Card>
          <div className="flex items-center gap-2 mb-2">
            <Target size={14} strokeWidth={1.5} className="text-gray-400" />
            <h3 className="text-[13px] font-semibold text-gray-900">Mechanistic hypothesis</h3>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="bg-gray-50 border border-gray-200 rounded-md p-3">
              <div className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Pericellular glycan axis</div>
              <div className="text-[11px] text-gray-600 leading-relaxed">{effects.glyco}</div>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-md p-3">
              <div className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Mechanophenotype-associated readouts</div>
              <div className="text-[11px] text-gray-600 leading-relaxed">{effects.mechano}</div>
            </div>
          </div>
          <div className="mt-2 text-[9px] text-gray-400">
            Literature-linked prior. Experimental evidence is indirect until tested in the matched assay.
          </div>
        </Card>
      )}

      {/* 3. Assay perturbation links */}
      {inhibitors && inhibitors.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 mb-2">
            <FlaskConical size={14} strokeWidth={1.5} className="text-gray-400" />
            <h3 className="text-[13px] font-semibold text-gray-900">Assay perturbation links</h3>
          </div>
          <div className="space-y-1">
            {inhibitors.map(inh => (
              <div key={inh} className="flex items-center gap-2 text-[11px]">
                <div className="w-1.5 h-1.5 rounded-full bg-gray-400 flex-shrink-0" />
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
            className="ml-auto bg-white border border-gray-200 rounded-md px-2 py-1 text-[11px] text-gray-900 cursor-pointer focus:outline-none focus:ring-1 focus:ring-gray-950"
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
                {evidence.path_edges.map((e, i) => {
                  const isCurated = e.source === "curated";
                  return (
                    <div
                      key={i}
                      className={`flex items-center gap-2 text-[10px] ${
                        isCurated ? "text-amber-800" : "text-gray-500"
                      }`}
                    >
                      <span className={isCurated ? "text-amber-900 font-medium" : "text-gray-700"}>
                        {e.from}
                      </span>
                      <ArrowLeftRight
                        size={10}
                        strokeWidth={1.5}
                        className={isCurated ? "text-amber-400" : "text-gray-300"}
                      />
                      <span className={isCurated ? "text-amber-900 font-medium" : "text-gray-700"}>
                        {e.to}
                      </span>
                      {isCurated && (
                        <span
                          className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-800 text-[9px] font-semibold uppercase tracking-wider"
                          title={
                            e.reason
                              ? `Literature-traceable edge added below the STRING cutoff. ${e.reason}`
                              : "Literature-traceable edge added below the STRING cutoff."
                          }
                        >
                          CURATED
                          {e.pubmed_doi && (
                            <a
                              href={`https://doi.org/${e.pubmed_doi}`}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="underline font-normal lowercase"
                              onClick={(ev) => ev.stopPropagation()}
                            >
                              doi
                            </a>
                          )}
                        </span>
                      )}
                      <span
                        className="ml-auto"
                        style={{ fontFeatureSettings: "'tnum'" }}
                      >
                        conf {e.confidence.toFixed(3)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* 5. Network graph — re-fetched on gene change via useQuery(["drill", gene]). */}
      {drill?.network_figure_json && (
        <Card>
          <div
            className="flex items-center justify-between cursor-pointer"
            onClick={() => setShowNetwork(v => !v)}
          >
            <div className="flex items-center gap-2">
              <h3 className="text-[13px] font-semibold text-gray-900">Pathway network</h3>
              <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-gray-50 text-gray-700 border border-gray-200">
                {gene}
              </span>
              {drillQuery.isFetching && (
                <span className="w-3 h-3 border-2 border-gray-200 border-t-gray-950 rounded-full animate-spin" />
              )}
            </div>
            <span className="text-[12px] text-gray-300">{showNetwork ? "\u25BE" : "\u25B8"}</span>
          </div>
          {showNetwork && (
            <div className="mt-3">
              <p className="text-[10px] text-gray-400 mb-2">
                All shortest paths from <strong className="text-gray-600">{gene}</strong> to reachable mechanotransduction-associated signature targets. Edge width is proportional to STRING v12 confidence.
              </p>
              <PlotlyFigure figureJson={drill.network_figure_json} />
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
