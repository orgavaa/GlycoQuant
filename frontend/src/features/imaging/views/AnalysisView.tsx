import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronsLeft, ChevronsRight, Image as ImageIcon, SlidersHorizontal, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { MicroscopyCanvas } from "@/components/MicroscopyCanvas";
import { OverlayPanel } from "@/components/OverlayPanel";
import { RightRail } from "@/components/RightRail";
import { DatasetProvenancePanel } from "@/components/ScientificPanels";
import type { JobResult } from "@/lib/api";
import { extractFeatures } from "@/lib/canvas/extract";
import { useJobStore } from "@/lib/jobStore";
import { computeQcReport, datasetContextFromResult } from "@/lib/scientificGuards";
import { usePanZoom } from "@/lib/usePanZoom";

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
  const storedContext = useJobStore(s => s.latestDatasetContext);
  const selectedCellId = useJobStore(s => s.selectedCellId);
  const rawPreviewUrl = useJobStore(s => s.latestRawPreviewUrl);
  const cells = useMemo(() => extractFeatures(result.features_df_json), [result.features_df_json]);
  const datasetContext = useMemo(
    () => datasetContextFromResult(result, datasetLabel, storedContext),
    [result, datasetLabel, storedContext],
  );
  const qcReport = useMemo(() => computeQcReport(cells, result), [cells, result]);
  const [excludeEdgeCells, setExcludeEdgeCells] = useState(false);
  const [excludeSaturationArtifacts, setExcludeSaturationArtifacts] = useState(false);

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
  const { visibleCellIds, nRaw, nReady, nQc, statusText } = useMemo(() => {
    const totalDetected = result.cell_overlay?.n_cells ?? result.cell_count;
    const readyIds = new Set(qcReport.analysisReadyIds);
    if (excludeEdgeCells) {
      for (const [id, status] of qcReport.byCellId) {
        if (status.flags.includes("edge-truncated cell")) readyIds.delete(id);
      }
    }
    if (excludeSaturationArtifacts) {
      for (const [id, status] of qcReport.byCellId) {
        if (status.flags.some((flag) => flag.includes("saturated"))) readyIds.delete(id);
      }
    }
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
      visible = new Set<number>();
      for (const [id, qc] of qcReport.byCellId) {
        if (!qc.analysisReady || qc.flags.length > 0) visible.add(id);
      }
      status = `${visible.size} QC-flagged cells`;
    }
    return { visibleCellIds: visible, nRaw: totalDetected, nReady: readyIds.size, nQc: qcReport.field.qcFlaggedCells, statusText: status };
  }, [result, cellFilter, qcReport, excludeEdgeCells, excludeSaturationArtifacts]);

  // Independent pan/zoom controller for the Raw image viewport.
  const rawPanZoom = usePanZoom();

  // Effective overlay state — forced off in Raw view.
  const isRaw = viewMode === "raw";
  const effectiveShowSeg = isRaw ? false : showSeg;
  const effectiveOverlay = isRaw ? null : activeOverlay;
  const effectiveVisibleIds = isRaw ? null : visibleCellIds;

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      {/* Full-bleed image layer — analysis canvas or raw preview; both support pan/zoom. */}
      <div className="absolute inset-0">
        {isRaw ? (
          rawPreviewUrl ? (
            <div
              ref={rawPanZoom.containerRef}
              onMouseDown={rawPanZoom.onMouseDown}
              className={`w-full h-full bg-black relative overflow-hidden select-none ${
                rawPanZoom.panning ? "cursor-grabbing" : "cursor-grab"
              }`}
            >
              <div
                className="absolute top-0 left-0 w-full h-full"
                style={{
                  transform: `translate3d(${rawPanZoom.state.panX}px, ${rawPanZoom.state.panY}px, 0) scale(${rawPanZoom.state.zoom})`,
                  transformOrigin: "0 0",
                  willChange: "transform",
                }}
              >
                <img
                  src={rawPreviewUrl}
                  alt="Original image"
                  className="w-full h-full object-fill pointer-events-none"
                  draggable={false}
                />
              </div>

              {/* Zoom controls for the raw view */}
              <div className="absolute bottom-12 left-4 z-[5] flex items-center gap-1 rounded-lg border border-white/25 bg-white/78 p-1 text-gray-700 shadow-lg backdrop-blur-xl">
                <button type="button" onClick={rawPanZoom.zoomOut} className="flex h-7 w-7 items-center justify-center rounded-md text-gray-600 transition hover:bg-gray-100 hover:text-gray-950" title="Zoom out">
                  <ZoomOut size={14} strokeWidth={1.8} />
                </button>
                <div className="min-w-[38px] px-2 text-center font-mono text-[10px] text-gray-600" style={{ fontFeatureSettings: "'tnum'" }}>
                  {(rawPanZoom.state.zoom * 100).toFixed(0)}%
                </div>
                <button type="button" onClick={rawPanZoom.zoomIn} className="flex h-7 w-7 items-center justify-center rounded-md text-gray-600 transition hover:bg-gray-100 hover:text-gray-950" title="Zoom in">
                  <ZoomIn size={14} strokeWidth={1.8} />
                </button>
                <button type="button" onClick={rawPanZoom.reset} disabled={rawPanZoom.isAtDefault} className="flex h-7 w-7 items-center justify-center rounded-md text-gray-600 transition hover:bg-gray-100 hover:text-gray-950 disabled:cursor-not-allowed disabled:opacity-35" title="Reset view">
                  <RotateCcw size={14} strokeWidth={1.8} />
                </button>
              </div>
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-black text-white/60 text-[12px]">
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
            datasetContext={datasetContext}
          />
        )}
      </div>

      <div className="absolute left-4 top-4 z-20 flex max-h-[calc(100vh-7rem)] w-[292px] max-w-[calc(100vw-2rem)] flex-col gap-2 overflow-y-auto pr-1">
        <div className="rounded-lg border border-white/25 bg-white/78 p-1 shadow-lg backdrop-blur-xl">
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() => setViewMode("analysis")}
              className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors ${
                viewMode === "analysis"
                  ? "bg-gray-950 text-white shadow-sm"
                  : "text-gray-500 hover:bg-white/70 hover:text-gray-950"
              }`}
              title="Show segmentation, overlays, and QC filter"
            >
              <SlidersHorizontal size={12} strokeWidth={1.8} />
              Analysis
            </button>
            <button
              type="button"
              onClick={() => setViewMode("raw")}
              className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors ${
                viewMode === "raw"
                  ? "bg-gray-950 text-white shadow-sm"
                  : "text-gray-500 hover:bg-white/70 hover:text-gray-950"
              }`}
              title="Hide all overlays and show the original channels only"
            >
              <ImageIcon size={12} strokeWidth={1.8} />
              Raw image
            </button>
          </div>
        </div>

        <DatasetProvenancePanel context={datasetContext} compact glass />

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
            cellFilter={cellFilter}
            onSetCellFilter={setCellFilter}
            rawCellCount={nRaw}
            readyCellCount={nReady}
            qcFlaggedCount={nQc}
            excludeEdgeCells={excludeEdgeCells}
            excludeSaturationArtifacts={excludeSaturationArtifacts}
            onToggleExcludeEdge={() => setExcludeEdgeCells(v => !v)}
            onToggleExcludeSaturation={() => setExcludeSaturationArtifacts(v => !v)}
            datasetContext={datasetContext}
          />
        </div>
      </div>

      {/* Top-centre view-mode toggle — Raw vs Analysis. Raw hides every analysis artefact. */}
      {/* Overlay controls (top-left) — dimmed & disabled in Raw mode. */}
      {/* Caption bar (bottom) — truthful status */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-10">
        <div className="border-t border-white/10 bg-black/72 backdrop-blur-sm">
          <div className="flex min-w-0 items-center gap-2 px-4 py-2 text-[11px] text-gray-300">
            <span className="max-w-[34vw] flex-shrink-0 truncate font-medium text-white">{datasetLabel}</span>
            {result.pixel_size_um && (
              <>
                <span className="text-gray-500">/</span>
                <span>{result.pixel_size_um} &micro;m/px</span>
              </>
            )}
            <span className="text-gray-500">/</span>
            <span>{showSeg ? "masks on" : "masks off"}</span>
            <span className="text-gray-500">/</span>
            <span className="min-w-0 truncate">{statusText}</span>
            {nReady < nRaw && cellFilter === "analysis_ready" && (
              <button
                onClick={() => setCellFilter("all")}
                className="pointer-events-auto ml-auto rounded-md border border-white/15 px-2 py-1 text-[10px] font-medium text-gray-300 transition hover:border-white/30 hover:text-white"
              >
                Show all masks
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Rail toggle button — follows the rail's current width so it never sits under the panel. */}
      <button
        onClick={() => setRailOpen(v => !v)}
        className="absolute top-4 z-30 flex h-9 w-9 items-center justify-center rounded-lg border border-white/25 bg-white/78 text-gray-700 shadow-lg backdrop-blur-xl transition hover:bg-white/90 hover:text-gray-950"
        style={{
          right: railOpen ? railWidth + 12 : 16,
          transition: dragging ? "none" : "right 300ms ease-in-out",
        }}
        title={railOpen ? "Close inspector" : "Open inspector"}
      >
        {railOpen ? <ChevronsRight size={18} strokeWidth={1.7} /> : <ChevronsLeft size={18} strokeWidth={1.7} />}
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
            <div className={`mx-auto h-full w-px transition-colors ${dragging ? "bg-gray-950" : "bg-gray-200 group-hover:bg-gray-500"}`} />
            {/* Grip dots */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="h-1 w-1 rounded-full bg-gray-700" />
              <span className="h-1 w-1 rounded-full bg-gray-700" />
              <span className="h-1 w-1 rounded-full bg-gray-700" />
            </div>
          </div>
        )}
        <RightRail
          result={result}
          cells={cells}
          onClose={() => setRailOpen(false)}
          datasetContext={datasetContext}
          qcReport={qcReport}
        />
      </div>

      {/* Whole-viewport overlay during drag — keeps pointer captured. */}
      {dragging && <div className="absolute inset-0 z-40 cursor-col-resize" />}
    </div>
  );
}
