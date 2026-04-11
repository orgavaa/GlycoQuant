import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Loader2 } from "lucide-react";
import { useState } from "react";
import { PlotlyFigure } from "@/components/PlotlyFigure";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
    <div className="space-y-4">
      {/* Gene selector */}
      <div className="flex items-center gap-3">
        <span className="section-label whitespace-nowrap">Glycocalyx gene</span>
        <Select value={gene} onValueChange={onGeneChange}>
          <SelectTrigger className="max-w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {availableGenes.map((g) => (
              <SelectItem key={g} value={g}>
                {g}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Heatmap + evidence panel side by side */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Left: heatmap */}
        <div className="rounded-xl border bg-card p-3">
          {drillQuery.isLoading ? (
            <div className="flex h-[240px] items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : drill ? (
            <PlotlyFigure figureJson={drill.heatmap_figure_json} height={240} />
          ) : null}
        </div>

        {/* Right: STRING evidence */}
        <div className="rounded-xl border bg-card p-4">
          <div className="mb-3 flex items-center gap-3">
            <span className="section-label whitespace-nowrap">
              STRING evidence — mechano target
            </span>
            <Select value={selectedTarget} onValueChange={setSelectedTarget}>
              <SelectTrigger className="ml-auto max-w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {mechanoSignature.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!evidence ? (
            <p className="text-sm text-muted-foreground">
              No pathway evidence for{" "}
              <span className="font-mono">{gene} → {selectedTarget}</span>
            </p>
          ) : evidence.path.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              <span className="font-mono">{gene} → {selectedTarget}</span>{" "}
              unreachable in STRING v12 at confidence ≥ 0.7
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-1.5 font-mono text-sm">
                {evidence.path.map((node, i) => (
                  <span key={i} className="flex items-center gap-1.5">
                    <span
                      className={
                        i === 0 || i === evidence.path.length - 1
                          ? "rounded bg-brand/10 px-1.5 py-0.5 font-semibold text-brand"
                          : "rounded bg-muted px-1.5 py-0.5 text-foreground"
                      }
                    >
                      {node}
                    </span>
                    {i < evidence.path.length - 1 && (
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    )}
                  </span>
                ))}
              </div>
              <div className="text-xs text-muted-foreground">
                Dijkstra distance ={" "}
                <span className="font-mono text-foreground">
                  {evidence.distance?.toFixed(3) ?? "—"}
                </span>
              </div>
              <div>
                <div className="section-label mb-1.5">Edges along the path</div>
                <ul className="space-y-1">
                  {evidence.path_edges.map((e, i) => (
                    <li
                      key={i}
                      className="flex items-center gap-2 text-xs font-mono"
                    >
                      <span className="text-foreground">{e.from}</span>
                      <span className="text-muted-foreground">↔</span>
                      <span className="text-foreground">{e.to}</span>
                      <span className="ml-auto tabular-nums text-muted-foreground">
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
