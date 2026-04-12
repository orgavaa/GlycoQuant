/**
 * RadarChart — pure SVG hexagonal radar for single-cell phenotype shape.
 * 6 axes at 60 intervals, 3 concentric grid rings, one filled polygon.
 */
import { RADAR_AXES } from "@/types";

interface RadarChartProps {
  /** Normalized values [0..1] for each of the 6 RADAR_AXES. */
  values: number[];
  size?: number;
}

export function RadarChart({ values, size = 180 }: RadarChartProps) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 24; // radius for max ring
  const n = RADAR_AXES.length;

  function polarToXY(angle: number, radius: number): [number, number] {
    // Start from top (-90deg)
    const a = (angle - 90) * (Math.PI / 180);
    return [cx + radius * Math.cos(a), cy + radius * Math.sin(a)];
  }

  function hexPath(radius: number): string {
    const pts: string[] = [];
    for (let i = 0; i < n; i++) {
      const [x, y] = polarToXY((360 / n) * i, radius);
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return pts.join(" ");
  }

  // Data polygon
  const dataPoints: string[] = [];
  for (let i = 0; i < n; i++) {
    const v = Math.max(0, Math.min(1, values[i] ?? 0));
    const [x, y] = polarToXY((360 / n) * i, v * r);
    dataPoints.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Grid rings at 33%, 66%, 100% */}
      {[0.33, 0.66, 1].map((frac) => (
        <polygon
          key={frac}
          points={hexPath(r * frac)}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="0.5"
        />
      ))}

      {/* Axis lines */}
      {Array.from({ length: n }, (_, i) => {
        const [x, y] = polarToXY((360 / n) * i, r);
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={x}
            y2={y}
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="0.5"
          />
        );
      })}

      {/* Data polygon */}
      <polygon
        points={dataPoints.join(" ")}
        fill="rgba(0,255,255,0.15)"
        stroke="rgba(0,255,255,0.7)"
        strokeWidth="1.5"
      />

      {/* Data points */}
      {dataPoints.map((pt, i) => {
        const [x, y] = pt.split(",").map(Number);
        return (
          <circle
            key={i}
            cx={x}
            cy={y}
            r="2.5"
            fill="#00ffff"
            fillOpacity="0.8"
          />
        );
      })}

      {/* Axis labels */}
      {RADAR_AXES.map((axis, i) => {
        const [x, y] = polarToXY((360 / n) * i, r + 14);
        return (
          <text
            key={axis.key}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#666"
            fontSize="8"
            fontFamily="system-ui, sans-serif"
          >
            {axis.label}
          </text>
        );
      })}
    </svg>
  );
}
