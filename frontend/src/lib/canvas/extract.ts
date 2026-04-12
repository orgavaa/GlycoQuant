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

export function extractPolygons(figureJson: string): CellPolygon[] {
  try {
    const fig = JSON.parse(figureJson);
    if (!fig.data || !Array.isArray(fig.data)) return [];

    const polys: CellPolygon[] = [];
    for (const trace of fig.data) {
      // Skip heatmap traces (channel images)
      if (trace.type === "heatmap" || trace.type === "image") continue;
      // Must have x, y arrays and customdata with a cell ID
      if (!Array.isArray(trace.x) || !Array.isArray(trace.y)) continue;
      if (!Array.isArray(trace.customdata) || trace.customdata.length === 0) continue;

      // Extract cell ID from customdata[0]
      const cd = trace.customdata[0];
      let cellId: number;
      if (Array.isArray(cd)) {
        cellId = Number(cd[0]);
      } else {
        cellId = Number(cd);
      }
      if (!Number.isFinite(cellId) || cellId === 0) continue;

      // Build polygon vertices from x/y arrays
      const vertices: [number, number][] = [];
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      let cx = 0, cy = 0;
      const len = Math.min(trace.x.length, trace.y.length);
      for (let i = 0; i < len; i++) {
        const x = Number(trace.x[i]), y = Number(trace.y[i]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        vertices.push([x, y]);
        cx += x; cy += y;
        if (x < minX) minX = x; if (y < minY) minY = y;
        if (x > maxX) maxX = x; if (y > maxY) maxY = y;
      }
      if (vertices.length >= 3) {
        cx /= vertices.length; cy /= vertices.length;
        polys.push({
          cellId: Math.round(cellId),
          vertices,
          bbox: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
          centroid: [cx, cy],
        });
      }
    }
    return polys;
  } catch {
    return [];
  }
}

export function extractFeatures(json: string): CellFeatures[] {
  try { return JSON.parse(json) as CellFeatures[]; } catch { return []; }
}

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
