/**
 * HeroMetrics — three-column headline metrics at the top of the overview rail.
 */

interface HeroMetricDef {
  label: string;
  value: string;
}

interface HeroMetricsProps {
  metrics: HeroMetricDef[];
}

export function HeroMetrics({ metrics }: HeroMetricsProps) {
  return (
    <div className="flex justify-between gap-2">
      {metrics.map((m) => (
        <div key={m.label} className="flex-1 text-center">
          <div
            className="text-[28px] font-bold mono leading-none"
            style={{ color: m.value === "\u2014" ? "#444" : "#eee" }}
          >
            {m.value}
          </div>
          <div className="label mt-1">{m.label}</div>
        </div>
      ))}
    </div>
  );
}
