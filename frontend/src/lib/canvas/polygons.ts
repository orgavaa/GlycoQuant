/**
 * Cell polygon drawing + point-in-polygon hit-testing + colormaps.
 */
import type { CellPolygon } from "@/types";

export type { CellPolygon };

export interface FeatureFillState {
  featureName: string;
  values: Map<number, number>; // cellId -> value
  colormap: "viridis" | "rdbu";
  min: number;
  max: number;
}

// Viridis 5-stop
const VIRIDIS = [
  [68, 1, 84],
  [59, 82, 139],
  [33, 145, 140],
  [94, 201, 98],
  [253, 231, 37],
];

// RdBu diverging 5-stop (dark midpoint for black canvas)
const RDBU = [
  [178, 24, 43],
  [200, 100, 80],
  [80, 80, 80],
  [80, 130, 180],
  [33, 102, 172],
];

function interpolateColor(
  stops: number[][],
  t: number,
): [number, number, number] {
  const clamped = Math.max(0, Math.min(1, t));
  const idx = clamped * (stops.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, stops.length - 1);
  const frac = idx - lo;
  return [
    stops[lo][0] + (stops[hi][0] - stops[lo][0]) * frac,
    stops[lo][1] + (stops[hi][1] - stops[lo][1]) * frac,
    stops[lo][2] + (stops[hi][2] - stops[lo][2]) * frac,
  ];
}

function drawPath(ctx: CanvasRenderingContext2D, vertices: [number, number][]) {
  ctx.beginPath();
  ctx.moveTo(vertices[0][0], vertices[0][1]);
  for (let i = 1; i < vertices.length; i++) {
    ctx.lineTo(vertices[i][0], vertices[i][1]);
  }
  ctx.closePath();
}

export function drawPolygons(
  ctx: CanvasRenderingContext2D,
  polygons: CellPolygon[],
  selectedCellId: number | null,
  hoveredCellId: number | null,
  dimOthers: boolean,
): void {
  for (const poly of polygons) {
    if (poly.vertices.length < 3) continue;

    drawPath(ctx, poly.vertices);

    if (poly.cellId === selectedCellId) {
      // Selected: white ring + subtle fill
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 2;
    } else if (poly.cellId === hoveredCellId) {
      // Hovered: bright cyan
      ctx.strokeStyle = "rgba(0,255,255,0.8)";
      ctx.lineWidth = 2;
    } else if (dimOthers) {
      // Dimmed when another cell is selected
      ctx.strokeStyle = "rgba(0,255,255,0.1)";
      ctx.lineWidth = 0.5;
    } else {
      // Default
      ctx.strokeStyle = "rgba(0,255,255,0.4)";
      ctx.lineWidth = 1;
    }
    ctx.stroke();
  }
}

export function drawFeatureFills(
  ctx: CanvasRenderingContext2D,
  polygons: CellPolygon[],
  fill: FeatureFillState,
): void {
  const stops = fill.colormap === "viridis" ? VIRIDIS : RDBU;
  const range = fill.max - fill.min || 1;

  for (const poly of polygons) {
    if (poly.vertices.length < 3) continue;
    const val = fill.values.get(poly.cellId);
    if (val === undefined || !Number.isFinite(val)) continue;

    const t = (val - fill.min) / range;
    const [r, g, b] = interpolateColor(stops, t);

    drawPath(ctx, poly.vertices);
    ctx.fillStyle = `rgba(${r | 0},${g | 0},${b | 0},0.6)`;
    ctx.fill();
    ctx.strokeStyle = "rgba(0,255,255,0.3)";
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }
}

/**
 * Draw a thin vertical colorbar on the right edge of the canvas.
 */
export function drawColorbar(
  ctx: CanvasRenderingContext2D,
  fill: FeatureFillState,
  canvasWidth: number,
  canvasHeight: number,
): void {
  const stops = fill.colormap === "viridis" ? VIRIDIS : RDBU;
  const barW = 10;
  const barH = 150;
  const x = canvasWidth - barW - 40;
  const y = (canvasHeight - barH) / 2;

  // Draw gradient bar
  for (let i = 0; i < barH; i++) {
    const t = 1 - i / barH; // top = max, bottom = min
    const [r, g, b] = interpolateColor(stops, t);
    ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
    ctx.fillRect(x, y + i, barW, 1);
  }

  // Labels
  ctx.font = "9px ui-monospace, monospace";
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.textAlign = "left";
  ctx.fillText(fill.max.toFixed(2), x + barW + 4, y + 8);
  ctx.fillText(fill.min.toFixed(2), x + barW + 4, y + barH);

  // Feature name
  const shortName = fill.featureName
    .replace("glycocalyx_pericellular_ratio", "glyco ratio")
    .replace("mechano_score", "mechano");
  ctx.fillText(shortName, x + barW + 4, y - 6);
}

/**
 * Point-in-polygon hit test via ray casting.
 * Returns the cell ID of the polygon containing (x, y), or null.
 */
export function hitTestCell(
  polygons: CellPolygon[],
  x: number,
  y: number,
): number | null {
  // First pass: bounding box check
  for (const poly of polygons) {
    const bb = poly.bbox;
    if (x < bb.x || x > bb.x + bb.width || y < bb.y || y > bb.y + bb.height) continue;
    if (pointInPolygon(x, y, poly.vertices)) {
      return poly.cellId;
    }
  }
  return null;
}

function pointInPolygon(
  x: number,
  y: number,
  vertices: [number, number][],
): boolean {
  let inside = false;
  const n = vertices.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = vertices[i][0], yi = vertices[i][1];
    const xj = vertices[j][0], yj = vertices[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Parse Plotly segmentation figure JSON into CellPolygon[].
 */
export function extractPolygons(segFigureJson: string): CellPolygon[] {
  try {
    const fig = JSON.parse(segFigureJson);
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
        // Compute centroid and bounding box
        let cx = 0, cy = 0;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const [vx, vy] of vertices) {
          cx += vx; cy += vy;
          if (vx < minX) minX = vx;
          if (vy < minY) minY = vy;
          if (vx > maxX) maxX = vx;
          if (vy > maxY) maxY = vy;
        }
        cx /= vertices.length;
        cy /= vertices.length;
        polys.push({
          cellId,
          vertices,
          centroid: [cx, cy],
          bbox: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
        });
      }
    }
    return polys;
  } catch {
    return [];
  }
}

/**
 * Parse features_df_json into cell feature rows.
 */
export function parseFeatures(featuresJson: string): Record<string, number | undefined>[] {
  try {
    return JSON.parse(featuresJson);
  } catch {
    return [];
  }
}
