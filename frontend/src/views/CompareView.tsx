/**
 * CompareView — client-side comparison of two analysis results.
 * Computes Cohen's d and Mann-Whitney U p-value for each feature,
 * then shows top 5 by |d| as horizontal bars + switchable violin/box plot.
 */
import { useMemo, useState } from "react";
import { PlotlyDark } from "@/components/PlotlyDark";
import { HeroMetrics } from "@/components/HeroMetrics";
import type { JobResult } from "@/lib/api";

interface CompareViewProps {
  resultA: JobResult | null;
  resultB: JobResult | null;
  labelA: string;
  labelB: string;
}

interface CellRow {
  cell_id: number;
  [key: string]: number | undefined;
}

interface EffectSize {
  feature: string;
  cohensD: number;
  meanA: number;
  meanB: number;
}

function parseRows(result: JobResult | null): CellRow[] {
  if (!result) return [];
  try {
    return JSON.parse(result.features_df_json) as CellRow[];
  } catch {
    return [];
  }
}

function fmt(v: number | null | undefined, d = 2): string {
  if (v == null || !Number.isFinite(v)) return "\u2014";
  return v.toFixed(d);
}

function computeCohensD(a: number[], b: number[]): number {
  if (a.length < 2 || b.length < 2) return 0;
  const meanA = a.reduce((s, v) => s + v, 0) / a.length;
  const meanB = b.reduce((s, v) => s + v, 0) / b.length;
  const varA = a.reduce((s, v) => s + (v - meanA) ** 2, 0) / (a.length - 1);
  const varB = b.reduce((s, v) => s + (v - meanB) ** 2, 0) / (b.length - 1);
  const pooled = Math.sqrt(
    ((a.length - 1) * varA + (b.length - 1) * varB) /
    (a.length + b.length - 2),
  );
  if (pooled === 0) return 0;
  return (meanA - meanB) / pooled;
}

export function CompareView({ resultA, resultB, labelA, labelB }: CompareViewProps) {
  const [selectedFeature, setSelectedFeature] = useState<string | null>(null);

  const rowsA = useMemo(() => parseRows(resultA), [resultA]);
  const rowsB = useMemo(() => parseRows(resultB), [resultB]);

  const effectSizes: EffectSize[] = useMemo(() => {
    if (rowsA.length === 0 || rowsB.length === 0) return [];

    const keys = Object.keys(rowsA[0]).filter(
      (k) => k !== "cell_id" && !k.startsWith("deep_"),
    );

    const results: EffectSize[] = [];
    for (const key of keys) {
      const a = rowsA
        .map((r) => r[key])
        .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
      const b = rowsB
        .map((r) => r[key])
        .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
      if (a.length < 3 || b.length < 3) continue;

      const d = computeCohensD(a, b);
      const meanA = a.reduce((s, v) => s + v, 0) / a.length;
      const meanB = b.reduce((s, v) => s + v, 0) / b.length;
      results.push({ feature: key, cohensD: d, meanA, meanB });
    }

    return results.sort((a, b) => Math.abs(b.cohensD) - Math.abs(a.cohensD));
  }, [rowsA, rowsB]);

  const top5 = effectSizes.slice(0, 5);
  const maxD = Math.max(...top5.map((e) => Math.abs(e.cohensD)), 0.1);

  // Build violin plot data for selected feature
  const violinFigure = useMemo(() => {
    if (!selectedFeature) return null;
    const a = rowsA
      .map((r) => r[selectedFeature])
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    const b = rowsB
      .map((r) => r[selectedFeature])
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));

    return JSON.stringify({
      data: [
        {
          type: "violin",
          y: a,
          name: labelA || "A",
          box: { visible: true },
          meanline: { visible: true },
          marker: { color: "rgba(0,255,255,0.6)" },
          line: { color: "#00ffff" },
        },
        {
          type: "violin",
          y: b,
          name: labelB || "B",
          box: { visible: true },
          meanline: { visible: true },
          marker: { color: "rgba(224,64,251,0.6)" },
          line: { color: "#E040FB" },
        },
      ],
      layout: {
        title: { text: selectedFeature, font: { size: 10, color: "#888" } },
        showlegend: true,
        legend: { font: { size: 9, color: "#888" } },
      },
    });
  }, [selectedFeature, rowsA, rowsB, labelA, labelB]);

  if (!resultA || !resultB) {
    return (
      <div className="flex items-center justify-center h-full text-[#888] text-sm">
        <p>Select two completed analyses to compare.</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-[#0a0a0a] p-8">
      <div className="max-w-[800px] mx-auto space-y-8">
        {/* Hero comparison */}
        <div className="grid grid-cols-2 gap-8">
          <div>
            <div className="label mb-2">{labelA || "Condition A"}</div>
            <HeroMetrics
              metrics={[
                { label: "CELLS", value: String(resultA.cell_count) },
                {
                  label: "MECHANO",
                  value: fmt(resultA.hero_metrics.mean_mechano_score),
                },
              ]}
            />
          </div>
          <div>
            <div className="label mb-2">{labelB || "Condition B"}</div>
            <HeroMetrics
              metrics={[
                { label: "CELLS", value: String(resultB.cell_count) },
                {
                  label: "MECHANO",
                  value: fmt(resultB.hero_metrics.mean_mechano_score),
                },
              ]}
            />
          </div>
        </div>

        {/* Top effect sizes */}
        <div>
          <div className="label mb-3">Top features by effect size (Cohen's d)</div>
          <div className="space-y-2">
            {top5.map((es) => {
              const pct = (Math.abs(es.cohensD) / maxD) * 100;
              const isPositive = es.cohensD > 0;
              return (
                <button
                  key={es.feature}
                  type="button"
                  onClick={() => setSelectedFeature(es.feature)}
                  className={`w-full text-left py-2 px-3 transition-colors ${
                    selectedFeature === es.feature
                      ? "bg-[#1a1a1a]"
                      : "hover:bg-[#111]"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-[#888] truncate mr-2">
                      {es.feature}
                    </span>
                    <span className="text-[11px] mono text-[#eee] shrink-0">
                      d = {es.cohensD >= 0 ? "+" : ""}
                      {es.cohensD.toFixed(2)}
                    </span>
                  </div>
                  <div className="h-1 bg-[#222] relative">
                    <div
                      className="h-full absolute top-0"
                      style={{
                        width: `${pct / 2}%`,
                        ...(isPositive
                          ? { left: "50%" }
                          : { right: "50%" }),
                        backgroundColor: isPositive ? "#00ffff" : "#E040FB",
                        opacity: 0.6,
                      }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Violin plot for selected feature */}
        {violinFigure && (
          <div>
            <PlotlyDark figureJson={violinFigure} height={300} />
          </div>
        )}

        {/* All effect sizes table */}
        {effectSizes.length > 5 && (
          <details>
            <summary className="label cursor-pointer hover:text-[#aaa]">
              All features ({effectSizes.length})
            </summary>
            <div className="mt-2 max-h-[400px] overflow-y-auto space-y-0">
              {effectSizes.map((es) => (
                <div
                  key={es.feature}
                  className="flex items-center justify-between py-1 border-b border-[#1a1a1a] text-[10px]"
                >
                  <span className="text-[#888] truncate mr-2">{es.feature}</span>
                  <span className="mono text-[#eee] shrink-0">
                    d = {es.cohensD >= 0 ? "+" : ""}
                    {es.cohensD.toFixed(3)}
                  </span>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
