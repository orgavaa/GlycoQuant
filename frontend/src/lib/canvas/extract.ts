/**
 * Data extraction — parse Plotly JSON and features JSON into typed structures.
 */

export interface CellPolygon {
  cellId: number;
  vertices: [number, number][];
  bbox: { x: number; y: number; w: number; h: number };
  centroid: [number, number];
}

export interface CellFeatures {
  cell_id: number;
  [key: string]: number | string | null | undefined;
}

export interface PopulationStats {
  [key: string]: { mean: number; std: number; min: number; max: number };
}

/** Parse segmentation_figure_json → CellPolygon[]. */
export function extractPolygons(figureJson: string): CellPolygon[] {
  try {
    const fig = JSON.parse(figureJson);
    const traces = fig.data as Array<{
      x?: number[]; y?: number[]; customdata?: Array<number | number[]>; type?: string;
    }>;
    const polys: CellPolygon[] = [];
    for (const trace of traces) {
      if (trace.type === "heatmap" || !trace.x || !trace.y || !trace.customdata) continue;
      const cd = trace.customdata[0];
      const cellId = Array.isArray(cd) ? cd[0] : cd;
      if (typeof cellId !== "number") continue;
      const vertices: [number, number][] = [];
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      let cx = 0, cy = 0;
      for (let i = 0; i < trace.x.length; i++) {
        const x = trace.x[i], y = trace.y[i];
        if (typeof x === "number" && typeof y === "number") {
          vertices.push([x, y]);
          cx += x; cy += y;
          if (x < minX) minX = x; if (y < minY) minY = y;
          if (x > maxX) maxX = x; if (y > maxY) maxY = y;
        }
      }
      if (vertices.length >= 3) {
        cx /= vertices.length; cy /= vertices.length;
        polys.push({ cellId, vertices, bbox: { x: minX, y: minY, w: maxX - minX, h: maxY - minY }, centroid: [cx, cy] });
      }
    }
    return polys;
  } catch { return []; }
}

/** Parse features_df_json → CellFeatures[]. */
export function extractFeatures(json: string): CellFeatures[] {
  try { return JSON.parse(json) as CellFeatures[]; } catch { return []; }
}

/** Point-in-polygon via ray casting. */
export function hitTest(x: number, y: number, vertices: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const xi = vertices[i][0], yi = vertices[i][1];
    const xj = vertices[j][0], yj = vertices[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Hit test against all polygons. Returns cellId or null. */
export function hitTestPolygons(polys: CellPolygon[], x: number, y: number): number | null {
  for (const p of polys) {
    if (x < p.bbox.x || x > p.bbox.x + p.bbox.w || y < p.bbox.y || y > p.bbox.y + p.bbox.h) continue;
    if (hitTest(x, y, p.vertices)) return p.cellId;
  }
  return null;
}

/** Compute population stats for z-score normalization. */
export function computePopStats(rows: CellFeatures[]): PopulationStats {
  const stats: PopulationStats = {};
  if (rows.length === 0) return stats;
  const keys = Object.keys(rows[0]).filter(k => k !== "cell_id" && !k.startsWith("deep_"));
  for (const key of keys) {
    const vals: number[] = [];
    for (const r of rows) { const v = r[key]; if (typeof v === "number" && Number.isFinite(v)) vals.push(v); }
    if (vals.length === 0) continue;
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const std = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length) || 1;
    const sorted = [...vals].sort((a, b) => a - b);
    stats[key] = { mean, std, min: sorted[0], max: sorted[sorted.length - 1] };
  }
  return stats;
}

export function fmt(v: number | null | undefined, d = 2): string {
  if (v == null || !Number.isFinite(v)) return "\u2014";
  return v.toFixed(d);
}

export function fmtSigned(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "\u2014";
  return (v >= 0 ? "+" : "") + v.toFixed(2);
}
