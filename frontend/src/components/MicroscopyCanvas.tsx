import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { extractPolygons, type CellFeatures } from "@/lib/canvas/extract";
import { hitTestPolygons } from "@/lib/canvas/hitTest";
import { viridisRgba, rdbuRgba } from "@/lib/canvas/colormap";
import { useJobStore } from "@/lib/jobStore";
import { usePanZoom } from "@/lib/usePanZoom";
import type { JobResult } from "@/lib/api";
import { fmt, fmtSigned } from "@/lib/utils";

interface Props {
  result: JobResult;
  showSegmentation: boolean;
  activeOverlay: string | null;
  cells: CellFeatures[];
  channelVisibility: Record<string, boolean>;
  visibleCellIds?: Set<number> | null;
}

export function MicroscopyCanvas({ result, showSegmentation, activeOverlay, cells, channelVisibility, visibleCellIds }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const setSelectedCellId = useJobStore(s => s.setSelectedCellId);
  const selectedCellId = useJobStore(s => s.selectedCellId);
  const [hoveredCellId, setHoveredCellId] = useState<number | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [tooltip, setTooltip] = useState<{ x: number; y: number; cellId: number; lines: { l: string; v: string }[] } | null>(null);

  // Pan/zoom controller. containerRef is bound to the outer viewport div below.
  // onClick receives viewport client coords — we translate via clientToContent()
  // to image-space coords for polygon hit-testing.
  const panZoom = usePanZoom({
    onClick: (clientX, clientY) => {
      const pt = panZoom.clientToContent(clientX, clientY);
      if (!pt) return;
      const imgScaleX = imgDimsRef.current ? size.w / imgDimsRef.current.w : 1;
      const imgScaleY = imgDimsRef.current ? size.h / imgDimsRef.current.h : 1;
      const ix = pt.x / imgScaleX;
      const iy = pt.y / imgScaleY;
      const hit = hitTestPolygons(polygonsRef.current, ix, iy);
      const allowed = hit != null && (!visibleCellIds || visibleCellIds.has(hit)) ? hit : null;
      setSelectedCellId(allowed);
    },
  });

  // Prefer the explicit overlay payload; fall back to extracting from figure JSON
  const polygons = useMemo(() => {
    // Path 1: explicit cell_overlay payload (canonical, from cell_mask directly)
    if (result.cell_overlay?.polygons && result.cell_overlay.polygons.length > 0) {
      const polys = result.cell_overlay.polygons.map(p => {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let cx = 0, cy = 0;
        for (const [x, y] of p.vertices) {
          if (x < minX) minX = x; if (y < minY) minY = y;
          if (x > maxX) maxX = x; if (y > maxY) maxY = y;
          cx += x; cy += y;
        }
        const n = p.vertices.length;
        return {
          cellId: p.cell_id,
          vertices: p.vertices,
          bbox: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
          centroid: [cx / n, cy / n] as [number, number],
        };
      });
      console.log(`[MicroscopyCanvas] ${polys.length} polygons from cell_overlay payload`);
      return polys;
    }
    // Path 2: legacy extraction from Plotly figure JSON
    const p = extractPolygons(result.segmentation_figure_json);
    if (p.length > 0) {
      console.log(`[MicroscopyCanvas] ${p.length} polygons from segmentation figure (fallback)`);
    }
    return p;
  }, [result.cell_overlay, result.segmentation_figure_json]);
  const cellMap = useMemo(() => {
    const m = new Map<number, CellFeatures>();
    for (const c of cells) m.set(Number(c.cell_id), c);
    return m;
  }, [cells]);

  // Per-cell overlay values (normalized 0-1)
  const overlayValues = useMemo(() => {
    if (!activeOverlay) return null;
    const key = activeOverlay === "glyco" ? "glycocalyx_pericellular_ratio" : "mechano_score";
    const vals = cells.map(c => c[key]).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    if (vals.length === 0) return null;
    const mn = Math.min(...vals);
    const mx = Math.max(...vals);
    const range = mx - mn || 1;
    const map = new Map<number, number>();
    for (const c of cells) {
      const v = c[key];
      if (typeof v === "number" && Number.isFinite(v)) {
        map.set(Number(c.cell_id), (v - mn) / range);
      }
    }
    return { map, isSigned: activeOverlay === "mechano" };
  }, [activeOverlay, cells]);

  // Image dimensions: prefer the cell_overlay payload (canonical)
  const imgDims = useMemo(() => {
    if (result.cell_overlay?.image_w && result.cell_overlay?.image_h) {
      return {
        w: result.cell_overlay.image_w,
        h: result.cell_overlay.image_h,
        yFlip: false,
      };
    }
    try {
      const fig = JSON.parse(result.segmentation_figure_json);
      const xr = fig.layout?.xaxis?.range as [number, number] | undefined;
      const yr = fig.layout?.yaxis?.range as [number, number] | undefined;
      if (xr && yr) {
        return { w: xr[1] - xr[0], h: Math.abs(yr[1] - yr[0]), yFlip: yr[0] > yr[1] };
      }
    } catch { /* empty */ }
    return null;
  }, [result.cell_overlay, result.segmentation_figure_json]);

  // Build the list of visible channel PNG src URLs — only show toggled-on channels
  const visibleChannels = useMemo(() => {
    if (!result.channel_pngs) return [];
    return Object.entries(result.channel_pngs).filter(
      ([name]) => channelVisibility[name] === true
    );
  }, [result.channel_pngs, channelVisibility]);

  // Stable refs for use inside the usePanZoom onClick closure (which captures
  // at hook creation time). Avoids stale reads of polygons / imgDims.
  const polygonsRef = useRef(polygons);
  polygonsRef.current = polygons;
  const imgDimsRef = useRef(imgDims);
  imgDimsRef.current = imgDims;

  // Resize observer
  useEffect(() => {
    const el = panZoom.containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setSize({ w: Math.floor(width), h: Math.floor(height) });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [panZoom.containerRef]);

  // Coordinate transforms — independent X/Y scaling (image fills container).
  // With native <img> rendering, y=0 is always at the top — no flip needed.
  // Polygon coordinates from the backend are row/col indices: (0,0) = top-left.
  const getTransform = useCallback(() => {
    if (!imgDims) return null;
    return {
      scaleX: size.w / imgDims.w,
      scaleY: size.h / imgDims.h,
    };
  }, [imgDims, size]);

  const toScreen = useCallback((x: number, y: number): [number, number] => {
    const t = getTransform(); if (!t) return [0, 0];
    return [x * t.scaleX, y * t.scaleY];
  }, [getTransform]);

  const toImage = useCallback((sx: number, sy: number): [number, number] => {
    const t = getTransform(); if (!t) return [0, 0];
    return [sx / t.scaleX, sy / t.scaleY];
  }, [getTransform]);

  // Draw canvas overlay (cell outlines, fills, scale bar)
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.w * dpr; canvas.height = size.h * dpr;
    canvas.style.width = `${size.w}px`; canvas.style.height = `${size.h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    if (!imgDims || polygons.length === 0) return;

    for (const poly of polygons) {
      if (poly.vertices.length < 3) continue;
      const isVisible = !visibleCellIds || visibleCellIds.has(poly.cellId);
      ctx.beginPath();
      const [sx0, sy0] = toScreen(poly.vertices[0][0], poly.vertices[0][1]);
      ctx.moveTo(sx0, sy0);
      for (let i = 1; i < poly.vertices.length; i++) {
        const [sx, sy] = toScreen(poly.vertices[i][0], poly.vertices[i][1]);
        ctx.lineTo(sx, sy);
      }
      ctx.closePath();

      const isSelected = poly.cellId === selectedCellId;
      const isHovered = poly.cellId === hoveredCellId;

      // Overlay fill (viridis/rdbu colormaps) — only for visible cells
      if (overlayValues && isVisible) {
        const val = overlayValues.map.get(poly.cellId);
        if (val != null) {
          ctx.fillStyle = overlayValues.isSigned ? rdbuRgba(val, 0.35) : viridisRgba(val, 0.35);
          ctx.fill();
        }
      }

      // Selected cell — yellow highlight
      if (isSelected) {
        ctx.strokeStyle = "#facc15"; ctx.lineWidth = 2.5;
        ctx.fillStyle = "rgba(250,204,21,0.12)"; ctx.fill();
        ctx.stroke();
      } else if (isHovered) {
        ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.lineWidth = 2;
        ctx.fillStyle = "rgba(255,255,255,0.08)"; ctx.fill();
        ctx.stroke();
      } else if (showSegmentation) {
        // Quiet non-visible cells — present but subdued (honest: shows what was filtered)
        const strokeAlpha = isVisible ? 0.3 : 0.08;
        ctx.strokeStyle = `rgba(255,255,255,${strokeAlpha})`;
        ctx.lineWidth = isVisible ? 0.8 : 0.5;
        ctx.stroke();
      }
    }

    // Scale bar
    const t = getTransform();
    const pxUm = result.pixel_size_um ?? 0.656;
    if (t && pxUm > 0) {
      const barPx = (50 / pxUm) * t.scaleX;
      const bx = size.w - barPx - 24, by = size.h - 20;
      ctx.fillStyle = "#fff"; ctx.fillRect(bx, by, barPx, 2);
      ctx.fillRect(bx, by - 4, 1, 10); ctx.fillRect(bx + barPx - 1, by - 4, 1, 10);
      ctx.font = "600 10px 'IBM Plex Sans', sans-serif"; ctx.fillStyle = "rgba(255,255,255,0.8)"; ctx.textAlign = "center";
      ctx.fillText("50 \u00b5m", bx + barPx / 2, by - 8);
    }
  }, [size, polygons, showSegmentation, activeOverlay, overlayValues, selectedCellId, hoveredCellId, imgDims, toScreen, getTransform, result.pixel_size_um, visibleCellIds]);

  // Hover: translate viewport → image coords through the current pan/zoom.
  // Suppressed while panning to avoid flickering tooltips.
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (panZoom.panning) { setTooltip(null); setHoveredCellId(null); return; }
    const pt = panZoom.clientToContent(e.clientX, e.clientY);
    if (!pt || !imgDims) return;
    const ix = pt.x / (size.w / imgDims.w);
    const iy = pt.y / (size.h / imgDims.h);
    const rawCid = hitTestPolygons(polygons, ix, iy);
    const cid = rawCid != null && (!visibleCellIds || visibleCellIds.has(rawCid)) ? rawCid : null;
    setHoveredCellId(cid);
    if (cid != null) {
      const cell = cellMap.get(cid);
      const lines = cell ? [
        { l: "glyco ratio", v: fmt(cell.glycocalyx_pericellular_ratio as number | null) },
        { l: "YAP N/C", v: fmt(cell.yap_nc_ratio_size_corrected as number | null) },
        { l: "mechano", v: fmtSigned(cell.mechano_score as number | null) },
        { l: "FA mature", v: cell.fa_mature_fraction != null && Number.isFinite(cell.fa_mature_fraction as number) ? ((cell.fa_mature_fraction as number) * 100).toFixed(0) + "%" : "\u2014" },
      ] : [];
      setTooltip({ x: e.clientX, y: e.clientY, cellId: cid, lines });
    } else {
      setTooltip(null);
    }
  }, [polygons, cellMap, panZoom, imgDims, size, visibleCellIds]);

  const { zoom, panX, panY } = panZoom.state;

  return (
    <>
      <div
        ref={panZoom.containerRef}
        onMouseDown={panZoom.onMouseDown}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => { setHoveredCellId(null); setTooltip(null); }}
        className={`w-full h-full bg-black relative overflow-hidden select-none ${
          panZoom.panning ? "cursor-grabbing" : "cursor-grab"
        }`}
      >
        {/* Transformed content layer — every pannable/zoomable child lives inside this div. */}
        <div
          className="absolute top-0 left-0"
          style={{
            width: size.w,
            height: size.h,
            transform: `translate3d(${panX}px, ${panY}px, 0) scale(${zoom})`,
            transformOrigin: "0 0",
            willChange: "transform",
          }}
        >
          {/* Channel PNGs — stacked with screen blend for additive compositing. */}
          {visibleChannels.map(([name, src]) => (
            <img
              key={name}
              src={src}
              alt={name}
              className="absolute inset-0 w-full h-full object-fill pointer-events-none"
              style={{ mixBlendMode: "screen" }}
              draggable={false}
            />
          ))}

          {/* Canvas overlay (outlines, hover, selection) — shares the same transform. */}
          <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />
        </div>

        {/* Cell count indicator (truthful state) — pinned to the viewport, not transformed. */}
        {polygons.length > 0 ? (
          <div className="absolute bottom-10 right-3 z-[5] bg-black/50 text-white/80 text-[10px] px-2 py-1 rounded">
            {polygons.length} cells &middot; click to inspect
          </div>
        ) : result.cell_count > 0 && result.cell_overlay?.fallback_reason ? (
          <div className="absolute bottom-10 right-3 z-[5] bg-amber-600/80 text-white text-[10px] px-2 py-1.5 rounded max-w-[280px]">
            {result.cell_count} cells quantified &middot; vector outlines unavailable
          </div>
        ) : null}

        {/* Zoom controls — pinned to the viewport. */}
        <div className="absolute bottom-10 left-3 z-[5] flex items-center gap-1 bg-black/50 backdrop-blur-sm rounded-md p-1">
          <button
            type="button"
            onClick={panZoom.zoomOut}
            className="w-7 h-7 flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 rounded"
            title="Zoom out"
          >
            <ZoomOut size={14} strokeWidth={1.8} />
          </button>
          <div
            className="px-2 text-[10px] font-mono text-white/80 min-w-[38px] text-center"
            style={{ fontFeatureSettings: "'tnum'" }}
          >
            {(zoom * 100).toFixed(0)}%
          </div>
          <button
            type="button"
            onClick={panZoom.zoomIn}
            className="w-7 h-7 flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 rounded"
            title="Zoom in"
          >
            <ZoomIn size={14} strokeWidth={1.8} />
          </button>
          <button
            type="button"
            onClick={panZoom.reset}
            disabled={panZoom.isAtDefault}
            className="w-7 h-7 flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 rounded disabled:opacity-40 disabled:cursor-not-allowed"
            title="Reset view"
          >
            <RotateCcw size={14} strokeWidth={1.8} />
          </button>
        </div>
      </div>

      {/* Hover tooltip */}
      {tooltip && (
        <div
          className="fixed z-[100] pointer-events-none bg-gray-900/90 backdrop-blur-md border border-gray-700 rounded-lg shadow-2xl"
          style={{ left: tooltip.x + 16, top: tooltip.y - 16, padding: "10px 14px", minWidth: 190 }}
        >
          <div className="text-[13px] font-semibold text-white pb-1.5 mb-1.5 border-b border-gray-700 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-yellow-400 flex-shrink-0" />
            Cell {tooltip.cellId}
          </div>
          {tooltip.lines.map(m => (
            <div key={m.l} className="flex justify-between gap-4 text-[11px] leading-[1.7]">
              <span className="text-gray-400">{m.l}</span>
              <span className="text-white font-medium" style={{ fontFeatureSettings: "'tnum'" }}>{m.v}</span>
            </div>
          ))}
          <div className="text-[9px] text-gray-500 mt-1.5 pt-1.5 border-t border-gray-700">Click to inspect</div>
        </div>
      )}
    </>
  );
}
