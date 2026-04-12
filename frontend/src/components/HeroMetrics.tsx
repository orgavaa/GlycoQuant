interface Metric {
  value: string;
  label: string;
}

export function HeroMetrics({ metrics }: { metrics: Metric[] }) {
  return (
    <div className="flex items-center">
      {metrics.map((m, i) => (
        <div key={m.label} className={`flex-1 text-center ${i < metrics.length - 1 ? "border-r border-gray-100" : ""}`}>
          <div
            className={`text-[26px] font-bold leading-none ${m.value === "\u2014" ? "text-gray-300" : "text-gray-900"}`}
            style={{ fontFeatureSettings: "'tnum'" }}
          >
            {m.value}
          </div>
          <div className="text-[9px] font-semibold text-gray-400 tracking-[0.8px] uppercase mt-2">
            {m.label}
          </div>
        </div>
      ))}
    </div>
  );
}
