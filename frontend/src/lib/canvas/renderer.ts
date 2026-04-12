/**
 * Main canvas render loop. Orchestrates layers 1-5.
 * Stateless — call render() with the current state each frame.
 */
import { compositeChannels, type ChannelState } from "./compositer";
import {
  drawPolygons,
  drawFeatureFills,
  hitTestCell,
  type CellPolygon,
  type FeatureFillState,
} from "./polygons";
import { drawTooltip, type TooltipData } from "./tooltip";

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
}

export function render(
  ctx: CanvasRenderingContext2D,
  state: RenderState,
): void {
  const { canvasWidth: cw, canvasHeight: ch } = state;
  ctx.clearRect(0, 0, cw, ch);

  // Layer 0: black background
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, cw, ch);

  // Compute scale to fit image in canvas (contain)
  const scaleX = cw / state.imageWidth;
  const scaleY = ch / state.imageHeight;
  const scale = Math.min(scaleX, scaleY);
  const offsetX = (cw - state.imageWidth * scale) / 2;
  const offsetY = (ch - state.imageHeight * scale) / 2;

  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);

  // Layer 1: channel composite
  compositeChannels(ctx, state.channels, state.imageWidth, state.imageHeight);

  // Layer 2: cell polygons
  if (state.showSegmentation) {
    drawPolygons(ctx, state.polygons, state.selectedCellId);
  }

  // Layer 3: feature fills
  if (state.featureFill) {
    drawFeatureFills(ctx, state.polygons, state.featureFill);
  }

  ctx.restore();

  // Layer 4: scale bar (screen coords, bottom-right)
  drawScaleBar(ctx, cw, ch, scale, state.pixelSizeUm);

  // Layer 5: tooltip (screen coords)
  if (state.tooltip) {
    drawTooltip(ctx, state.tooltip);
  }
}

function drawScaleBar(
  ctx: CanvasRenderingContext2D,
  cw: number,
  ch: number,
  scale: number,
  pixelSizeUm: number,
): void {
  if (pixelSizeUm <= 0) return;
  const barUm = 50;
  const barPx = (barUm / pixelSizeUm) * scale;

  const x = cw - barPx - 20;
  const y = ch - 20;

  ctx.fillStyle = "#fff";
  ctx.fillRect(x, y, barPx, 3);

  ctx.font = "bold 10px system-ui, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.textAlign = "right";
  ctx.fillText(`${barUm} µm`, x + barPx, y - 5);
}

/**
 * Convert screen coordinates to image coordinates for hit-testing.
 */
export function screenToImage(
  sx: number,
  sy: number,
  state: RenderState,
): [number, number] {
  const scaleX = state.canvasWidth / state.imageWidth;
  const scaleY = state.canvasHeight / state.imageHeight;
  const scale = Math.min(scaleX, scaleY);
  const offsetX = (state.canvasWidth - state.imageWidth * scale) / 2;
  const offsetY = (state.canvasHeight - state.imageHeight * scale) / 2;

  return [
    (sx - offsetX) / scale,
    (sy - offsetY) / scale,
  ];
}

export { hitTestCell };
