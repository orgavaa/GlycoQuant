import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { AlertCircle, FlaskConical, Network, Table2, Target } from "lucide-react";
import { Card } from "@/components/Card";
import { PlotlyFigure } from "@/components/PlotlyFigure";
import { fetchDrillDown, type PathwayEdge } from "@/lib/api";

const TARGET_ALIASES: Record<string, string> = {
  YAP1: "YAP1",
  WWTR1: "WWTR1/TAZ",
  CTGF: "CCN2/CTGF",
  CCN2: "CCN2/CTGF",
  CYR61: "CYR61/CCN1",
  ANKRD1: "ANKRD1",
  PTK2: "PTK2/FAK",
};

interface DrillDownPanelProps {
  gene: string;
  mechanoSignature: string[];
  targetMetadata: Record<string, { alias: string; signature_layer: string; color: string }>;
  onGeneChange: (gene: string) => void;
  availableGenes: string[];
  selectedGeneClass?: string | null;
}

export function DrillDownPanel({
  gene,
  mechanoSignature,
  targetMetadata,
  onGeneChange,
  availableGenes,
  selectedGeneClass,
}: DrillDownPanelProps) {
  const [selectedTarget, setSelectedTarget] = useState<string>("YAP1");
  // Always show every reachable target path. Selection only changes
  // which path is highlighted, so the network always reads as a GRN
  // overview rather than a single shortest-path browser.
  const networkMode: "all" = "all";
  const [showNetwork, setShowNetwork] = useState(true);

  useEffect(() => {
    if (!mechanoSignature.includes(selectedTarget)) {
      setSelectedTarget(mechanoSignature.includes("YAP1") ? "YAP1" : mechanoSignature[0] ?? "");
    }
  }, [mechanoSignature, selectedTarget]);

  const drillQuery = useQuery({
    queryKey: ["drill", gene, selectedTarget, networkMode],
    queryFn: () => fetchDrillDown(gene, { target: selectedTarget, networkMode }),
    enabled: !!gene && !!selectedTarget,
  });

  const drill = drillQuery.data;
  const evidence = drill?.evidence_per_target[selectedTarget];
  const perturbationSections = useMemo(
    () => getPerturbationSections(gene, selectedGeneClass),
    [gene, selectedGeneClass],
  );
  const path = evidence?.path ?? [];
  const pathDisplay = path.map(node => targetMetadata[node]?.alias ?? TARGET_ALIASES[node] ?? node);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Ranked gene</label>
        <select
          value={gene}
          onChange={(e) => onGeneChange(e.target.value)}
          className="bg-white border border-gray-200 rounded-md px-3 py-2 text-[13px] text-gray-900 cursor-pointer focus:outline-none focus:ring-1 focus:ring-gray-950"
        >
          {availableGenes.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        {selectedGeneClass && (
          <span className="text-[10px] px-2 py-1 rounded bg-gray-50 text-gray-600 border border-gray-200">
            {selectedGeneClass}
          </span>
        )}
        <span className="text-[9px] px-2 py-0.5 rounded bg-gray-50 text-gray-400 border border-gray-100 ml-auto">
          Precomputed prior
        </span>
      </div>

      <Card>
        <h3 className="text-[13px] font-semibold text-gray-900 mb-0.5">Per-target STRING proximity</h3>
        <p className="text-[10px] text-gray-500 mb-3 leading-relaxed">
          STRING functional-association proximity from {gene} to each of the 15 mechanosensitive signature targets,
          grouped on the right by signature layer. Filled lollipops are reachable under the retained confidence-threshold graph;
          dashed rows tagged "unreachable" have no retained STRING path.
        </p>
        {drillQuery.isLoading ? (
          <div className="flex h-[200px] items-center justify-center">
            <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-950 rounded-full animate-spin" />
          </div>
        ) : drill ? (
          <PlotlyFigure figureJson={drill.heatmap_figure_json} />
        ) : null}
      </Card>

      <Card>
        <div className="flex items-center gap-2 mb-2">
          <Target size={14} strokeWidth={1.5} className="text-gray-400" />
          <h3 className="text-[13px] font-semibold text-gray-900">Mechanistic hypothesis</h3>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="bg-gray-50 border border-gray-200 rounded-md p-3">
            <div className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Pericellular glycan axis</div>
            <div className="text-[11px] text-gray-600 leading-relaxed">{hypothesisForGene(gene, selectedGeneClass).glycan}</div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-md p-3">
            <div className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Mechanophenotype-associated readouts</div>
            <div className="text-[11px] text-gray-600 leading-relaxed">{hypothesisForGene(gene, selectedGeneClass).readout}</div>
          </div>
        </div>
        <div className="mt-2 text-[9px] text-gray-400">
          Literature-linked prior. Experimental evidence is indirect until tested in the matched assay.
        </div>
      </Card>

      {perturbationSections.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <FlaskConical size={14} strokeWidth={1.5} className="text-gray-400" />
            <h3 className="text-[13px] font-semibold text-gray-900">Assay perturbation links</h3>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {perturbationSections.map(section => (
              <div key={section.title} className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <div className="text-[10px] font-semibold text-gray-900 mb-2">{section.title}</div>
                <div className="space-y-1.5">
                  {section.items.map(item => (
                    <div key={item} className="flex gap-2 text-[11px] text-gray-600 leading-relaxed">
                      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-gray-400 flex-shrink-0" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[10px] text-gray-600 border-l-2 border-gray-200 pl-2">
            Broad metabolic drugs are assay perturbation links, not clean gene-specific controls.
          </p>
        </Card>
      )}

      <Card>
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <h3 className="text-[13px] font-semibold text-gray-900">STRING proximity evidence</h3>
          <select
            value={selectedTarget}
            onChange={(e) => setSelectedTarget(e.target.value)}
            className="ml-auto bg-white border border-gray-200 rounded-md px-2 py-1 text-[11px] text-gray-900 cursor-pointer focus:outline-none focus:ring-1 focus:ring-gray-950"
          >
            {mechanoSignature.map(m => (
              <option key={m} value={m}>{targetMetadata[m]?.alias ?? TARGET_ALIASES[m] ?? m}</option>
            ))}
          </select>
        </div>

        {!evidence ? (
          <p className="text-[12px] text-gray-500">No retained STRING path to this target at the current confidence threshold.</p>
        ) : path.length === 0 ? (
          <div className="flex items-start gap-2 text-[12px] text-gray-500">
            <AlertCircle size={14} strokeWidth={1.5} className="text-gray-400 mt-0.5 flex-shrink-0" />
            No retained STRING path to {targetMetadata[selectedTarget]?.alias ?? selectedTarget} at the current confidence threshold.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {pathDisplay.map((node, i) => (
                <span key={`${node}-${i}`} className="flex items-center gap-1.5">
                  <span className="px-2 py-0.5 bg-gray-50 border border-gray-200 rounded text-[11px] font-medium text-gray-900">{node}</span>
                  {i < pathDisplay.length - 1 && <span className="text-[11px] font-semibold text-gray-300">--</span>}
                </span>
              ))}
            </div>
            <div className="text-[11px] text-gray-500">
              Network distance: <span className="font-medium text-gray-800" style={{ fontFeatureSettings: "'tnum'" }}>{(evidence.network_distance ?? evidence.distance)?.toFixed(3) ?? "\u2014"}</span>
              {typeof evidence.path_length === "number" && (
                <span className="ml-3">Path length: <span className="font-medium text-gray-800">{evidence.path_length}</span></span>
              )}
            </div>
            <p className="text-[10px] text-gray-400">
              Network distance: sum of -log(STRING confidence) edge costs; computational proximity, not biological order.
            </p>
            {evidence.path_edges.length > 0 && <EdgeEvidenceTable edges={evidence.path_edges} />}
            <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-[10px] leading-relaxed text-gray-700">
              Undirected STRING functional association. Path layout, edge order, and shortest paths do not imply causal signalling, temporal order, or cell-type-specific mechanism.
            </div>
          </div>
        )}
      </Card>

      {drill?.network_figure_json && (
        <Card>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="flex items-center gap-2"
              onClick={() => setShowNetwork(v => !v)}
            >
              <Network size={14} strokeWidth={1.5} className="text-gray-400" />
              <h3 className="text-[13px] font-semibold text-gray-900">STRING proximity map</h3>
              <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-gray-50 text-gray-700 border border-gray-200">
                {gene}
              </span>
              {drillQuery.isFetching && <span className="w-3 h-3 border-2 border-gray-200 border-t-gray-950 rounded-full animate-spin" />}
            </button>
            <span className="ml-auto text-[10px] text-gray-400">
              Highlighted: {targetMetadata[selectedTarget]?.alias ?? TARGET_ALIASES[selectedTarget] ?? selectedTarget}
            </span>
          </div>
          {showNetwork && (
            <div className="mt-3">
              <p className="text-[10px] text-gray-500 mb-3 leading-relaxed">
                Every reachable signature target is drawn at once. The selected target above sets which path renders at full strength; the rest of the candidate's STRING neighbourhood stays visible but dim. No arrows. Edge width encodes STRING confidence; node color encodes biological role.
              </p>
              <PlotlyFigure figureJson={drill.network_figure_json} />
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function EdgeEvidenceTable({ edges }: { edges: PathwayEdge[] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-gray-200">
      <table className="min-w-full text-[10px]">
        <thead className="bg-gray-50 text-gray-500 uppercase tracking-wider">
          <tr>
            <th className="text-left font-semibold px-2 py-2">Edge</th>
            <th className="text-right font-semibold px-2 py-2">Confidence</th>
            <th className="text-right font-semibold px-2 py-2">Edge cost</th>
            <th className="text-left font-semibold px-2 py-2">Source</th>
          </tr>
        </thead>
        <tbody>
          {edges.map((edge, i) => (
            <tr key={`${edge.from}-${edge.to}-${i}`} className="border-t border-gray-100">
              <td className="px-2 py-2 font-medium text-gray-800">{edge.from} -- {edge.to}</td>
              <td className="px-2 py-2 text-right text-gray-600" style={{ fontFeatureSettings: "'tnum'" }}>{edge.confidence.toFixed(3)}</td>
              <td className="px-2 py-2 text-right text-gray-600" style={{ fontFeatureSettings: "'tnum'" }}>{edge.edge_cost?.toFixed(3) ?? "\u2014"}</td>
              <td className="px-2 py-2">
                <div className="flex flex-wrap items-center gap-1">
                  <span className="rounded border border-gray-200 bg-white px-1.5 py-0.5 text-gray-600">
                    {edge.source === "curated" ? "CURATED" : "STRING combined"}
                  </span>
                  {edge.evidence_channels?.map(channel => (
                    <span key={channel} className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-gray-500">{channel}</span>
                  ))}
                  {edge.pubmed_doi && (
                    <a
                      href={`https://doi.org/${edge.pubmed_doi}`}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-blue-700 underline"
                    >
                      DOI
                    </a>
                  )}
                  {edge.reason && <span className="text-gray-400">{edge.reason}</span>}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function hypothesisForGene(gene: string, geneClass?: string | null): { glycan: string; readout: string } {
  if (gene === "CD44") {
    return {
      glycan: "CD44 perturbation may alter hyaluronan retention, HA coat organization, and pericellular matrix anchoring. Direction and magnitude are cell-state dependent.",
      readout: "May shift adhesion-, actin-, and YAP/TAZ-associated imaging readouts. Mechanophenotype score direction requires matched controls.",
    };
  }
  if (geneClass === "HSPG core proteins") {
    return {
      glycan: "Perturbation may alter heparan-sulfate-bearing proteoglycan organization and growth-factor presentation at the cell surface.",
      readout: "Adhesion maturation, actin organization, and YAP/TAZ-associated readouts are plausible endpoints; direction requires matched perturbation data.",
    };
  }
  if (geneClass === "HS biosynthesis/remodeling") {
    return {
      glycan: "Perturbation may change heparan sulfate chain length, sulfation, or remodeling rather than total pericellular coat alone.",
      readout: "Effects on adhesion or mechanosensitive transcriptional readouts must be separated from growth-factor and viability effects.",
    };
  }
  if (geneClass === "N/O-glycosylation and HBP/O-GlcNAc") {
    return {
      glycan: "Perturbation affects broad glycosylation or nutrient-sensing pathways and may not be specific to the extracellular glycocalyx.",
      readout: "Mechanophenotype-associated readouts may shift through receptor glycosylation, O-GlcNAc cycling, stress, or growth-state confounders.",
    };
  }
  return {
    glycan: "Perturbation is treated as a glycan/pericellular-matrix hypothesis prior, not direct biological evidence.",
    readout: "Readout direction requires controlled marker data, matched perturbation conditions, and validation controls.",
  };
}

function getPerturbationSections(gene: string, geneClass?: string | null): Array<{ title: string; items: string[] }> {
  if (gene === "CD44") {
    return [
      {
        title: "CD44/HA-axis perturbations",
        items: [
          "hyaluronidase - enzymatic HA removal",
          "CD44-blocking antibody - receptor/HA interaction perturbation",
          "HAS2 knockdown / CRISPRi - HA synthesis-axis perturbation",
          "4-MU - HA synthesis inhibitor; synthesis and viability caveats",
          "defined-molecular-weight HA rescue - rescue/control logic",
        ],
      },
    ];
  }
  if (geneClass === "HSPG core proteins" || geneClass === "HS biosynthesis/remodeling") {
    return [
      {
        title: "HSPG-axis perturbations",
        items: [
          "heparinase III - heparan sulfate cleavage",
          "EXT1/EXT2 perturbation - HS chain elongation",
          "NDST1/NDST2 perturbation - HS sulfation modification",
          "SDC/GPC knockdown or CRISPRi - core-protein perturbation",
          "anti-HS 10E4/F58-10E4 staining - HS readout",
        ],
      },
    ];
  }
  if (geneClass === "HA/CD44 axis") {
    return [
      {
        title: "HA synthesis-axis perturbations",
        items: [
          "HAS knockdown / CRISPRi",
          "4-MU with viability/synthesis caveat",
          "hyaluronidase",
          "HA rescue with defined molecular weight",
        ],
      },
    ];
  }
  if (geneClass === "N/O-glycosylation and HBP/O-GlcNAc") {
    return [
      {
        title: "Global glycosylation/metabolism perturbations - broad/confounded",
        items: [
          "2-DG: broad glycolysis/energy-stress perturbation; viability and AMPK controls required.",
          "DON: glutamine antagonist; affects HBP but is not GFPT1-specific.",
          "tunicamycin: N-glycosylation block with ER-stress/UPR confound.",
          "benzyl-GalNAc: broad mucin-type O-glycosylation perturbation, not CD44/HA-specific.",
          "PUGNAc: OGA inhibitor that increases O-GlcNAc; older/broader than Thiamet-G or GlcNAcstatin; opposite-direction perturbation relative to OGT inhibition.",
        ],
      },
    ];
  }
  return [];
}
