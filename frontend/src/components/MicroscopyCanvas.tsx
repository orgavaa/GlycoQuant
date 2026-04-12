/**
 * MicroscopyCanvas — the core instrument. HTML Canvas element with
 * multi-layer rendering, mouse interaction, zoom-to-cell, and real-time compositing.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  render,
  screenToImage,
  hitTestCell,
  type RenderState,
} from "@/lib/canvas/renderer";
import {
  decodeChannelPng,
  CHANNEL_LUTS,
  type ChannelEntry,
} from "@/lib/canvas/compositer";
import { extractPolygons, type FeatureFillState } from "@/lib/canvas/polygons";
import type { TooltipData } from "@/lib/canvas/tooltip";
import type { CellPolygon, CanvasTransform } from "@/types";
import { useJobStore } from "@/lib/jobStore";
import type { JobResult } from "@/lib/api";
import {
  IDENTITY_TRANSFORM,
  computeZoomToCell,
  animateTransform,
} from "@/lib/canvas/transform";

interface MicroscopyCanvasProps {
  result: JobResult;
  showSegmentation: boolean;
  activeOverlay: string | null;
  channelVisibility: Record<string, boolean>;
  showScaleBar?: boolean;
  showCellLabels?: boolean;
  onHoveredCellChange?: (cellId: number | null) => void;
}

interface CellRow {
  cell_id: number;
  [key: string]: number | undefined;
}

function fmt(v: number | undefined | null, d = 2): string {
  if (v == null || !Number.isFinite(v)) return "\u2014";
  return v.toFixed(d);
}

export function MicroscopyCanvas({
  result,
  showSegmentation,
  activeOverlay,
  channelVisibility,
  showScaleBar = true,
  showCellLabels = false,
  onHoveredCellChange,
}: MicroscopyCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const setSelectedCellId = useJobStore((s) => s.setSelectedCellId);
  const selectedCellId = useJobStore((s) => s.selectedCellId);
  const animCancelRef = useRef<(() => void) | null>(null);

  const [channelBitmaps, setChannelBitmaps] = useState<Map<string, ImageBitmap>>(new Map());
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [, setHoveredCellId] = useState<number | null>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 600 });
  const [zoomTransform, setZoomTransform] = useState<CanvasTransform>(IDENTITY_TRANSFORM);

  // Parse per-cell features from JobResult
  const rows: CellRow[] = useMemo(() => {
    try {
      return JSON.parse(result.features_df_json) as CellRow[];
    } catch {
      return [];
    }
  }, [result.features_df_json]);

  // Build cell polygons from segmentation figure
  const polygons: CellPolygon[] = useMemo(
    () => extractPolygons(result.segmentation_figure_json),
    [result.segmentation_figure_json],
  );

  // Decode channel PNGs into ImageBitmaps on mount
  useEffect(() => {
    if (!result.channel_pngs) return;
    const entries = Object.entries(result.channel_pngs);
    Promise.all(
      entries.map(async ([name, dataUrl]) => {
        const bmp = await decodeChannelPng(dataUrl);
        return [name, bmp] as [string, ImageBitmap];
      }),
    ).then((pairs) => {
      setChannelBitmaps(new Map(pairs));
    });
  }, [result.channel_pngs]);

  // Get image dimensions
  const imageSize = useMemo(() => {
    for (const bmp of channelBitmaps.values()) {
      return { w: bmp.width, h: bmp.height };
    }
    try {
      const fig = JSON.parse(result.segmentation_figure_json);
      const xRange = fig.layout?.xaxis?.range;
      const yRange = fig.layout?.yaxis?.range;
      if (xRange && yRange) {
        return {
          w: Math.abs(xRange[1] - xRange[0]),
          h: Math.abs(yRange[1] - yRange[0]),
        };
      }
    } catch { /* empty */ }
    return { w: 696, h: 520 };
  }, [channelBitmaps, result.segmentation_figure_json]);

  // Build feature fill state
  const featureFill: FeatureFillState | null = useMemo(() => {
    if (!activeOverlay) return null;
    const featureName =
      activeOverlay === "glyco"
        ? "glycocalyx_pericellular_ratio"
        : "mechano_score";
    const values = new Map<number, number>();
    let min = Infinity, max = -Infinity;
    for (const row of rows) {
      const v = row[featureName];
      if (typeof v === "number" && Number.isFinite(v)) {
        values.set(Number(row.cell_id), v);
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    if (values.size === 0) return null;
    return {
      featureName,
      values,
      colormap: activeOverlay === "glyco" ? "viridis" as const : "rdbu" as const,
      min,
      max,
    };
  }, [activeOverlay, rows]);

  // Build channel entries for the renderer
  const channelEntries: ChannelEntry[] = useMemo(() => {
    return ["dapi", "glycocalyx", "yap", "paxillin", "actin"].map((name) => ({
      name,
      bitmap: channelBitmaps.get(name) ?? null,
      visible: channelVisibility[name] ?? true,
      brightness: 1,
      lut: CHANNEL_LUTS[name] ?? [200, 200, 200] as [number, number, number],
    }));
  }, [channelBitmaps, channelVisibility]);

  // Zoom-to-cell animation when selectedCellId changes
  useEffect(() => {
    // Cancel previous animation
    if (animCancelRef.current) {
      animCancelRef.current();
      animCancelRef.current = null;
    }

    if (selectedCellId != null) {
      const target = computeZoomToCell(
        selectedCellId,
        polygons,
        imageSize.w,
        imageSize.h,
        canvasSize.w,
        canvasSize.h,
      );
      if (target) {
        animCancelRef.current = animateTransform(
          zoomTransform,
          target,
          300,
          setZoomTransform,
        );
      }
    } else {
      // Zoom back out
      animCancelRef.current = animateTransform(
        zoomTransform,
        IDENTITY_TRANSFORM,
        300,
        setZoomTransform,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCellId, polygons, imageSize, canvasSize.w, canvasSize.h]);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const obs = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setCanvasSize({ w: Math.floor(width), h: Math.floor(height) });
    });
    obs.observe(container);
    return () => obs.disconnect();
  }, []);

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasSize.w * dpr;
    canvas.height = canvasSize.h * dpr;
    canvas.style.width = `${canvasSize.w}px`;
    canvas.style.height = `${canvasSize.h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const pixelSizeUm = result.pixel_size_um;

    const state: RenderState = {
      channels: { entries: channelEntries },
      polygons,
      showSegmentation,
      featureFill,
      tooltip,
      selectedCellId,
      pixelSizeUm: pixelSizeUm ?? 0.656,
      canvasWidth: canvasSize.w,
      canvasHeight: canvasSize.h,
      imageWidth: imageSize.w,
      imageHeight: imageSize.h,
      zoomTransform,
      dimOthers: selectedCellId != null,
      showScaleBar,
      showCellLabels,
    };

    render(ctx, state);
  }, [
    canvasSize,
    channelEntries,
    polygons,
    showSegmentation,
    featureFill,
    tooltip,
    selectedCellId,
    imageSize,
    zoomTransform,
    showScaleBar,
    showCellLabels,
    result,
  ]);

  // Mouse handlers
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      const pixelSizeUm = result.pixel_size_um;
      const state: RenderState = {
        channels: { entries: channelEntries },
        polygons,
        showSegmentation,
        featureFill,
        tooltip: null,
        selectedCellId,
        pixelSizeUm: pixelSizeUm ?? 0.656,
        canvasWidth: canvasSize.w,
        canvasHeight: canvasSize.h,
        imageWidth: imageSize.w,
        imageHeight: imageSize.h,
        zoomTransform,
        dimOthers: selectedCellId != null,
        showScaleBar,
        showCellLabels,
      };

      const [ix, iy] = screenToImage(sx, sy, state);
      const cellId = hitTestCell(polygons, ix, iy);

      setHoveredCellId(cellId);
      onHoveredCellChange?.(cellId);

      if (cellId != null) {
        const row = rows.find((r) => Number(r.cell_id) === cellId);
        const metrics = row
          ? [
              { label: "glyco", value: fmt(row.glycocalyx_pericellular_ratio) },
              { label: "YAP N/C", value: fmt(row.yap_nc_ratio_size_corrected) },
              { label: "mechano", value: fmtSigned(row.mechano_score) },
              { label: "FA mature", value: fmtPct(row.fa_mature_fraction) },
            ]
          : [];
        setTooltip({ x: sx, y: sy, cellId, metrics });
      } else {
        setTooltip(null);
      }
    },
    [polygons, rows, channelEntries, showSegmentation, featureFill, selectedCellId, canvasSize, imageSize, zoomTransform, showScaleBar, showCellLabels, onHoveredCellChange, result],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      const pixelSizeUm = result.pixel_size_um;
      const state: RenderState = {
        channels: { entries: channelEntries },
        polygons,
        showSegmentation,
        featureFill,
        tooltip: null,
        selectedCellId,
        pixelSizeUm: pixelSizeUm ?? 0.656,
        canvasWidth: canvasSize.w,
        canvasHeight: canvasSize.h,
        imageWidth: imageSize.w,
        imageHeight: imageSize.h,
        zoomTransform,
        dimOthers: selectedCellId != null,
        showScaleBar,
        showCellLabels,
      };

      const [ix, iy] = screenToImage(sx, sy, state);
      const cellId = hitTestCell(polygons, ix, iy);
      setSelectedCellId(cellId);
    },
    [polygons, channelEntries, showSegmentation, featureFill, selectedCellId, canvasSize, imageSize, setSelectedCellId, zoomTransform, showScaleBar, showCellLabels, result],
  );

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
    setHoveredCellId(null);
    onHoveredCellChange?.(null);
  }, [onHoveredCellChange]);

  // Fallback: if no channel PNGs, render the Plotly segmentation figure directly
  if (!result.channel_pngs || channelBitmaps.size === 0) {
    return (
      <div ref={containerRef} className="w-full h-full bg-black relative overflow-hidden">
        <FallbackPlotly figureJson={result.segmentation_figure_json} />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full bg-black relative overflow-hidden">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 cursor-crosshair"
        onMouseMove={handleMouseMove}
        onClick={handleClick}
        onMouseLeave={handleMouseLeave}
      />
    </div>
  );
}

function FallbackPlotly({ figureJson }: { figureJson: string }) {
  const plotRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!plotRef.current || mountedRef.current) return;
    mountedRef.current = true;

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Plotly = require("plotly.js-dist-min") as typeof import("plotly.js-dist-min");

    let parsed: { data: unknown; layout: unknown };
    try { parsed = JSON.parse(figureJson); } catch { return; }

    const layout = {
      ...(parsed.layout as Record<string, unknown>),
      autosize: true,
      paper_bgcolor: "#000",
      plot_bgcolor: "#000",
      font: { color: "#888", size: 10 },
      margin: { l: 0, r: 0, t: 0, b: 0 },
      xaxis: { visible: false, showgrid: false },
      yaxis: { visible: false, showgrid: false, scaleanchor: "x" },
    };
    const config = { displayModeBar: false, displaylogo: false, responsive: true, staticPlot: false };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Plotly as any).react(plotRef.current!, parsed.data as any, layout as any, config as any);

    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (plotRef.current) (Plotly as any).purge(plotRef.current);
      mountedRef.current = false;
    };
  }, [figureJson]);

  return (
    <div
      ref={plotRef}
      className="absolute inset-0"
      style={{ width: "100%", height: "100%" }}
    />
  );
}

function fmtSigned(v: number | undefined | null): string {
  if (v == null || !Number.isFinite(v)) return "\u2014";
  return (v >= 0 ? "+" : "") + v.toFixed(2);
}

function fmtPct(v: number | undefined | null): string {
  if (v == null || !Number.isFinite(v)) return "\u2014";
  return (v * 100).toFixed(0) + "%";
}
