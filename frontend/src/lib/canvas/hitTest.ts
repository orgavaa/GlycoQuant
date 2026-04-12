import type { CellPolygon } from "./extract";

export function hitTest(x: number, y: number, vertices: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const xi = vertices[i][0], yi = vertices[i][1];
    const xj = vertices[j][0], yj = vertices[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function hitTestPolygons(polys: CellPolygon[], x: number, y: number): number | null {
  for (const p of polys) {
    if (x < p.bbox.x || x > p.bbox.x + p.bbox.w || y < p.bbox.y || y > p.bbox.y + p.bbox.h) continue;
    if (hitTest(x, y, p.vertices)) return p.cellId;
  }
  return null;
}
