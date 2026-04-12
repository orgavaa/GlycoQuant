/**
 * RadarChart — pure SVG hexagonal radar chart for cell phenotype shape.
 */
const AXES = [
  { key: "glycocalyx_pericellular_ratio", label: "Glyco" },
  { key: "yap_nc_ratio_size_corrected", label: "YAP" },
  { key: "fa_mature_fraction", label: "FA" },
  { key: "actin_stress_fiber_coherence", label: "Actin" },
  { key: "cell_area", label: "Area" },
  { key: "mechano_score", label: "Mechano" },
];

interface RadarChartProps {
  /** Normalized [0..1] values for each of the 6 axes. */
  values: number[];
  size?: number;
}

export function RadarChart({ values, size = 160 }: RadarChartProps) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 22;
  const n = AXES.length;

  function polar(angle: number, radius: number): [number, number] {
    const a = (angle - 90) * Math.PI / 180;
    return [cx + radius * Math.cos(a), cy + radius * Math.sin(a)];
  }

  function hexPoints(radius: number): string {
    return Array.from({ length: n }, (_, i) => polar((360 / n) * i, radius))
      .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
      .join(" ");
  }

  const dataPoints = Array.from({ length: n }, (_, i) => {
    const v = Math.max(0, Math.min(1, values[i] ?? 0));
    return polar((360 / n) * i, v * r);
  });
  const dataStr = dataPoints.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {[0.33, 0.66, 1].map(f => (
        <polygon key={f} points={hexPoints(r * f)} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="0.5" />
      ))}
      {Array.from({ length: n }, (_, i) => {
        const [x, y] = polar((360 / n) * i, r);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />;
      })}
      <polygon points={dataStr} fill="rgba(0,255,255,0.15)" stroke="rgba(0,255,255,0.7)" strokeWidth="1.5" />
      {dataPoints.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2.5" fill="#0ff" fillOpacity="0.8" />
      ))}
      {AXES.map((axis, i) => {
        const [x, y] = polar((360 / n) * i, r + 14);
        return <text key={axis.key} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fill="#555" fontSize="8" fontFamily="system-ui">{axis.label}</text>;
      })}
    </svg>
  );
}

export { AXES as RADAR_AXES };
