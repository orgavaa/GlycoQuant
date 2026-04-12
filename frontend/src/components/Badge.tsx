interface BadgeProps {
  z: number | null;
}

export function Badge({ z }: BadgeProps) {
  if (z == null || isNaN(z) || !Number.isFinite(z)) {
    return <span className="text-gray-300 text-[10px]">&mdash;</span>;
  }
  const abs = Math.abs(z);
  if (abs < 1) {
    return (
      <span className="text-[10px] text-gray-400" style={{ fontFeatureSettings: "'tnum'" }}>
        {z > 0 ? "+" : ""}{z.toFixed(1)}
      </span>
    );
  }
  const color = z > 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700";
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${color}`} style={{ fontFeatureSettings: "'tnum'" }}>
      {z > 0 ? "+" : ""}{z.toFixed(1)}&sigma;
    </span>
  );
}
