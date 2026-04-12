/**
 * OverviewContent — right rail content when no cell is selected.
 * Hero metrics + heatmap + histogram + top cells.
 */
import { useMemo } from "react";
import { PlotlyDark } from "./PlotlyDark";
import { useJobStore } from "@/lib/jobStore";
import type { JobResult } from "@/lib/api";
import { type CellFeatures, fmt, fmtSigned } from "@/lib/canvas/extract";
import { useState } from "react";

interface OverviewContentProps {
  result: JobResult;
  cells: CellFeatures[];
}

export function OverviewContent({ result, cells }: OverviewContentProps) {
  const setSelectedCellId = useJobStore(s => s.setSelectedCellId);
  const summary = result.mechano_score_summary;
  const m = result.hero_metrics;

  // Top 3 cells by |mechano_score|
  const topCells = useMemo(() => {
    const scored = cells.filter(c => typeof c.mechano_score === "number" && Number.isFinite(c.mechano_score));
    return [...scored]
      .sort((a, b) => Math.abs((b.mechano_score as number) ?? 0) - Math.abs((a.mechano_score as number) ?? 0))
      .slice(0, 3);
  }, [cells]);

  return (
    <>
      {/* Hero metrics */}
      <div style={{ display: "flex", gap: 0, marginBottom: 20 }}>
        <HeroMetric value={String(result.cell_count)} label="Cells" />
        <HeroMetric value={fmtSigned(m.mean_mechano_score)} label="Mechano" />
        <HeroMetric
          value={summary?.top_correlation_r != null ? fmt(summary.top_correlation_r) : "\u2014"}
          label="Glyco\u2194Mech"
        />
      </div>

      <Sep />

      {/* Heatmap */}
      {result.glyco_mechano_correlation_figure_json && (
        <>
          <div>
            <SectionLabel>Glyco \u2194 Mechano correlation</SectionLabel>
            {summary?.top_correlation_pair && (
              <div style={{ fontSize: 10, color: "#555", marginBottom: 8, fontFamily: "ui-monospace, monospace" }}>
                top |r| = {fmt(summary.top_correlation_r)} — {summary.top_correlation_pair[0]} &times; {summary.top_correlation_pair[1]}
              </div>
            )}
            <PlotlyDark figureJson={result.glyco_mechano_correlation_figure_json} height={220} />
          </div>
          <Sep />
        </>
      )}

      {/* Histogram */}
      {result.mechano_score_distribution_figure_json && (
        <>
          <div>
            <SectionLabel>Score distribution</SectionLabel>
            <PlotlyDark figureJson={result.mechano_score_distribution_figure_json} height={100} />
          </div>
          <Sep />
        </>
      )}

      {/* Top cells */}
      {topCells.length > 0 && (
        <div>
          <SectionLabel>Top deviating cells</SectionLabel>
          {topCells.map(cell => {
            const ms = cell.mechano_score as number;
            const isPos = ms >= 0;
            return (
              <div
                key={cell.cell_id}
                onClick={() => setSelectedCellId(Number(cell.cell_id))}
                style={{
                  display: "flex", alignItems: "center", padding: "7px 0",
                  borderBottom: "1px solid #1a1a1a", cursor: "pointer", fontSize: 11,
                }}
              >
                <span style={{ color: "#666", width: 32, flexShrink: 0 }}>#{cell.cell_id}</span>
                <span style={{ fontWeight: 600, color: isPos ? "#ef5350" : "#42a5f5" }}>
                  m {fmtSigned(ms)}
                </span>
                <span style={{ color: "#666", marginLeft: "auto" }}>
                  glyco {fmt(cell.glycocalyx_pericellular_ratio as number | null)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <Sep />

      {/* Full correlation — collapsed */}
      <CorrelationAudit figureJson={result.correlation_figure_json} />
    </>
  );
}

function HeroMetric({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ flex: 1, textAlign: "center" }}>
      <div style={{
        fontSize: 28, fontWeight: 700, color: value === "\u2014" ? "#444" : "#eee", lineHeight: 1,
        fontFamily: "ui-monospace, 'JetBrains Mono', monospace",
      }}>{value}</div>
      <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: 1, color: "#555", marginTop: 6 }}>{label}</div>
    </div>
  );
}

function Sep() {
  return <div style={{ height: 1, background: "#1a1a1a", margin: "16px 0" }} />;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: 1.5, color: "#555", marginBottom: 8 }}>{children}</div>;
}

function CorrelationAudit({ figureJson }: { figureJson: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div onClick={() => setOpen(v => !v)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", padding: "4px 0" }}>
        <span style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: 1.5, color: "#555" }}>Full correlation audit</span>
        <span style={{ fontSize: 10, color: "#555" }}>{open ? "\u25be" : "\u25b8"}</span>
      </div>
      {open && <PlotlyDark figureJson={figureJson} height={350} />}
    </div>
  );
}
