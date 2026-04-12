interface Metric {
  value: string;
  label: string;
}

export function HeroMetrics({ metrics }: { metrics: Metric[] }) {
  return (
    <div className="flex pb-5 mb-0 border-b border-gray-100">
      {metrics.map(m => (
        <div key={m.label} className="flex-1 text-center">
          <div
            className={`text-[28px] font-bold leading-none ${m.value === "\u2014" ? "text-gray-300" : "text-gray-900"}`}
            style={{ fontFeatureSettings: "'tnum'" }}
          >
            {m.value}
          </div>
          <div className="text-[9px] font-semibold text-gray-400 tracking-[1px] uppercase mt-1.5">{m.label}</div>
        </div>
      ))}
    </div>
  );
}
