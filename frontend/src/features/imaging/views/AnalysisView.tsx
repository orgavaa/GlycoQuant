import { useMemo, useState } from "react";
import { PanelRightOpen, PanelRightClose } from "lucide-react";
import { MicroscopyCanvas } from "@/components/MicroscopyCanvas";
import { OverlayPanel } from "@/components/OverlayPanel";
import { RightRail } from "@/components/RightRail";
import type { JobResult } from "@/lib/api";
import { extractFeatures } from "@/lib/canvas/extract";
import { useJobStore } from "@/lib/jobStore";

interface Props {
  result: JobResult;
}

type CellFilter = "all" | "analysis_ready" | "qc_failed";

export function AnalysisView({ result }: Props) {
  const [showSeg, setShowSeg] = useState(true);
  const [activeOverlay, setActiveOverlay] = useState<string | null>(null);
  const [railOpen, setRailOpen] = useState(false);
  const [cellFilter, setCellFilter] = useState<CellFilter>("analysis_ready");
  const [channelVis, setChannelVis] = useState<Record<string, boolean>>({
    dapi: true, glycocalyx: true, yap: false, paxillin: false, actin: true,
  });
  const datasetLabel = useJobStore(s => s.latestDatasetLabel);
  const cells = useMemo(() => extractFeatures(result.features_df_json), [result.features_df_json]);
  // Cell selection is handled by the user — no auto-open of the rail.
  // Users can inspect cells on the image without forcing a context switch.

  // Compute visible cell IDs based on filter (truthful: explain what's shown)
  const { visibleCellIds, nRaw, nReady, statusText } = useMemo(() => {
    const totalDetected = result.cell_overlay?.n_cells ?? result.cell_count;
    const readyIds = new Set(cells.map(c => Number(c.cell_id)));
    let visible: Set<number> | null = null;
    let status = "";
    if (cellFilter === "all") {
      visible = null;  // show everything
      status = `${totalDetected} raw masks detected`;
    } else if (cellFilter === "analysis_ready") {
      visible = readyIds;
      status = totalDetected > readyIds.size
        ? `${totalDetected} raw masks · ${readyIds.size} analysis-ready cells visible`
        : `${readyIds.size} analysis-ready cells`;
    } else {
      visible = new Set([...Array.from({ length: totalDetected }, (_, i) => i + 1)].filter(id => !readyIds.has(id)));
      status = `${visible.size} QC-failed cells (no valid features)`;
    }
    return { visibleCellIds: visible, nRaw: totalDetected, nReady: readyIds.size, statusText: status };
  }, [result, cells, cellFilter]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      {/* Full-bleed microscopy image */}
      <div className="absolute inset-0">
        <MicroscopyCanvas
          result={result}
          showSegmentation={showSeg}
          activeOverlay={activeOverlay}
          cells={cells}
          channelVisibility={channelVis}
          visibleCellIds={visibleCellIds}
        />
      </div>

      {/* Overlay controls (top-left) */}
      <OverlayPanel
        showSegmentation={showSeg}
        onToggleSegmentation={() => setShowSeg(v => !v)}
        activeOverlay={activeOverlay}
        onSetOverlay={setActiveOverlay}
        channelVisibility={channelVis}
        onToggleChannel={ch => setChannelVis(p => ({ ...p, [ch]: !p[ch] }))}
      />

      {/* Cell visibility filter (below overlay panel) */}
      <div className="absolute top-3 left-[188px] z-10 bg-white/[0.92] backdrop-blur-xl border border-black/[0.06] rounded-lg shadow-md p-3 max-w-[200px]">
        <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-[1.5px] mb-2">
          Cell visibility
        </div>
        <div className="space-y-1">
          {([
            { id: "analysis_ready", label: "Analysis-ready" },
            { id: "all", label: "All raw masks" },
            { id: "qc_failed", label: "QC-failed" },
          ] as { id: CellFilter; label: string }[]).map(opt => (
            <label key={opt.id} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="cellFilter"
                checked={cellFilter === opt.id}
                onChange={() => setCellFilter(opt.id)}
                className="w-3 h-3 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-[11px] text-gray-600">{opt.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Caption bar (bottom) — truthful status */}
      <div className="absolute bottom-0 left-0 right-0 z-10 pointer-events-none">
        <div className="bg-black/60 backdrop-blur-sm">
          <div className="px-4 py-2.5 flex items-center gap-3 text-[11px]">
            <span className="text-gray-300">{datasetLabel}</span>
            {result.pixel_size_um && (
              <>
                <span className="text-gray-500">&middot;</span>
                <span className="text-gray-400">{result.pixel_size_um} &micro;m/px</span>
              </>
            )}
            <span className="text-gray-500">&middot;</span>
            <span className="text-gray-300">{statusText}</span>
            {nReady < nRaw && cellFilter === "analysis_ready" && (
              <button
                onClick={() => setCellFilter("all")}
                className="ml-auto text-gray-400 hover:text-white transition-colors pointer-events-auto"
              >
                Show all &rarr;
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Rail toggle button */}
      <button
        onClick={() => setRailOpen(v => !v)}
        className={`absolute top-4 z-30 bg-white/90 backdrop-blur-xl border border-gray-200 rounded-lg shadow-md w-9 h-9 flex items-center justify-center text-gray-600 hover:bg-white hover:text-gray-900 transition-all duration-300 ${
          railOpen ? "right-[calc(min(640px,60vw)+12px)]" : "right-4"
        }`}
        title={railOpen ? "Close panel" : "Open results"}
      >
        {railOpen ? <PanelRightClose size={18} strokeWidth={1.5} /> : <PanelRightOpen size={18} strokeWidth={1.5} />}
      </button>

      {/* Sliding results panel */}
      <div
        className={`absolute top-0 right-0 h-full z-20 transition-transform duration-300 ease-in-out ${
          railOpen ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ width: "min(640px, 60vw)" }}
      >
        <RightRail result={result} cells={cells} onClose={() => setRailOpen(false)} />
      </div>
    </div>
  );
}
