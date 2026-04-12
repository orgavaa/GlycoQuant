/** Viridis and RdBu colormaps for feature overlays. */

const VIRIDIS: [number, number, number][] = [
  [68, 1, 84], [72, 35, 116], [64, 67, 135], [52, 94, 141],
  [41, 120, 142], [32, 144, 140], [34, 167, 132], [68, 190, 112],
  [121, 209, 81], [189, 222, 38], [253, 231, 37],
];

const RDBU: [number, number, number][] = [
  [33, 102, 172], [67, 147, 195], [146, 197, 222], [209, 229, 240],
  [247, 247, 247],
  [253, 219, 199], [244, 165, 130], [214, 96, 77], [178, 24, 43],
];

function interpolate(colors: [number, number, number][], t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const idx = clamped * (colors.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, colors.length - 1);
  const frac = idx - lo;
  const r = Math.round(colors[lo][0] + (colors[hi][0] - colors[lo][0]) * frac);
  const g = Math.round(colors[lo][1] + (colors[hi][1] - colors[lo][1]) * frac);
  const b = Math.round(colors[lo][2] + (colors[hi][2] - colors[lo][2]) * frac);
  return `rgb(${r},${g},${b})`;
}

export function viridis(t: number): string {
  return interpolate(VIRIDIS, t);
}

export function rdbu(t: number): string {
  return interpolate(RDBU, t);
}

export function viridisRgba(t: number, alpha: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const idx = clamped * (VIRIDIS.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, VIRIDIS.length - 1);
  const frac = idx - lo;
  const r = Math.round(VIRIDIS[lo][0] + (VIRIDIS[hi][0] - VIRIDIS[lo][0]) * frac);
  const g = Math.round(VIRIDIS[lo][1] + (VIRIDIS[hi][1] - VIRIDIS[lo][1]) * frac);
  const b = Math.round(VIRIDIS[lo][2] + (VIRIDIS[hi][2] - VIRIDIS[lo][2]) * frac);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function rdbuRgba(t: number, alpha: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const idx = clamped * (RDBU.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, RDBU.length - 1);
  const frac = idx - lo;
  const r = Math.round(RDBU[lo][0] + (RDBU[hi][0] - RDBU[lo][0]) * frac);
  const g = Math.round(RDBU[lo][1] + (RDBU[hi][1] - RDBU[lo][1]) * frac);
  const b = Math.round(RDBU[lo][2] + (RDBU[hi][2] - RDBU[lo][2]) * frac);
  return `rgba(${r},${g},${b},${alpha})`;
}
