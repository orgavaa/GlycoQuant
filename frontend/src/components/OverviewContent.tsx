import { useMemo, useState } from "react";
import { HeroMetrics } from "./HeroMetrics";
import { PlotlyWhite } from "./PlotlyWhite";
import { TopCells } from "./TopCells";
import { useJobStore } from "@/lib/jobStore";
import type { JobResult } from "@/lib/api";
import { type CellFeatures, fmt, fmtSigned } from "@/lib/canvas/extract";

export function OverviewContent({ result, cells }: { result: JobResult; cells: CellFeatures[] }) {
  const setSelectedCellId = useJobStore(s => s.setSelectedCellId);
  const summary = result.mechano_score_summary;
  const m = result.hero_metrics;

  const topCells = useMemo(() => {
    const scored = cells.filter(c => typeof c.mechano_score === "number" && Number.isFinite(c.mechano_score));
    return [...scored].sort((a, b) => Math.abs((b.mechano_score as number)) - Math.abs((a.mechano_score as number))).slice(0, 5);
  }, [cells]);

  return (
    <>
      <HeroMetrics metrics={[
        { value: String(result.cell_count), label: "Cells" },
        { value: fmtSigned(m.mean_mechano_score), label: "Mechano" },
        { value: summary?.top_correlation_r != null ? fmt(summary.top_correlation_r) : "\u2014", label: "Glyco\u2194Mech" },
      ]} />

      {result.glyco_mechano_correlation_figure_json && (
        <Section title="Glyco \u2194 Mechano correlation"
          subtitle={summary?.top_correlation_pair ? `top |r| = ${fmt(summary.top_correlation_r)} \u2014 ${summary.top_correlation_pair[0]} \u00d7 ${summary.top_correlation_pair[1]}` : undefined}>
          <PlotlyWhite figureJson={result.glyco_mechano_correlation_figure_json} maxHeight={220} />
        </Section>
      )}

      {result.mechano_score_distribution_figure_json && (
        <Section title="Score distribution">
          <PlotlyWhite figureJson={result.mechano_score_distribution_figure_json} maxHeight={100} />
        </Section>
      )}

      {topCells.length > 0 && (
        <Section title="Top deviating cells">
          <TopCells cells={topCells} onClick={id => setSelectedCellId(id)} />
        </Section>
      )}

      <CorrelationAudit figureJson={result.correlation_figure_json} />
    </>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: "#bbb", letterSpacing: 1.5, textTransform: "uppercase" as const, marginBottom: subtitle ? 4 : 10 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 10, color: "#bbb", marginBottom: 10 }}>{subtitle}</div>}
      {children}
    </div>
  );
}

function CorrelationAudit({ figureJson }: { figureJson: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div onClick={() => setOpen(v => !v)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", padding: "6px 0" }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: "#bbb", letterSpacing: 1.5, textTransform: "uppercase" as const }}>Full correlation audit</span>
        <span style={{ fontSize: 12, color: "#ccc" }}>{open ? "\u25be" : "\u25b8"}</span>
      </div>
      {open && <PlotlyWhite figureJson={figureJson} maxHeight={350} />}
    </div>
  );
}
