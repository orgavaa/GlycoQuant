import { MetricCardsRow } from "@/components/MetricCardsRow";
import { fmt } from "@/lib/utils";
import type { JobResult } from "@/lib/api";

interface HeroMetricsProps {
  result: JobResult;
}

export function HeroMetrics({ result }: HeroMetricsProps) {
  const m = result.hero_metrics;
  const metrics = [
    { label: "Cells detected", value: String(result.cell_count), unit: "n" },
    { label: "YAP N/C (mean)", value: fmt(m.mean_yap_nc, 2) },
    { label: "Focal adhesions", value: fmt(m.mean_fa_count, 1), unit: "/ cell" },
    { label: "Actin coherence", value: fmt(m.mean_actin_coherence, 3) },
    { label: "Glycocalyx ratio", value: fmt(m.mean_glycocalyx_ratio, 2) },
  ];
  return <MetricCardsRow metrics={metrics} />;
}
