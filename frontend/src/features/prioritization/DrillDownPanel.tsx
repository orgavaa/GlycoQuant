import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card } from "@/components/Card";
import { PlotlyFigure } from "@/components/PlotlyFigure";
import { fetchDrillDown } from "@/lib/api";

interface DrillDownPanelProps {
  gene: string;
  mechanoSignature: string[];
  onGeneChange: (gene: string) => void;
  availableGenes: string[];
}

export function DrillDownPanel({ gene, mechanoSignature, onGeneChange, availableGenes }: DrillDownPanelProps) {
  const [selectedTarget, setSelectedTarget] = useState<string>(mechanoSignature[0] ?? "YAP1");

  const drillQuery = useQuery({
    queryKey: ["drill", gene],
    queryFn: () => fetchDrillDown(gene),
    enabled: !!gene,
  });

  const drill = drillQuery.data;
  const evidence = drill?.evidence_per_target[selectedTarget];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Glycocalyx gene</label>
        <select
          value={gene}
          onChange={(e) => onGeneChange(e.target.value)}
          className="bg-white border border-gray-300 rounded-md px-3 py-2 text-[13px] text-gray-900 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {availableGenes.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Heatmap */}
        <Card className="!p-4 bg-gray-50">
          {drillQuery.isLoading ? (
            <div className="flex h-[240px] items-center justify-center">
              <div className="w-5 h-5 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
            </div>
          ) : drill ? (
            <PlotlyFigure figureJson={drill.heatmap_figure_json} height={240} />
          ) : (
            <div className="flex h-[240px] items-center justify-center text-[13px] text-gray-400">
              Select a gene to view the heatmap
            </div>
          )}
        </Card>

        {/* STRING evidence */}
        <Card className="!p-5 bg-gray-50">
          <div className="mb-4 flex items-center gap-3">
            <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Mechano target</label>
            <select
              value={selectedTarget}
              onChange={(e) => setSelectedTarget(e.target.value)}
              className="ml-auto bg-white border border-gray-300 rounded-md px-2.5 py-1.5 text-[11px] text-gray-900 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {mechanoSignature.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          {!evidence ? (
            <p className="text-[13px] text-gray-500">
              No pathway evidence for <code className="bg-gray-100 px-1.5 py-0.5 rounded text-[11px]">{gene} &rarr; {selectedTarget}</code>
            </p>
          ) : evidence.path.length === 0 ? (
            <p className="text-[13px] text-gray-500">
              <code className="bg-gray-100 px-1.5 py-0.5 rounded text-[11px]">{gene} &rarr; {selectedTarget}</code> unreachable in STRING v12 at confidence &ge; 0.7
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                {evidence.path.map((node, i) => (
                  <span key={i} className="flex items-center gap-2">
                    <span className="px-2.5 py-1 bg-white border border-gray-300 rounded-md font-semibold text-[11px] text-gray-900">{node}</span>
                    {i < evidence.path.length - 1 && <span className="text-gray-400 text-[12px]">&rarr;</span>}
                  </span>
                ))}
              </div>
              <div className="text-[13px] text-gray-600">
                Dijkstra distance = <span className="font-semibold text-gray-900" style={{ fontFeatureSettings: "'tnum'" }}>{evidence.distance?.toFixed(3) ?? "\u2014"}</span>
              </div>
              <div>
                <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Edges along the path</div>
                <ul className="space-y-1.5">
                  {evidence.path_edges.map((e, i) => (
                    <li key={i} className="flex items-center gap-2 text-[11px]">
                      <span className="px-1.5 py-0.5 bg-white border border-gray-200 rounded text-gray-800">{e.from}</span>
                      <span className="text-gray-400">&harr;</span>
                      <span className="px-1.5 py-0.5 bg-white border border-gray-200 rounded text-gray-800">{e.to}</span>
                      <span className="ml-auto text-gray-500" style={{ fontFeatureSettings: "'tnum'" }}>conf {e.confidence.toFixed(3)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
