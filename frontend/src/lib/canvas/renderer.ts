/**
 * Main canvas render loop. Orchestrates layers 0-5.
 * Stateless — call render() with the current state each frame.
 */
import { compositeChannels, type ChannelState } from "./compositer";
import {
  drawPolygons,
  drawFeatureFills,
  drawColorbar,
  hitTestCell,
  type CellPolygon,
  type FeatureFillState,
} from "./polygons";
import { drawTooltip, type TooltipData } from "./tooltip";
import type { CanvasTransform } from "@/types";

export interface RenderState {
  channels: ChannelState;
  polygons: CellPolygon[];
  showSegmentation: boolean;
  featureFill: FeatureFillState | null;
  tooltip: TooltipData | null;
  selectedCellId: number | null;
  pixelSizeUm: number;
  canvasWidth: number;
  canvasHeight: number;
  imageWidth: number;
  imageHeight: number;
  /** Additional zoom/pan transform (applied on top of contain fit). */
  zoomTransform: CanvasTransform;
  /** When a cell is selected, dim all other cells. */
  dimOthers: boolean;
  /** Show scale bar. */
  showScaleBar: boolean;
  /** Show cell ID labels at centroids. */
  showCellLabels: boolean;
}

/**
 * Compute the base "contain" scale and offset to fit the image in the canvas.
 */
export function computeBaseTransform(state: RenderState) {
  const scaleX = state.canvasWidth / state.imageWidth;
  const scaleY = state.canvasHeight / state.imageHeight;
  const scale = Math.min(scaleX, scaleY);
  const offsetX = (state.canvasWidth - state.imageWidth * scale) / 2;
  const offsetY = (state.canvasHeight - state.imageHeight * scale) / 2;
  return { scale, offsetX, offsetY };
}

export function render(
  ctx: CanvasRenderingContext2D,
  state: RenderState,
): void {
  const { canvasWidth: cw, canvasHeight: ch } = state;
  ctx.clearRect(0, 0, cw, ch);

  // Layer 0: black background
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, cw, ch);

  // Base contain-fit transform
  const base = computeBaseTransform(state);
  const zoom = state.zoomTransform;

  ctx.save();
  // Apply zoom transform on top of base
  ctx.translate(zoom.translateX, zoom.translateY);
  ctx.scale(zoom.scale, zoom.scale);
  ctx.translate(base.offsetX, base.offsetY);
  ctx.scale(base.scale, base.scale);

  // Layer 1: channel composite
  compositeChannels(ctx, state.channels, state.imageWidth, state.imageHeight);

  // If dimming others (cell selected), draw a dark overlay then redraw selected cell bright
  if (state.dimOthers && state.selectedCellId != null) {
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillRect(0, 0, state.imageWidth, state.imageHeight);
  }

  // Layer 2: feature fills (before polygons so strokes draw on top)
  if (state.featureFill) {
    drawFeatureFills(ctx, state.polygons, state.featureFill);
  }

  // Layer 3: cell polygons
  if (state.showSegmentation) {
    drawPolygons(ctx, state.polygons, state.selectedCellId, null, state.dimOthers);
  }

  // Layer 3.5: cell labels
  if (state.showCellLabels) {
    ctx.font = "bold 8px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const poly of state.polygons) {
      if (state.dimOthers && poly.cellId !== state.selectedCellId) continue;
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.fillText(String(poly.cellId), poly.centroid[0], poly.centroid[1]);
    }
  }

  ctx.restore();

  // Layer 4: scale bar (screen coords, bottom-right)
  if (state.showScaleBar) {
    drawScaleBar(ctx, cw, ch, base.scale * zoom.scale, state.pixelSizeUm);
  }

  // Layer 5: colorbar for feature fill
  if (state.featureFill) {
    drawColorbar(ctx, state.featureFill, cw, ch);
  }

  // Layer 6: tooltip (screen coords)
  if (state.tooltip) {
    drawTooltip(ctx, state.tooltip);
  }
}

function drawScaleBar(
  ctx: CanvasRenderingContext2D,
  cw: number,
  ch: number,
  effectiveScale: number,
  pixelSizeUm: number,
): void {
  if (pixelSizeUm <= 0) return;
  const barUm = 50;
  const barPx = (barUm / pixelSizeUm) * effectiveScale;

  const x = cw - barPx - 24;
  const y = ch - 24;

  ctx.fillStyle = "#fff";
  ctx.fillRect(x, y, barPx, 3);
  // End ticks
  ctx.fillRect(x, y - 3, 1, 9);
  ctx.fillRect(x + barPx - 1, y - 3, 1, 9);

  ctx.font = "bold 10px system-ui, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.textAlign = "center";
  ctx.fillText(`${barUm} \u00b5m`, x + barPx / 2, y - 8);
}

/**
 * Convert screen coordinates to image coordinates for hit-testing,
 * accounting for zoom transform.
 */
export function screenToImage(
  sx: number,
  sy: number,
  state: RenderState,
): [number, number] {
  const base = computeBaseTransform(state);
  const zoom = state.zoomTransform;

  // Invert: screen → zoom → base → image
  const afterZoomX = (sx - zoom.translateX) / zoom.scale;
  const afterZoomY = (sy - zoom.translateY) / zoom.scale;
  const ix = (afterZoomX - base.offsetX) / base.scale;
  const iy = (afterZoomY - base.offsetY) / base.scale;

  return [ix, iy];
}

export { hitTestCell };
