/**
 * MicroscopyImage — hybrid Plotly + Canvas overlay.
 * Plotly renders the segmentation figure (the microscopy image).
 * A transparent Canvas on top handles hover/click/fills.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Plotly from "plotly.js-dist-min";
import { extractPolygons, hitTestPolygons, type CellFeatures, fmt, fmtSigned } from "@/lib/canvas/extract";
import { useJobStore } from "@/lib/jobStore";
import type { JobResult } from "@/lib/api";

interface MicroscopyImageProps {
  result: JobResult;
  showSegmentation: boolean;
  activeOverlay: string | null;
  cells: CellFeatures[];
}

export function MicroscopyImage({ result, showSegmentation, activeOverlay, cells }: MicroscopyImageProps) {
  const plotRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const setSelectedCellId = useJobStore(s => s.setSelectedCellId);
  const selectedCellId = useJobStore(s => s.selectedCellId);
  const [hoveredCellId, setHoveredCellId] = useState<number | null>(null);
  const [containerSize, setContainerSize] = useState({ w: 800, h: 600 });
  const [tooltipData, setTooltipData] = useState<{ x: number; y: number; cellId: number; metrics: { label: string; value: string }[] } | null>(null);

  // Extract polygons
  const polygons = useMemo(() => extractPolygons(result.segmentation_figure_json), [result.segmentation_figure_json]);

  // Cell lookup map
  const cellMap = useMemo(() => {
    const m = new Map<number, CellFeatures>();
    for (const c of cells) m.set(Number(c.cell_id), c);
    return m;
  }, [cells]);

  // Get Plotly layout ranges for coordinate mapping
  const plotRanges = useRef<{ xRange: [number, number]; yRange: [number, number] } | null>(null);

  // Render Plotly figure
  useEffect(() => {
    if (!plotRef.current) return;
    let parsed: { data: unknown[]; layout: Record<string, unknown> };
    try { parsed = JSON.parse(result.segmentation_figure_json); } catch { return; }

    const layout = {
      ...parsed.layout,
      autosize: true,
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      margin: { l: 0, r: 0, t: 0, b: 0 },
      xaxis: { ...((parsed.layout.xaxis as Record<string, unknown>) ?? {}), visible: false, showgrid: false },
      yaxis: { ...((parsed.layout.yaxis as Record<string, unknown>) ?? {}), visible: false, showgrid: false, scaleanchor: "x" },
    };

    // Store axis ranges for coordinate mapping
    const xr = (parsed.layout.xaxis as Record<string, unknown>)?.range as [number, number] | undefined;
    const yr = (parsed.layout.yaxis as Record<string, unknown>)?.range as [number, number] | undefined;
    if (xr && yr) plotRanges.current = { xRange: xr, yRange: yr };

    const config = { displayModeBar: false, displaylogo: false, responsive: true, staticPlot: true };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Plotly.react(plotRef.current, parsed.data as any, layout as any, config as any);

    return () => { if (plotRef.current) Plotly.purge(plotRef.current); };
  }, [result.segmentation_figure_json]);

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setContainerSize({ w: Math.floor(width), h: Math.floor(height) });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Draw Canvas overlay
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = containerSize.w * dpr;
    canvas.height = containerSize.h * dpr;
    canvas.style.width = `${containerSize.w}px`;
    canvas.style.height = `${containerSize.h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Coordinate mapping: image coords → screen coords
    const ranges = plotRanges.current;
    if (!ranges || polygons.length === 0) return;

    const imgW = ranges.xRange[1] - ranges.xRange[0];
    const imgH = Math.abs(ranges.yRange[1] - ranges.yRange[0]);
    const scaleX = containerSize.w / imgW;
    const scaleY = containerSize.h / imgH;
    const scale = Math.min(scaleX, scaleY);
    const offsetX = (containerSize.w - imgW * scale) / 2;
    const offsetY = (containerSize.h - imgH * scale) / 2;
    const yFlip = ranges.yRange[0] > ranges.yRange[1]; // Plotly often inverts Y

    function toScreen(x: number, y: number): [number, number] {
      const sx = (x - ranges!.xRange[0]) * scale + offsetX;
      const sy = yFlip
        ? (ranges!.yRange[0] - y) * scale + offsetY
        : (y - ranges!.yRange[0]) * scale + offsetY;
      return [sx, sy];
    }

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
          ctx.lineWidth = 2;
          ctx.fillStyle = "rgba(255,255,255,0.05)";
          ctx.fill();
        } else if (poly.cellId === hoveredCellId) {
          ctx.strokeStyle = "rgba(0,255,255,0.8)";
          ctx.lineWidth = 2;
        } else {
          ctx.strokeStyle = "rgba(0,255,255,0.35)";
          ctx.lineWidth = 1;
        }
        ctx.stroke();
      }
    }

    // Draw scale bar
    const pixelSizeUm = result.pixel_size_um ?? 0.656;
    if (pixelSizeUm > 0) {
      const barUm = 50;
      const barPx = (barUm / pixelSizeUm) * scale;
      const bx = containerSize.w - barPx - 20;
      const by = containerSize.h - 16;
      ctx.fillStyle = "#fff";
      ctx.fillRect(bx, by, barPx, 2);
      ctx.fillRect(bx, by - 3, 1, 8);
      ctx.fillRect(bx + barPx - 1, by - 3, 1, 8);
      ctx.font = "9px ui-monospace, monospace";
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.textAlign = "center";
      ctx.fillText(`${barUm} \u00b5m`, bx + barPx / 2, by - 6);
    }
  }, [containerSize, polygons, showSegmentation, activeOverlay, selectedCellId, hoveredCellId, result.pixel_size_um]);

  // Mouse handlers — convert screen coords to image coords for hit testing
  const screenToImage = useCallback((sx: number, sy: number): [number, number] => {
    const ranges = plotRanges.current;
    if (!ranges) return [0, 0];
    const imgW = ranges.xRange[1] - ranges.xRange[0];
    const imgH = Math.abs(ranges.yRange[1] - ranges.yRange[0]);
    const scaleX = containerSize.w / imgW;
    const scaleY = containerSize.h / imgH;
    const scale = Math.min(scaleX, scaleY);
    const offsetX = (containerSize.w - imgW * scale) / 2;
    const offsetY = (containerSize.h - imgH * scale) / 2;
    const yFlip = ranges.yRange[0] > ranges.yRange[1];
    const ix = (sx - offsetX) / scale + ranges.xRange[0];
    const iy = yFlip
      ? ranges.yRange[0] - (sy - offsetY) / scale
      : (sy - offsetY) / scale + ranges.yRange[0];
    return [ix, iy];
  }, [containerSize]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const [ix, iy] = screenToImage(sx, sy);
    const cid = hitTestPolygons(polygons, ix, iy);
    setHoveredCellId(cid);

    if (cid != null) {
      const cell = cellMap.get(cid);
      const metrics = cell ? [
        { label: "glyco", value: fmt(cell.glycocalyx_pericellular_ratio as number | null) },
        { label: "YAP N/C", value: fmt(cell.yap_nc_ratio_size_corrected as number | null) },
        { label: "mechano", value: fmtSigned(cell.mechano_score as number | null) },
        { label: "FA mature", value: cell.fa_mature_fraction != null && Number.isFinite(cell.fa_mature_fraction) ? ((cell.fa_mature_fraction as number) * 100).toFixed(0) + "%" : "\u2014" },
      ] : [];
      setTooltipData({ x: sx, y: sy, cellId: cid, metrics });
    } else {
      setTooltipData(null);
    }
  }, [polygons, cellMap, screenToImage]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const [ix, iy] = screenToImage(sx, sy);
    const cid = hitTestPolygons(polygons, ix, iy);
    setSelectedCellId(cid);
  }, [polygons, screenToImage, setSelectedCellId]);

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%", position: "relative", background: "#000" }}>
      {/* Plotly layer — the microscopy image */}
      <div ref={plotRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />

      {/* Canvas overlay — hover/click/segmentation strokes */}
      <canvas
        ref={canvasRef}
        style={{ position: "absolute", inset: 0, cursor: "crosshair", zIndex: 5 }}
        onMouseMove={handleMouseMove}
        onClick={handleClick}
        onMouseLeave={() => { setHoveredCellId(null); setTooltipData(null); }}
      />

      {/* Tooltip */}
      {tooltipData && (
        <div style={{
          position: "absolute", zIndex: 20, pointerEvents: "none",
          left: tooltipData.x + 14, top: tooltipData.y - 40,
          background: "rgba(0,0,0,0.92)", border: "1px solid #333",
          borderRadius: 3, padding: "10px 14px",
          fontFamily: "ui-monospace, 'JetBrains Mono', monospace",
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#eee", marginBottom: 6 }}>
            Cell {tooltipData.cellId}
          </div>
          {tooltipData.metrics.map(m => (
            <div key={m.label} style={{ fontSize: 10, color: "#888", lineHeight: 1.8, display: "flex", justifyContent: "space-between", gap: 16 }}>
              <span>{m.label}</span>
              <span style={{ color: "#eee" }}>{m.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
