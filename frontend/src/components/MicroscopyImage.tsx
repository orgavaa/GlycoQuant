/**
 * MicroscopyImage — hybrid Plotly + Canvas overlay.
 * Plotly renders the segmentation figure (the actual microscopy image).
 * A transparent Canvas on top handles hover highlight, click selection, scale bar.
 *
 * Key fix: Plotly has pointer-events:none so mouse events go to the canvas.
 * The canvas sits above Plotly in z-order and handles all interaction.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Plotly from "plotly.js-dist-min";
import { extractPolygons, hitTestPolygons, type CellFeatures, fmt, fmtSigned } from "@/lib/canvas/extract";
import { useJobStore } from "@/lib/jobStore";
import type { JobResult } from "@/lib/api";

const FONT = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif";

interface Props {
  result: JobResult;
  showSegmentation: boolean;
  activeOverlay: string | null;
  cells: CellFeatures[];
}

export function MicroscopyImage({ result, showSegmentation, cells }: Props) {
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

  // Parse axis ranges from the Plotly layout once
  const ranges = useMemo(() => {
    try {
      const fig = JSON.parse(result.segmentation_figure_json);
      const xr = fig.layout?.xaxis?.range as [number, number] | undefined;
      const yr = fig.layout?.yaxis?.range as [number, number] | undefined;
      if (xr && yr) return { xRange: xr, yRange: yr };
    } catch { /* empty */ }
    return null;
  }, [result.segmentation_figure_json]);

  // Render Plotly figure — fills the container, no axes, no toolbar
  useEffect(() => {
    if (!plotRef.current) return;
    let parsed: { data: unknown[]; layout: Record<string, unknown> };
    try { parsed = JSON.parse(result.segmentation_figure_json); } catch { return; }

    const layout = {
      ...parsed.layout,
      autosize: true, width: undefined, height: undefined,
      paper_bgcolor: "#000", plot_bgcolor: "#000",
      margin: { l: 0, r: 0, t: 0, b: 0 },
      xaxis: { ...(parsed.layout.xaxis as object ?? {}), visible: false, showgrid: false },
      yaxis: { ...(parsed.layout.yaxis as object ?? {}), visible: false, showgrid: false, scaleanchor: "x" },
    };
    const config = { displayModeBar: false, displaylogo: false, responsive: true, staticPlot: true };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Plotly.react(plotRef.current, parsed.data as any, layout as any, config as any);

    return () => { if (plotRef.current) Plotly.purge(plotRef.current); };
  }, [result.segmentation_figure_json]);

  // Resize on plotly after container changes
  useEffect(() => {
    if (plotRef.current) {
      Plotly.Plots.resize(plotRef.current);
    }
  }, [size]);

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

  // Coordinate mapping helpers
  const getTransform = useCallback(() => {
    if (!ranges) return null;
    const imgW = ranges.xRange[1] - ranges.xRange[0];
    const imgH = Math.abs(ranges.yRange[1] - ranges.yRange[0]);
    const scaleX = size.w / imgW;
    const scaleY = size.h / imgH;
    const scale = Math.min(scaleX, scaleY);
    const offsetX = (size.w - imgW * scale) / 2;
    const offsetY = (size.h - imgH * scale) / 2;
    const yFlip = ranges.yRange[0] > ranges.yRange[1];
    return { scale, offsetX, offsetY, yFlip, imgW, imgH };
  }, [ranges, size]);

  const toScreen = useCallback((x: number, y: number): [number, number] => {
    const t = getTransform();
    if (!t) return [0, 0];
    const sx = (x - ranges!.xRange[0]) * t.scale + t.offsetX;
    const sy = t.yFlip
      ? (ranges!.yRange[0] - y) * t.scale + t.offsetY
      : (y - ranges!.yRange[0]) * t.scale + t.offsetY;
    return [sx, sy];
  }, [getTransform, ranges]);

  const toImage = useCallback((sx: number, sy: number): [number, number] => {
    const t = getTransform();
    if (!t || !ranges) return [0, 0];
    const ix = (sx - t.offsetX) / t.scale + ranges.xRange[0];
    const iy = t.yFlip
      ? ranges.yRange[0] - (sy - t.offsetY) / t.scale
      : (sy - t.offsetY) / t.scale + ranges.yRange[0];
    return [ix, iy];
  }, [getTransform, ranges]);

  // Draw canvas overlay
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    canvas.style.width = `${size.w}px`;
    canvas.style.height = `${size.h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);

    if (!ranges || polygons.length === 0) return;

    // Draw segmentation outlines
    if (showSegmentation) {
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

        if (poly.cellId === selectedCellId) {
          ctx.strokeStyle = "rgba(255,255,255,0.9)";
          ctx.lineWidth = 2.5;
          ctx.fillStyle = "rgba(255,255,255,0.06)";
          ctx.fill();
        } else if (poly.cellId === hoveredCellId) {
          ctx.strokeStyle = "rgba(0,255,255,0.85)";
          ctx.lineWidth = 2;
        } else {
          ctx.strokeStyle = "rgba(0,255,255,0.3)";
          ctx.lineWidth = 1;
        }
        ctx.stroke();
      }
    }

    // Scale bar
    const t = getTransform();
    const pxUm = result.pixel_size_um ?? 0.656;
    if (t && pxUm > 0) {
      const barUm = 50;
      const barPx = (barUm / pxUm) * t.scale;
      const bx = size.w - barPx - 24;
      const by = size.h - 20;
      ctx.fillStyle = "#fff";
      ctx.fillRect(bx, by, barPx, 2);
      ctx.fillRect(bx, by - 4, 1, 10);
      ctx.fillRect(bx + barPx - 1, by - 4, 1, 10);
      ctx.font = `600 10px ${FONT}`;
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.textAlign = "center";
      ctx.fillText(`${barUm} \u00b5m`, bx + barPx / 2, by - 8);
    }
  }, [size, polygons, showSegmentation, selectedCellId, hoveredCellId, ranges, toScreen, getTransform, result.pixel_size_um]);

  // Mouse handlers
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const [ix, iy] = toImage(sx, sy);
    const cid = hitTestPolygons(polygons, ix, iy);
    setHoveredCellId(cid);

    if (cid != null) {
      const cell = cellMap.get(cid);
      const lines = cell ? [
        { l: "glyco", v: fmt(cell.glycocalyx_pericellular_ratio as number | null) },
        { l: "YAP N/C", v: fmt(cell.yap_nc_ratio_size_corrected as number | null) },
        { l: "mechano", v: fmtSigned(cell.mechano_score as number | null) },
        { l: "FA mature", v: cell.fa_mature_fraction != null && Number.isFinite(cell.fa_mature_fraction) ? ((cell.fa_mature_fraction as number) * 100).toFixed(0) + "%" : "\u2014" },
      ] : [];
      setTooltip({ x: sx, y: sy, cellId: cid, lines });
    } else {
      setTooltip(null);
    }
  }, [polygons, cellMap, toImage]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const [ix, iy] = toImage(e.clientX - rect.left, e.clientY - rect.top);
    setSelectedCellId(hitTestPolygons(polygons, ix, iy));
  }, [polygons, toImage, setSelectedCellId]);

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%", position: "relative", background: "#000", overflow: "hidden" }}>
      {/* Plotly layer — pointer-events disabled so canvas gets the events */}
      <div ref={plotRef} style={{ position: "absolute", inset: 0, pointerEvents: "none" }} />

      {/* Canvas overlay — on top, receives all mouse events */}
      <canvas
        ref={canvasRef}
        style={{ position: "absolute", inset: 0, zIndex: 2, cursor: "crosshair" }}
        onMouseMove={handleMouseMove}
        onClick={handleClick}
        onMouseLeave={() => { setHoveredCellId(null); setTooltip(null); }}
      />

      {/* Tooltip — HTML div for text clarity */}
      {tooltip && (
        <div style={{
          position: "absolute", zIndex: 30, pointerEvents: "none",
          left: Math.min(tooltip.x + 16, size.w - 180),
          top: Math.max(tooltip.y - 50, 8),
          background: "rgba(0,0,0,0.92)", border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: 4, padding: "10px 14px", fontFamily: FONT,
          minWidth: 150,
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#eee", marginBottom: 6 }}>
            Cell {tooltip.cellId}
          </div>
          {tooltip.lines.map(m => (
            <div key={m.l} style={{ fontSize: 11, color: "#999", lineHeight: 1.8, display: "flex", justifyContent: "space-between", gap: 20 }}>
              <span>{m.l}</span>
              <span style={{ color: "#eee", fontWeight: 500 }}>{m.v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
