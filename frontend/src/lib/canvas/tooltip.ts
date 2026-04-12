/**
 * Hover tooltip — drawn on the canvas at screen coordinates.
 */

export interface TooltipData {
  x: number; // screen px
  y: number;
  cellId: number;
  metrics: { label: string; value: string }[];
}

export function drawTooltip(
  ctx: CanvasRenderingContext2D,
  tip: TooltipData,
): void {
  const padding = 8;
  const lineHeight = 16;
  const headerHeight = 18;
  const w = 220;
  const h = headerHeight + tip.metrics.length * lineHeight + padding * 2;

  // Position: offset from cursor, stay inside canvas
  let tx = tip.x + 14;
  let ty = tip.y - h / 2;
  if (tx + w > ctx.canvas.width) tx = tip.x - w - 14;
  if (ty < 0) ty = 4;
  if (ty + h > ctx.canvas.height) ty = ctx.canvas.height - h - 4;

  // Background
  ctx.fillStyle = "rgba(0,0,0,0.85)";
  ctx.fillRect(tx, ty, w, h);
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 1;
  ctx.strokeRect(tx, ty, w, h);

  // Header
  ctx.font = "bold 11px ui-monospace, monospace";
  ctx.fillStyle = "#eee";
  ctx.textAlign = "left";
  ctx.fillText(`Cell ${tip.cellId}`, tx + padding, ty + padding + 12);

  // Metrics
  ctx.font = "10px ui-monospace, monospace";
  tip.metrics.forEach((m, i) => {
    const my = ty + headerHeight + padding + i * lineHeight + 10;
    ctx.fillStyle = "#888";
    ctx.fillText(m.label, tx + padding, my);
    ctx.fillStyle = "#eee";
    ctx.textAlign = "right";
    ctx.fillText(m.value, tx + w - padding, my);
    ctx.textAlign = "left";
  });
}
