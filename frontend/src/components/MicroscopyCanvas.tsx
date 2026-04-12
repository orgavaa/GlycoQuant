/**
 * MicroscopyCanvas — the core instrument. HTML Canvas element with
 * multi-layer rendering, mouse interaction, and real-time compositing.
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
import type { CellPolygon, FeatureFillState } from "@/lib/canvas/polygons";
import type { TooltipData } from "@/lib/canvas/tooltip";
import { useJobStore } from "@/lib/jobStore";
import type { JobResult } from "@/lib/api";

interface MicroscopyCanvasProps {
  result: JobResult;
  showSegmentation: boolean;
  activeOverlay: string | null;
  channelVisibility: Record<string, boolean>;
}

interface CellRow {
  cell_id: number;
  [key: string]: number | undefined;
}

export function MicroscopyCanvas({
  result,
  showSegmentation,
  activeOverlay,
  channelVisibility,
}: MicroscopyCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const setSelectedCellId = useJobStore((s) => s.setSelectedCellId);
  const selectedCellId = useJobStore((s) => s.selectedCellId);

  const [channelBitmaps, setChannelBitmaps] = useState<Map<string, ImageBitmap>>(new Map());
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 600 });

  // Parse per-cell features from JobResult
  const rows: CellRow[] = useMemo(() => {
    try {
      return JSON.parse(result.features_df_json) as CellRow[];
    } catch {
      return [];
    }
  }, [result.features_df_json]);

  // Build cell polygons from the Plotly segmentation figure's Scatter traces
  const polygons: CellPolygon[] = useMemo(() => {
    try {
      const fig = JSON.parse(result.segmentation_figure_json);
      const traces = fig.data as Array<{
        x?: number[];
        y?: number[];
        customdata?: Array<number | number[]>;
        type?: string;
      }>;
      const polys: CellPolygon[] = [];
      for (const trace of traces) {
        if (trace.type === "heatmap" || !trace.x || !trace.y || !trace.customdata) continue;
        const cd = trace.customdata[0];
        const cellId = Array.isArray(cd) ? cd[0] : cd;
        if (typeof cellId !== "number") continue;
        const vertices: [number, number][] = [];
        for (let i = 0; i < trace.x.length; i++) {
          const x = trace.x[i];
          const y = trace.y[i];
          if (typeof x === "number" && typeof y === "number") {
            vertices.push([x, y]);
          }
        }
        if (vertices.length >= 3) {
          polys.push({ cellId, vertices });
        }
      }
      return polys;
    } catch {
      return [];
    }
  }, [result.segmentation_figure_json]);

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

  // Get image dimensions from the first channel bitmap or the Plotly figure
  const imageSize = useMemo(() => {
    for (const bmp of channelBitmaps.values()) {
      return { w: bmp.width, h: bmp.height };
    }
    // Fallback: parse from Plotly figure layout
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
    } catch {}
    return { w: 696, h: 520 }; // BBBC022 default
  }, [channelBitmaps, result.segmentation_figure_json]);

  // Build feature fill state
  const featureFill: FeatureFillState | null = useMemo(() => {
    if (!activeOverlay) return null;
    const featureName =
      activeOverlay === "glyco"
        ? "glycocalyx_pericellular_ratio"
        : "mechano_score";
    const values = new Map<number, number>();
    let min = Infinity,
      max = -Infinity;
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
      colormap: activeOverlay === "glyco" ? "viridis" : "rdbu",
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
      lut: CHANNEL_LUTS[name] ?? [200, 200, 200],
    }));
  }, [channelBitmaps, channelVisibility]);

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

    canvas.width = canvasSize.w * window.devicePixelRatio;
    canvas.height = canvasSize.h * window.devicePixelRatio;
    canvas.style.width = `${canvasSize.w}px`;
    canvas.style.height = `${canvasSize.h}px`;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const state: RenderState = {
      channels: { entries: channelEntries },
      polygons,
      showSegmentation,
      featureFill,
      tooltip,
      selectedCellId,
      pixelSizeUm: 0.656,
      canvasWidth: canvasSize.w,
      canvasHeight: canvasSize.h,
      imageWidth: imageSize.w,
      imageHeight: imageSize.h,
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
  ]);

  // Mouse handlers
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      const state: RenderState = {
        channels: { entries: channelEntries },
        polygons,
        showSegmentation,
        featureFill,
        tooltip: null,
        selectedCellId,
        pixelSizeUm: 0.656,
        canvasWidth: canvasSize.w,
        canvasHeight: canvasSize.h,
        imageWidth: imageSize.w,
        imageHeight: imageSize.h,
      };

      const [ix, iy] = screenToImage(sx, sy, state);
      const cellId = hitTestCell(polygons, ix, iy);

      if (cellId != null) {
        const row = rows.find((r) => Number(r.cell_id) === cellId);
        const metrics = row
          ? [
              { label: "Glyco ratio", value: fmt(row.glycocalyx_pericellular_ratio) },
              { label: "YAP N/C", value: fmt(row.yap_nc_ratio_size_corrected) },
              { label: "Mechano", value: fmt(row.mechano_score) },
              { label: "FA mature", value: fmt(row.fa_mature_fraction) },
            ]
          : [];
        setTooltip({ x: sx, y: sy, cellId, metrics });
      } else {
        setTooltip(null);
      }
    },
    [polygons, rows, channelEntries, showSegmentation, featureFill, selectedCellId, canvasSize, imageSize],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      const state: RenderState = {
        channels: { entries: channelEntries },
        polygons,
        showSegmentation,
        featureFill,
        tooltip: null,
        selectedCellId,
        pixelSizeUm: 0.656,
        canvasWidth: canvasSize.w,
        canvasHeight: canvasSize.h,
        imageWidth: imageSize.w,
        imageHeight: imageSize.h,
      };

      const [ix, iy] = screenToImage(sx, sy, state);
      const cellId = hitTestCell(polygons, ix, iy);
      setSelectedCellId(cellId);
    },
    [polygons, channelEntries, showSegmentation, featureFill, selectedCellId, canvasSize, imageSize, setSelectedCellId],
  );

  const handleMouseLeave = useCallback(() => setTooltip(null), []);

  // Fallback: if no channel PNGs, render the Plotly figure
  if (!result.channel_pngs || channelBitmaps.size === 0) {
    // Import PlotlyChart dynamically for fallback
    return (
      <div ref={containerRef} className="flex-1 bg-black relative overflow-hidden">
        <FallbackPlotly figureJson={result.segmentation_figure_json} />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 bg-black relative overflow-hidden">
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
  const { PlotlyChart } = require("@/components/PlotlyChart");
  return (
    <div className="w-full h-full [&_.js-plotly-plot]:!h-full [&_.plot-container]:!h-full [&_.svg-container]:!h-full">
      <PlotlyChart figureJson={figureJson} height={window.innerHeight - 80} />
    </div>
  );
}

function fmt(v: number | undefined | null, d = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(d);
}
