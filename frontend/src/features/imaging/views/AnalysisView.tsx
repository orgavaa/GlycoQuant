import { useEffect, useMemo, useRef, useState } from "react";
import { PanelRightOpen, PanelRightClose, Image as ImageIcon, SlidersHorizontal } from "lucide-react";
import { MicroscopyCanvas } from "@/components/MicroscopyCanvas";
import { OverlayPanel } from "@/components/OverlayPanel";
import { RightRail } from "@/components/RightRail";
import type { JobResult } from "@/lib/api";
import { extractFeatures } from "@/lib/canvas/extract";
import { useJobStore } from "@/lib/jobStore";

const RAIL_MIN_PX = 380;
const RAIL_STORAGE_KEY = "glycoquant.rail.width";

function clampRailWidth(px: number): number {
  const maxPx = Math.round(window.innerWidth * 0.85);
  return Math.max(RAIL_MIN_PX, Math.min(maxPx, px));
}

interface Props {
  result: JobResult;
}

type CellFilter = "all" | "analysis_ready" | "qc_failed";

export function AnalysisView({ result }: Props) {
  // "Raw" view temporarily strips every analysis artefact (outlines, score overlays,
  // QC filter) while preserving the user's chosen settings so flipping back restores
  // the previous state 1:1. "Analysis" view re-applies them.
  const [viewMode, setViewMode] = useState<"analysis" | "raw">("analysis");
  const [showSeg, setShowSeg] = useState(true);
  const [activeOverlay, setActiveOverlay] = useState<string | null>(null);
  const [railOpen, setRailOpen] = useState(false);
  const [cellFilter, setCellFilter] = useState<CellFilter>("analysis_ready");
  const [channelVis, setChannelVis] = useState<Record<string, boolean>>({
    dapi: true, glycocalyx: true, yap: false, paxillin: false, actin: true,
  });
  const datasetLabel = useJobStore(s => s.latestDatasetLabel);
  const selectedCellId = useJobStore(s => s.selectedCellId);
  const rawPreviewUrl = useJobStore(s => s.latestRawPreviewUrl);
  const cells = useMemo(() => extractFeatures(result.features_df_json), [result.features_df_json]);

  // Auto-open rail when the user selects a cell on the image.
  useEffect(() => {
    if (selectedCellId != null) setRailOpen(true);
  }, [selectedCellId]);

  // Resizable rail — width persisted across sessions.
  const [railWidth, setRailWidth] = useState<number>(() => {
    if (typeof window === "undefined") return 640;
    const stored = Number(window.localStorage.getItem(RAIL_STORAGE_KEY));
    const fallback = Math.min(640, Math.round(window.innerWidth * 0.6));
    return clampRailWidth(Number.isFinite(stored) && stored > 0 ? stored : fallback);
  });
  const dragStateRef = useRef<{ startX: number; startW: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const st = dragStateRef.current;
      if (!st) return;
      const deltaToLeft = st.startX - e.clientX;
      setRailWidth(clampRailWidth(st.startW + deltaToLeft));
    };
    const onUp = () => {
      setDragging(false);
      dragStateRef.current = null;
      window.localStorage.setItem(RAIL_STORAGE_KEY, String(railWidth));
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, railWidth]);

  useEffect(() => {
    const onResize = () => setRailWidth(w => clampRailWidth(w));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const startDrag = (e: React.MouseEvent) => {
    dragStateRef.current = { startX: e.clientX, startW: railWidth };
    setDragging(true);
    e.preventDefault();
  };

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

  // Effective overlay state — forced off in Raw view.
  const isRaw = viewMode === "raw";
  const effectiveShowSeg = isRaw ? false : showSeg;
  const effectiveOverlay = isRaw ? null : activeOverlay;
  const effectiveVisibleIds = isRaw ? null : visibleCellIds;

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      {/* Full-bleed image layer — the analysis canvas, or the original raw preview in Raw mode. */}
      <div className="absolute inset-0">
        {isRaw ? (
          rawPreviewUrl ? (
            <img
              src={rawPreviewUrl}
              alt="Original image"
              className="w-full h-full object-contain bg-black"
              draggable={false}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white/60 text-[12px]">
              Original image preview is not available for this job.
            </div>
          )
        ) : (
          <MicroscopyCanvas
            result={result}
            showSegmentation={effectiveShowSeg}
            activeOverlay={effectiveOverlay}
            cells={cells}
            channelVisibility={channelVis}
            visibleCellIds={effectiveVisibleIds}
          />
        )}
      </div>

      {/* Top-centre view-mode toggle — Raw vs Analysis. Raw hides every analysis artefact. */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
        <div className="inline-flex items-center gap-0.5 bg-white/30 backdrop-blur-md border border-white/20 rounded-lg shadow-sm p-1">
          <button
            type="button"
            onClick={() => setViewMode("analysis")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium transition-colors ${
              viewMode === "analysis"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-white/80 hover:text-white"
            }`}
            title="Show segmentation, overlays, and QC filter"
          >
            <SlidersHorizontal size={12} strokeWidth={1.8} />
            Analysis
          </button>
          <button
            type="button"
            onClick={() => setViewMode("raw")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium transition-colors ${
              viewMode === "raw"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-white/80 hover:text-white"
            }`}
            title="Hide all overlays and show the original channels only"
          >
            <ImageIcon size={12} strokeWidth={1.8} />
            Raw image
          </button>
        </div>
      </div>

      {/* Overlay controls (top-left) — dimmed & disabled in Raw mode. */}
      <div
        className={`transition-opacity duration-200 ${
          isRaw ? "opacity-40 pointer-events-none" : "opacity-100"
        }`}
        aria-hidden={isRaw}
      >
        <OverlayPanel
          showSegmentation={showSeg}
          onToggleSegmentation={() => setShowSeg(v => !v)}
          activeOverlay={activeOverlay}
          onSetOverlay={setActiveOverlay}
          channelVisibility={channelVis}
          onToggleChannel={ch => setChannelVis(p => ({ ...p, [ch]: !p[ch] }))}
        />

        {/* Cell visibility filter (below overlay panel) */}
        <div className="absolute top-4 left-[204px] z-10 bg-white/30 backdrop-blur-md border border-white/20 rounded-lg shadow-sm p-4 max-w-[210px] text-white">
          <div className="text-[10px] font-semibold text-white/60 uppercase tracking-[1.5px] mb-2.5 drop-shadow-sm">
            Cell visibility
          </div>
          <div className="space-y-1.5">
            {([
              { id: "analysis_ready", label: "Analysis-ready" },
              { id: "all", label: "All raw masks" },
              { id: "qc_failed", label: "QC-failed" },
            ] as { id: CellFilter; label: string }[]).map(opt => (
              <label key={opt.id} className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="radio"
                  name="cellFilter"
                  checked={cellFilter === opt.id}
                  onChange={() => setCellFilter(opt.id)}
                  className="w-3 h-3 text-blue-500 focus:ring-blue-400 accent-blue-500"
                />
                <span className={`text-[11px] transition-colors ${cellFilter === opt.id ? "text-white font-medium" : "text-white/70"}`}>
                  {opt.label}
                </span>
              </label>
            ))}
          </div>
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

      {/* Rail toggle button — follows the rail's current width so it never sits under the panel. */}
      <button
        onClick={() => setRailOpen(v => !v)}
        className="absolute top-4 z-30 bg-white/90 backdrop-blur-xl border border-gray-200 rounded-lg shadow-md w-9 h-9 flex items-center justify-center text-gray-600 hover:bg-white hover:text-gray-900 transition-colors"
        style={{
          right: railOpen ? railWidth + 12 : 16,
          transition: dragging ? "none" : "right 300ms ease-in-out",
        }}
        title={railOpen ? "Close panel" : "Open results"}
      >
        {railOpen ? <PanelRightClose size={18} strokeWidth={1.5} /> : <PanelRightOpen size={18} strokeWidth={1.5} />}
      </button>

      {/* Sliding results panel */}
      <div
        className="absolute top-0 right-0 h-full z-20"
        style={{
          width: railWidth,
          transform: railOpen ? "translateX(0)" : "translateX(100%)",
          transition: dragging ? "none" : "transform 300ms ease-in-out",
        }}
      >
        {/* Drag handle on the left border — pull left to expand, right to shrink. */}
        {railOpen && (
          <div
            onMouseDown={startDrag}
            onDoubleClick={() => setRailWidth(clampRailWidth(640))}
            title="Drag to resize · double-click to reset"
            className={`absolute top-0 left-0 h-full w-1.5 -translate-x-1/2 z-30 cursor-col-resize group`}
          >
            <div className={`h-full w-px mx-auto transition-colors ${dragging ? "bg-blue-500" : "bg-gray-200 group-hover:bg-blue-400"}`} />
            {/* Grip dots */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="w-1 h-1 rounded-full bg-blue-500" />
              <span className="w-1 h-1 rounded-full bg-blue-500" />
              <span className="w-1 h-1 rounded-full bg-blue-500" />
            </div>
          </div>
        )}
        <RightRail result={result} cells={cells} onClose={() => setRailOpen(false)} />
      </div>

      {/* Whole-viewport overlay during drag — keeps pointer captured. */}
      {dragging && <div className="absolute inset-0 z-40 cursor-col-resize" />}
    </div>
  );
}
