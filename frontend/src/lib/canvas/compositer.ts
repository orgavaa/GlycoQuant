/**
 * Channel LUT compositing — additive blending of 5 fluorescence channels.
 */

export interface ChannelEntry {
  name: string;
  bitmap: ImageBitmap | null;
  visible: boolean;
  brightness: number; // 0-2, default 1
  lut: [number, number, number]; // RGB tint
}

export interface ChannelState {
  entries: ChannelEntry[];
}

const OFFSCREEN_CACHE = new Map<string, OffscreenCanvas>();

export function compositeChannels(
  ctx: CanvasRenderingContext2D,
  state: ChannelState,
  w: number,
  h: number,
): void {
  // Save current composite mode
  const prevOp = ctx.globalCompositeOperation;

  // Draw each visible channel additively
  ctx.globalCompositeOperation = "lighter";

  for (const ch of state.entries) {
    if (!ch.visible || !ch.bitmap) continue;

    // Get or create offscreen canvas for tinting
    let offscreen = OFFSCREEN_CACHE.get(ch.name);
    if (!offscreen || offscreen.width !== w || offscreen.height !== h) {
      offscreen = new OffscreenCanvas(w, h);
      OFFSCREEN_CACHE.set(ch.name, offscreen);
    }
    const offCtx = offscreen.getContext("2d");
    if (!offCtx) continue;

    // Draw the grayscale bitmap
    offCtx.clearRect(0, 0, w, h);
    offCtx.drawImage(ch.bitmap, 0, 0, w, h);

    // Apply LUT tint + brightness via pixel manipulation
    const imageData = offCtx.getImageData(0, 0, w, h);
    const d = imageData.data;
    const [r, g, b] = ch.lut;
    const bright = ch.brightness;

    for (let i = 0; i < d.length; i += 4) {
      const intensity = (d[i] * bright) / 255;
      d[i] = Math.min(255, intensity * r) | 0;
      d[i + 1] = Math.min(255, intensity * g) | 0;
      d[i + 2] = Math.min(255, intensity * b) | 0;
      d[i + 3] = 255;
    }
    offCtx.putImageData(imageData, 0, 0);

    ctx.drawImage(offscreen, 0, 0, w, h);
  }

  ctx.globalCompositeOperation = prevOp;
}

/** Decode a base64 data URL into an ImageBitmap. */
export async function decodeChannelPng(dataUrl: string): Promise<ImageBitmap> {
  const resp = await fetch(dataUrl);
  const blob = await resp.blob();
  return createImageBitmap(blob);
}

/** Default LUT colors per channel name. */
export const CHANNEL_LUTS: Record<string, [number, number, number]> = {
  dapi: [74, 144, 217],
  glycocalyx: [76, 175, 80],
  yap: [224, 64, 251],
  paxillin: [255, 152, 0],
  actin: [176, 190, 197],
};
