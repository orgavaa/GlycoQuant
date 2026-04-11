import { MetricCard } from "./MetricCard";

interface Metric {
  label: string;
  value: string;
  unit?: string;
}

interface MetricCardsRowProps {
  metrics: Metric[];
}

export function MetricCardsRow({ metrics }: MetricCardsRowProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {metrics.map((m) => (
        <MetricCard
          key={m.label}
          label={m.label}
          value={m.value}
          unit={m.unit}
        />
      ))}
    </div>
  );
}
