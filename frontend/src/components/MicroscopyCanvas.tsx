import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Plotly from "plotly.js-dist-min";
import { extractPolygons, type CellFeatures } from "@/lib/canvas/extract";
import { hitTestPolygons } from "@/lib/canvas/hitTest";
import { viridisRgba, rdbuRgba } from "@/lib/canvas/colormap";
import { useJobStore } from "@/lib/jobStore";
import type { JobResult } from "@/lib/api";
import { fmt, fmtSigned } from "@/lib/utils";

interface Props {
  result: JobResult;
  showSegmentation: boolean;
  activeOverlay: string | null;
  cells: CellFeatures[];
}

export function MicroscopyCanvas({ result, showSegmentation, activeOverlay, cells }: Props) {
  const plotRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const setSelectedCellId = useJobStore(s => s.setSelectedCellId);
  const selectedCellId = useJobStore(s => s.selectedCellId);
  const [hoveredCellId, setHoveredCellId] = useState<number | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [tooltip, setTooltip] = useState<{ x: number; y: number; cellId: number; lines: { l: string; v: string }[] } | null>(null);

  const polygons = useMemo(() => extractPolygons(result.segmentation_figure_json), [result.segmentation_figure_json]);
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
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min || 1;
    const map = new Map<number, number>();
    for (const c of cells) {
      const v = c[key];
      if (typeof v === "number" && Number.isFinite(v)) {
        map.set(Number(c.cell_id), (v - min) / range);
      }
    }
    return { map, isSigned: activeOverlay === "mechano" };
  }, [activeOverlay, cells]);

  // Extract image dimensions and axis ranges from the Plotly figure
  const figInfo = useMemo(() => {
    try {
      const fig = JSON.parse(result.segmentation_figure_json);
      const xr = fig.layout?.xaxis?.range as [number, number] | undefined;
      const yr = fig.layout?.yaxis?.range as [number, number] | undefined;
      // Find the heatmap trace to get image dimensions
      let imgW = 0, imgH = 0;
      for (const t of (fig.data as Record<string, unknown>[])) {
        if (t.type === "heatmap" && Array.isArray(t.z)) {
          imgH = (t.z as unknown[][]).length;
          imgW = (t.z as unknown[][])[0]?.length ?? 0;
          break;
        }
      }
      if (xr && yr) return { xRange: xr, yRange: yr, imgW, imgH };
      // Fallback: use image dims
      if (imgW && imgH) return { xRange: [0, imgW] as [number, number], yRange: [imgH, 0] as [number, number], imgW, imgH };
    } catch { /* empty */ }
    return null;
  }, [result.segmentation_figure_json]);

  // Render Plotly — the image fills the container, no aspect ratio lock
  useEffect(() => {
    if (!plotRef.current) return;
    let parsed: { data: unknown[]; layout: Record<string, unknown> };
    try { parsed = JSON.parse(result.segmentation_figure_json); } catch { return; }

    const backendXaxis = (parsed.layout?.xaxis as Record<string, unknown>) ?? {};
    const backendYaxis = (parsed.layout?.yaxis as Record<string, unknown>) ?? {};

    // Remove any scaleanchor the backend may have set — we want the
    // image to stretch and fill the entire container with zero black bars.
    const { scaleanchor: _sa, scaleratio: _sr, constrain: _c, ...cleanYaxis } = backendYaxis as Record<string, unknown>;
    const { constrain: _cx, ...cleanXaxis } = backendXaxis as Record<string, unknown>;

    const layout = {
      ...parsed.layout,
      autosize: true,
      width: undefined,
      height: undefined,
      paper_bgcolor: "#000",
      plot_bgcolor: "#000",
      margin: { l: 0, r: 0, t: 0, b: 0 },
      xaxis: {
        ...cleanXaxis,
        visible: false,
        showgrid: false,
      },
      yaxis: {
        ...cleanYaxis,
        visible: false,
        showgrid: false,
        // NO scaleanchor — let the image fill the full viewport
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Plotly.react(plotRef.current, parsed.data as any, layout as any, {
      displayModeBar: false,
      displaylogo: false,
      responsive: true,
      staticPlot: true,
    } as any);
    return () => { if (plotRef.current) Plotly.purge(plotRef.current); };
  }, [result.segmentation_figure_json]);

  useEffect(() => { if (plotRef.current) Plotly.Plots.resize(plotRef.current); }, [size]);

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setSize({ w: Math.floor(width), h: Math.floor(height) });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Coordinate transforms: image coords ↔ screen coords
  // Since we removed scaleanchor, image stretches to fill — use independent X/Y scales
  const getTransform = useCallback(() => {
    if (!figInfo) return null;
    const imgW = figInfo.xRange[1] - figInfo.xRange[0];
    const imgH = Math.abs(figInfo.yRange[1] - figInfo.yRange[0]);
    const scaleX = size.w / imgW;
    const scaleY = size.h / imgH;
    const yFlip = figInfo.yRange[0] > figInfo.yRange[1];
    return { scaleX, scaleY, yFlip };
  }, [figInfo, size]);

  const toScreen = useCallback((x: number, y: number): [number, number] => {
    const t = getTransform(); if (!t || !figInfo) return [0, 0];
    return [
      (x - figInfo.xRange[0]) * t.scaleX,
      t.yFlip ? (figInfo.yRange[0] - y) * t.scaleY : (y - figInfo.yRange[0]) * t.scaleY,
    ];
  }, [getTransform, figInfo]);

  const toImage = useCallback((sx: number, sy: number): [number, number] => {
    const t = getTransform(); if (!t || !figInfo) return [0, 0];
    return [
      sx / t.scaleX + figInfo.xRange[0],
      t.yFlip ? figInfo.yRange[0] - sy / t.scaleY : sy / t.scaleY + figInfo.yRange[0],
    ];
  }, [getTransform, figInfo]);

  // Draw canvas overlay
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.w * dpr; canvas.height = size.h * dpr;
    canvas.style.width = `${size.w}px`; canvas.style.height = `${size.h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    if (!figInfo || polygons.length === 0) return;

    for (const poly of polygons) {
      if (poly.vertices.length < 3) continue;
      ctx.beginPath();
      const [sx0, sy0] = toScreen(poly.vertices[0][0], poly.vertices[0][1]);
      ctx.moveTo(sx0, sy0);
      for (let i = 1; i < poly.vertices.length; i++) {
        const [sx, sy] = toScreen(poly.vertices[i][0], poly.vertices[i][1]);
        ctx.lineTo(sx, sy);
      }
      ctx.closePath();

      // Overlay fill
      if (overlayValues) {
        const val = overlayValues.map.get(poly.cellId);
        if (val != null) {
          ctx.fillStyle = overlayValues.isSigned ? rdbuRgba(val, 0.35) : viridisRgba(val, 0.35);
          ctx.fill();
        }
      }

      // Segmentation outline
      if (showSegmentation) {
        if (poly.cellId === selectedCellId) {
          ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.lineWidth = 2;
          if (!overlayValues) { ctx.fillStyle = "rgba(255,255,255,0.06)"; ctx.fill(); }
        } else if (poly.cellId === hoveredCellId) {
          ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.lineWidth = 1.5;
        } else {
          ctx.strokeStyle = "rgba(255,255,255,0.3)"; ctx.lineWidth = 0.8;
        }
        ctx.stroke();
      }
    }

    // Scale bar — use X scale since bar is horizontal
    const t = getTransform();
    const pxUm = result.pixel_size_um ?? 0.656;
    if (t && pxUm > 0) {
      const barPx = (50 / pxUm) * t.scaleX;
      const bx = size.w - barPx - 24, by = size.h - 20;
      ctx.fillStyle = "#fff"; ctx.fillRect(bx, by, barPx, 2);
      ctx.fillRect(bx, by - 4, 1, 10); ctx.fillRect(bx + barPx - 1, by - 4, 1, 10);
      ctx.font = "600 10px Inter, sans-serif"; ctx.fillStyle = "rgba(255,255,255,0.8)"; ctx.textAlign = "center";
      ctx.fillText("50 \u00b5m", bx + barPx / 2, by - 8);
    }
  }, [size, polygons, showSegmentation, activeOverlay, overlayValues, selectedCellId, hoveredCellId, figInfo, toScreen, getTransform, result.pixel_size_um]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect(); if (!rect) return;
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const [ix, iy] = toImage(sx, sy);
    const cid = hitTestPolygons(polygons, ix, iy);
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
  }, [polygons, cellMap, toImage]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect(); if (!rect) return;
    const [ix, iy] = toImage(e.clientX - rect.left, e.clientY - rect.top);
    setSelectedCellId(hitTestPolygons(polygons, ix, iy));
  }, [polygons, toImage, setSelectedCellId]);

  return (
    <>
      <div ref={containerRef} className="w-full h-full bg-black relative overflow-hidden">
        <div ref={plotRef} className="absolute inset-0 pointer-events-none" />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 z-[2] cursor-crosshair"
          onMouseMove={handleMouseMove}
          onClick={handleClick}
          onMouseLeave={() => { setHoveredCellId(null); setTooltip(null); }}
        />
      </div>
      {tooltip && (
        <div
          className="fixed z-[100] pointer-events-none bg-white border border-gray-200 rounded-lg shadow-lg"
          style={{ left: tooltip.x + 16, top: tooltip.y - 12, padding: "12px 16px", minWidth: 180 }}
        >
          <div className="text-[13px] font-semibold text-gray-900 pb-2 mb-2 border-b border-gray-100">
            Cell {tooltip.cellId}
          </div>
          {tooltip.lines.map(m => (
            <div key={m.l} className="flex justify-between gap-5 text-[12px] leading-[1.8]">
              <span className="text-gray-400 font-medium">{m.l}</span>
              <span className="text-gray-900 font-medium" style={{ fontFeatureSettings: "'tnum'" }}>{m.v}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
