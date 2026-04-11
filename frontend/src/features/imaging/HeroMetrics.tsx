import { MetricCardsRow } from "@/components/MetricCardsRow";
import { fmt } from "@/lib/utils";
import type { JobResult } from "@/lib/api";

interface HeroMetricsProps {
  result: JobResult;
}

export function HeroMetrics({ result }: HeroMetricsProps) {
  const m = result.hero_metrics;
  // UI_SCIENCE_GUIDELINES §3 — exactly three hero metrics on Overview.
  // Anything else belongs on Single Cell or Methods & QC.
  const metrics = [
    {
      label: "Cells analysed",
      value: String(result.cell_count),
      unit: "n",
    },
    {
      label: "Mean mechano score",
      value: fmt(m.mean_mechano_score, 2),
    },
    {
      label: "Top glyco ↔ mechano |r|",
      value: fmt(m.top_glyco_mechano_r, 2),
    },
  ];
  return <MetricCardsRow metrics={metrics} />;
}
