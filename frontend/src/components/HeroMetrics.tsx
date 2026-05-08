interface Metric {
  value: string;
  label: string;
}

export function HeroMetrics({ metrics }: { metrics: Metric[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
      {metrics.map((m) => (
        <div key={m.label} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
          <div
            className={`text-[22px] font-semibold leading-none ${m.value === "\u2014" ? "text-gray-300" : "text-gray-950"}`}
            style={{ fontFeatureSettings: "'tnum'" }}
          >
            {m.value}
          </div>
          <div className="mt-1.5 text-[9px] font-semibold uppercase text-gray-500">
            {m.label}
          </div>
        </div>
      ))}
    </div>
  );
}
