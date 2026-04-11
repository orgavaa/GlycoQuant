/**
 * HeroMetrics — Stitch hero strip.
 *
 * Per UI_SCIENCE_GUIDELINES + Stitch overview screen, exactly three
 * metrics in a 3-column grid. Each metric is a stacked block:
 * uppercase widest-tracking label, large Space Grotesk number, then
 * a 1px hairline divider below. No cards, no borders — just
 * editorial whitespace.
 */
import { fmt } from "@/lib/utils";
import type { JobResult } from "@/lib/api";

interface HeroMetricsProps {
  result: JobResult;
}

export function HeroMetrics({ result }: HeroMetricsProps) {
  const m = result.hero_metrics;
  const summary = result.mechano_score_summary;

  // Confidence proxy: PC1 variance explained × 100. Falls back to a
  // dash when the score collapsed to weighted-sum mode.
  const confidence =
    summary && summary.mode === "pca"
      ? Math.round(summary.pc1_variance_explained * 100)
      : null;

  const metrics: Array<{ label: string; value: string; suffix?: string }> = [
    {
      label: "Cells Analysed",
      value: result.cell_count.toLocaleString(),
    },
    {
      label: "Mean Mechanotransduction",
      value: fmt(m.mean_mechano_score, 2),
    },
    {
      label: "Confidence Score",
      value: confidence != null ? String(confidence) : "—",
      suffix: confidence != null ? "%" : undefined,
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-6">
      {metrics.map((metric) => (
        <div key={metric.label} className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
            {metric.label}
          </span>
          <span className="text-3xl font-headline font-medium text-on-surface tracking-tighter tabular-nums">
            {metric.value}
            {metric.suffix && (
              <span className="text-sm ml-0.5">{metric.suffix}</span>
            )}
          </span>
          <div className="w-full h-[1px] bg-outline-variant/20 mt-2" />
        </div>
      ))}
    </div>
  );
}
