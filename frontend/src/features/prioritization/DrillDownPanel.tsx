/**
 * DrillDownPanel — per-gene STRING shortest-path evidence.
 * Restyled for the Stitch "Quantitative Aesthetic".
 */
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PlotlyFigure } from "@/components/PlotlyFigure";
import { fetchDrillDown } from "@/lib/api";

interface DrillDownPanelProps {
  gene: string;
  mechanoSignature: string[];
  onGeneChange: (gene: string) => void;
  availableGenes: string[];
}

export function DrillDownPanel({
  gene,
  mechanoSignature,
  onGeneChange,
  availableGenes,
}: DrillDownPanelProps) {
  const [selectedTarget, setSelectedTarget] = useState<string>(
    mechanoSignature[0] ?? "YAP1",
  );

  const drillQuery = useQuery({
    queryKey: ["drill", gene],
    queryFn: () => fetchDrillDown(gene),
    enabled: !!gene,
  });

  const drill = drillQuery.data;
  const evidence = drill?.evidence_per_target[selectedTarget];

  return (
    <div className="space-y-5">
      {/* Gene selector */}
      <div className="flex items-center gap-4">
        <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest whitespace-nowrap">
          Glycocalyx gene
        </span>
        <select
          value={gene}
          onChange={(e) => onGeneChange(e.target.value)}
          className="bg-surface-container-lowest ghost-border px-3 py-2 text-sm text-on-surface font-mono cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {availableGenes.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
      </div>

      {/* Heatmap + evidence side by side */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Left: heatmap */}
        <div className="bg-surface-container-lowest ghost-border p-3">
          {drillQuery.isLoading ? (
            <div className="flex h-[240px] items-center justify-center">
              <span className="material-symbols-outlined text-primary animate-spin">
                progress_activity
              </span>
            </div>
          ) : drill ? (
            <PlotlyFigure figureJson={drill.heatmap_figure_json} height={240} />
          ) : (
            <div className="flex h-[240px] items-center justify-center text-[10px] text-on-surface-variant uppercase tracking-widest">
              Drill-down heatmap — Phase 6
            </div>
          )}
        </div>

        {/* Right: STRING evidence */}
        <div className="bg-surface-container-lowest ghost-border p-5">
          <div className="mb-4 flex items-center gap-3">
            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest whitespace-nowrap">
              STRING evidence — mechano target
            </span>
            <select
              value={selectedTarget}
              onChange={(e) => setSelectedTarget(e.target.value)}
              className="ml-auto bg-surface-container-lowest ghost-border px-2 py-1.5 text-xs text-on-surface font-mono cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {mechanoSignature.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {!evidence ? (
            <p className="text-xs text-on-surface-variant">
              No pathway evidence for{" "}
              <span className="font-mono">{gene} → {selectedTarget}</span>
            </p>
          ) : evidence.path.length === 0 ? (
            <p className="text-xs text-on-surface-variant">
              <span className="font-mono">{gene} → {selectedTarget}</span>{" "}
              unreachable in STRING v12 at confidence ≥ 0.7
            </p>
          ) : (
            <div className="space-y-4">
              {/* Path nodes */}
              <div className="flex flex-wrap items-center gap-2 font-mono text-sm">
                {evidence.path.map((node, i) => (
                  <span key={i} className="flex items-center gap-2">
                    <span className="ghost-border px-2 py-1 text-on-surface bg-surface-container font-semibold text-xs">
                      {node}
                    </span>
                    {i < evidence.path.length - 1 && (
                      <span className="text-on-surface-variant text-xs">→</span>
                    )}
                  </span>
                ))}
              </div>

              <div className="text-xs text-on-surface-variant">
                Dijkstra distance ={" "}
                <span className="font-mono text-on-surface tabular-nums">
                  {evidence.distance?.toFixed(3) ?? "—"}
                </span>
              </div>

              <div>
                <div className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-2">
                  Edges along the path
                </div>
                <ul className="space-y-1.5">
                  {evidence.path_edges.map((e, i) => (
                    <li
                      key={i}
                      className="flex items-center gap-2 text-xs font-mono"
                    >
                      <span className="ghost-border px-1.5 py-0.5 bg-surface-container text-on-surface text-[10px]">
                        {e.from}
                      </span>
                      <span className="text-on-surface-variant">↔</span>
                      <span className="ghost-border px-1.5 py-0.5 bg-surface-container text-on-surface text-[10px]">
                        {e.to}
                      </span>
                      <span className="ml-auto tabular-nums text-on-surface-variant text-[10px]">
                        conf {e.confidence.toFixed(3)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
