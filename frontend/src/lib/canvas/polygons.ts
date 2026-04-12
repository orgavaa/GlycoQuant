/**
 * Cell polygon drawing + point-in-polygon hit-testing.
 */

export interface CellPolygon {
  cellId: number;
  vertices: [number, number][]; // [x, y] pairs in image coordinates
}

export interface FeatureFillState {
  featureName: string;
  values: Map<number, number>; // cellId → value
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

// RdBu diverging 5-stop
const RDBU = [
  [178, 24, 43],
  [239, 138, 98],
  [247, 247, 247],
  [103, 169, 207],
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

export function drawPolygons(
  ctx: CanvasRenderingContext2D,
  polygons: CellPolygon[],
  selectedCellId: number | null,
): void {
  for (const poly of polygons) {
    if (poly.vertices.length < 3) continue;

    ctx.beginPath();
    ctx.moveTo(poly.vertices[0][0], poly.vertices[0][1]);
    for (let i = 1; i < poly.vertices.length; i++) {
      ctx.lineTo(poly.vertices[i][0], poly.vertices[i][1]);
    }
    ctx.closePath();

    if (poly.cellId === selectedCellId) {
      ctx.strokeStyle = "#FFD700";
      ctx.lineWidth = 2.5;
    } else {
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

    ctx.beginPath();
    ctx.moveTo(poly.vertices[0][0], poly.vertices[0][1]);
    for (let i = 1; i < poly.vertices.length; i++) {
      ctx.lineTo(poly.vertices[i][0], poly.vertices[i][1]);
    }
    ctx.closePath();

    ctx.fillStyle = `rgba(${r | 0},${g | 0},${b | 0},0.45)`;
    ctx.fill();
  }
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
  for (const poly of polygons) {
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
    const xi = vertices[i][0],
      yi = vertices[i][1];
    const xj = vertices[j][0],
      yj = vertices[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}
