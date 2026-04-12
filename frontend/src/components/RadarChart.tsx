export const RADAR_AXES = [
  { key: "glycocalyx_pericellular_ratio", label: "Glycocalyx" },
  { key: "yap_nc_ratio_size_corrected", label: "YAP" },
  { key: "fa_mature_fraction", label: "Adhesions" },
  { key: "actin_stress_fiber_coherence", label: "Actin" },
  { key: "cell_area", label: "Spread area" },
  { key: "mechano_score", label: "Mechano" },
];

export function RadarChart({ values, size = 200 }: { values: number[]; size?: number }) {
  const cx = size / 2, cy = size / 2, r = size / 2 - 26, n = RADAR_AXES.length;
  const polar = (angle: number, radius: number): [number, number] => {
    const a = (angle - 90) * Math.PI / 180;
    return [cx + radius * Math.cos(a), cy + radius * Math.sin(a)];
  };
  const hex = (radius: number) => Array.from({ length: n }, (_, i) => polar((360 / n) * i, radius)).map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const data = Array.from({ length: n }, (_, i) => polar((360 / n) * i, Math.max(0, Math.min(1, values[i] ?? 0)) * r));
  const dataStr = data.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {[0.33, 0.66, 1].map(f => <polygon key={f} points={hex(r * f)} fill="none" stroke="#e8e8e8" strokeWidth="0.5" />)}
      {Array.from({ length: n }, (_, i) => { const [x, y] = polar((360 / n) * i, r); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#f0f0f0" strokeWidth="0.5" />; })}
      <polygon points={dataStr} fill="rgba(33,102,172,0.12)" stroke="#2166ac" strokeWidth="1.5" />
      {data.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="2.5" fill="#2166ac" />)}
      {RADAR_AXES.map((axis, i) => { const [x, y] = polar((360 / n) * i, r + 16); return <text key={axis.key} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fill="#999" fontSize="9" fontFamily="Inter, sans-serif">{axis.label}</text>; })}
    </svg>
  );
}
