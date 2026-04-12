/**
 * Canvas transform — zoom/pan state + smooth animation.
 * Manages the mapping from image space to screen space,
 * including animated zoom-to-cell transitions.
 */
import type { CanvasTransform, CellPolygon } from "@/types";

/** Default transform: identity (no zoom, no pan). */
export const IDENTITY_TRANSFORM: CanvasTransform = {
  scale: 1,
  translateX: 0,
  translateY: 0,
};

/** Compute bounding box of a polygon. */
export function getBoundingBox(vertices: [number, number][]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of vertices) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}

/**
 * Compute the transform needed to zoom the canvas so a cell
 * fills ~60% of the viewport.
 */
export function computeZoomToCell(
  cellId: number,
  polygons: CellPolygon[],
  imageWidth: number,
  imageHeight: number,
  canvasWidth: number,
  canvasHeight: number,
): CanvasTransform | null {
  const cell = polygons.find((p) => p.cellId === cellId);
  if (!cell) return null;

  const bbox = getBoundingBox(cell.vertices);
  const padding = Math.max(bbox.width, bbox.height) * 0.8;
  const viewW = bbox.width + padding * 2;
  const viewH = bbox.height + padding * 2;

  // Compute base scale (contain fit of image in canvas)
  const baseScaleX = canvasWidth / imageWidth;
  const baseScaleY = canvasHeight / imageHeight;
  const baseScale = Math.min(baseScaleX, baseScaleY);

  // Target scale to fill canvas with the cell region
  const cellScaleX = canvasWidth / (viewW * baseScale);
  const cellScaleY = canvasHeight / (viewH * baseScale);
  const zoomScale = Math.min(cellScaleX, cellScaleY, 6); // max 6x

  // Translate so cell center is at canvas center (in base-scaled coords)
  const baseCenterX = bbox.centerX * baseScale + (canvasWidth - imageWidth * baseScale) / 2;
  const baseCenterY = bbox.centerY * baseScale + (canvasHeight - imageHeight * baseScale) / 2;
  const translateX = canvasWidth / 2 - baseCenterX * zoomScale;
  const translateY = canvasHeight / 2 - baseCenterY * zoomScale;

  return { scale: zoomScale, translateX, translateY };
}

/**
 * Animate between two transforms over the given duration.
 * Calls onUpdate each frame with the interpolated transform.
 * Returns a cancel function.
 */
export function animateTransform(
  from: CanvasTransform,
  to: CanvasTransform,
  durationMs: number,
  onUpdate: (t: CanvasTransform) => void,
  onComplete?: () => void,
): () => void {
  const startTime = performance.now();
  let cancelled = false;

  function easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }

  function tick(now: number) {
    if (cancelled) return;
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / durationMs, 1);
    const t = easeOutCubic(progress);

    onUpdate({
      scale: from.scale + (to.scale - from.scale) * t,
      translateX: from.translateX + (to.translateX - from.translateX) * t,
      translateY: from.translateY + (to.translateY - from.translateY) * t,
    });

    if (progress < 1) {
      requestAnimationFrame(tick);
    } else {
      onComplete?.();
    }
  }

  requestAnimationFrame(tick);
  return () => { cancelled = true; };
}
