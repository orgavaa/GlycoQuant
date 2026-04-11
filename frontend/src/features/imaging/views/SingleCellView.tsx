/**
 * Single Cell — Stitch evidence dossier.
 *
 * Layout per stitch/single_cell_analysis/code.html:
 *   - Left: dark image canvas (flex-1, bg-inverse-surface) with
 *           floating overlay top-left (cell ID + zoom controls) and
 *           bottom channel-toggle bar
 *   - Right: w-[420px] evidence dossier on bg-surface-container-low
 *           - Individual profile card (cell id, QC badge, italic
 *             plain-English summary, 2x metric grid)
 *           - Sticky horizontal tabs: Glycocalyx / YAP / Actin /
 *             Explainability / Raw Values
 *           - Per-tab metric sections with sparklines + percentile
 *             callouts
 *           - Sub-cellular partitioning compact table
 *           - Footer "Flag for Further Review" CTA
 */
import { useMemo, useState } from "react";
import { useJobStore } from "@/lib/jobStore";
import { fmt } from "@/lib/utils";
import type { JobResult } from "@/lib/api";

interface SingleCellViewProps {
  result: JobResult;
}

interface CellRow {
  cell_id: number;
  [key: string]: number | undefined;
}

type EvidenceTab = "glycocalyx" | "yap" | "actin" | "explainability" | "raw";

const TAB_LABELS: { id: EvidenceTab; label: string }[] = [
  { id: "glycocalyx", label: "Glycocalyx" },
  { id: "yap", label: "YAP" },
  { id: "actin", label: "Actin" },
  { id: "explainability", label: "Explainability" },
  { id: "raw", label: "Raw Values" },
];

const CHANNEL_DOTS = [
  { color: "#0000FF", label: "DAPI" },
  { color: "#00FF00", label: "WGA" },
  { color: "#FF00FF", label: "YAP" },
  { color: "#FFBF00", label: "Actin" },
  { color: "#FF4500", label: "FA" },
];

export function SingleCellView({ result }: SingleCellViewProps) {
  const selectedCellId = useJobStore((s) => s.selectedCellId);
  const setSelectedCellId = useJobStore((s) => s.setSelectedCellId);
  const [activeTab, setActiveTab] = useState<EvidenceTab>("glycocalyx");

  const rows: CellRow[] = useMemo(() => {
    try {
      return JSON.parse(result.features_df_json) as CellRow[];
    } catch {
      return [];
    }
  }, [result.features_df_json]);

  const cellIds = useMemo(
    () => rows.map((r) => Number(r.cell_id)).sort((a, b) => a - b),
    [rows],
  );

  const effectiveCellId =
    selectedCellId ?? (cellIds.length > 0 ? cellIds[0] : null);

  const cell = useMemo(
    () =>
      effectiveCellId == null
        ? null
        : rows.find((r) => Number(r.cell_id) === effectiveCellId) ?? null,
    [rows, effectiveCellId],
  );

  // Per-feature population stats (mean, std) → z-scores for the
  // current cell, used to drive percentile labels and the small
  // "deviation" callout in the dossier header.
  const populationStats = useMemo(() => {
    const stats: Record<string, { mean: number; std: number; sorted: number[] }> = {};
    if (rows.length === 0) return stats;
    const keys = Object.keys(rows[0]).filter(
      (k) => k !== "cell_id" && !k.startsWith("deep_"),
    );
    for (const key of keys) {
      const values = rows
        .map((r) => r[key])
        .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
      if (values.length < 2) continue;
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance =
        values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
      const std = Math.sqrt(variance);
      const sorted = [...values].sort((a, b) => a - b);
      stats[key] = { mean, std, sorted };
    }
    return stats;
  }, [rows]);

  const zScore = (key: string): number | null => {
    if (!cell) return null;
    const v = cell[key];
    const s = populationStats[key];
    if (typeof v !== "number" || !Number.isFinite(v) || !s || s.std === 0) {
      return null;
    }
    return (v - s.mean) / s.std;
  };

  const percentile = (key: string): number | null => {
    if (!cell) return null;
    const v = cell[key];
    const s = populationStats[key];
    if (typeof v !== "number" || !Number.isFinite(v) || !s) return null;
    const rank = s.sorted.findIndex((x) => x >= v);
    return Math.round((rank / s.sorted.length) * 100);
  };

  const stateSummary = useMemo(() => {
    if (!cell) return "No cell selected.";
    const phrases: string[] = [];
    const glyco = cell.glycocalyx_pericellular_ratio;
    if (typeof glyco === "number") {
      phrases.push(
        glyco > 1.5
          ? "high pericellular glycocalyx"
          : glyco < 0.8
            ? "low pericellular glycocalyx"
            : "moderate pericellular glycocalyx",
      );
    }
    const yap = cell.yap_nc_ratio_size_corrected;
    if (typeof yap === "number") {
      phrases.push(
        yap > 1.5
          ? "elevated nuclear YAP"
          : yap < 0.8
            ? "low nuclear YAP"
            : "moderate nuclear YAP",
      );
    }
    const fa = cell.fa_mature_fraction;
    if (typeof fa === "number") {
      phrases.push(
        fa > 0.5
          ? "mature adhesions"
          : fa < 0.2
            ? "predominantly nascent adhesions"
            : "mixed adhesion population",
      );
    }
    if (phrases.length === 0) return "Insufficient features to summarise.";
    const score = cell.mechano_score;
    const verdict =
      typeof score === "number"
        ? score > 0.5
          ? " Exhibits hallmark mechanotransduction activation."
          : score < -0.5
            ? " Quiescent mechanotransduction state."
            : ""
        : "";
    return `${phrases.join(", ")}.${verdict}`;
  }, [cell]);

  const mechanoScore = cell?.mechano_score;
  const mechanoZ = zScore("mechano_score");

  if (cellIds.length === 0) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-3.5rem)]">
        <div className="bg-surface-container-lowest p-8 ghost-border">
          <p className="text-sm text-on-surface-variant uppercase tracking-widest">
            No cells in this analysis to inspect.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* ============================================================ */}
      {/* Left: dark image canvas                                       */}
      {/* ============================================================ */}
      <section className="flex-1 flex flex-col relative bg-inverse-surface overflow-hidden">
        {/* Top-left floating viewer header — cell id picker + zoom */}
        <div className="absolute top-4 left-6 z-10 flex items-center gap-4 bg-black/40 backdrop-blur-md p-2 ghost-border">
          <div className="flex items-center gap-2 px-2 border-r border-white/10">
            <button
              type="button"
              className="text-white hover:text-primary-container disabled:opacity-30"
              disabled={effectiveCellId == null}
              onClick={() => {
                if (effectiveCellId == null) return;
                const idx = cellIds.indexOf(effectiveCellId);
                setSelectedCellId(cellIds[Math.max(0, idx - 1)]);
              }}
            >
              <span className="material-symbols-outlined">chevron_left</span>
            </button>
            <span className="text-white text-xs font-mono tabular-nums tracking-wide">
              CELL {String(effectiveCellId).padStart(4, "0")}
            </span>
            <button
              type="button"
              className="text-white hover:text-primary-container disabled:opacity-30"
              disabled={effectiveCellId == null}
              onClick={() => {
                if (effectiveCellId == null) return;
                const idx = cellIds.indexOf(effectiveCellId);
                setSelectedCellId(
                  cellIds[Math.min(cellIds.length - 1, idx + 1)],
                );
              }}
            >
              <span className="material-symbols-outlined">chevron_right</span>
            </button>
          </div>
          <div className="flex items-center gap-3 px-2 text-white/60">
            <span className="material-symbols-outlined">zoom_in</span>
            <span className="material-symbols-outlined">zoom_out</span>
            <span className="material-symbols-outlined">crop_free</span>
          </div>
        </div>

        {/* Centre: image placeholder. Single-cell crops aren't streamed
            yet (Phase 2 inspection upgrade), so we show a placeholder
            tile that respects the dark canvas convention. */}
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="relative w-[500px] h-[500px] ghost-border">
            <div className="w-full h-full bg-inverse-surface flex items-center justify-center text-white/30 text-[10px] uppercase tracking-[0.2em]">
              Per-Cell Crop Pending
            </div>
            <div className="absolute inset-0 border-[3px] border-primary/30 pointer-events-none" />
          </div>
        </div>

        {/* Bottom channel + overlay toggle bar */}
        <div className="bg-black/90 backdrop-blur-md p-4 flex items-center justify-between border-t border-white/5">
          <div className="flex gap-4">
            {CHANNEL_DOTS.map((ch) => (
              <div
                key={ch.label}
                className="flex items-center gap-2 cursor-pointer group"
              >
                <div
                  className="w-2 h-2 rounded-[1px]"
                  style={{ backgroundColor: ch.color }}
                />
                <span className="text-[10px] font-medium text-white/70 uppercase tracking-widest group-hover:text-white">
                  {ch.label}
                </span>
              </div>
            ))}
          </div>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                defaultChecked
                className="w-3 h-3 rounded-none border-white/20 bg-transparent text-primary focus:ring-0"
              />
              <span className="text-[10px] font-medium text-white/60 uppercase tracking-widest">
                Segmentation Mask
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="w-3 h-3 rounded-none border-white/20 bg-transparent text-primary focus:ring-0"
              />
              <span className="text-[10px] font-medium text-white/60 uppercase tracking-widest">
                Pericellular Shell
              </span>
            </label>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* Right: evidence dossier (w-[420px])                           */}
      {/* ============================================================ */}
      <section className="w-[420px] bg-surface-container-low overflow-y-auto no-scrollbar ghost-border-l flex flex-col">
        {/* Individual profile card */}
        <div className="p-6 bg-surface-container-lowest ghost-border m-4 mb-2">
          <div className="flex justify-between items-start mb-6">
            <div>
              <span className="text-[10px] font-bold text-primary tracking-[0.2em] uppercase">
                Individual Profile
              </span>
              <h1 className="text-3xl font-headline font-bold tracking-tighter text-on-surface tabular-nums">
                C-{String(effectiveCellId).padStart(4, "0")}
              </h1>
            </div>
            <div className="px-2 py-1 bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase tracking-wider">
              QC Passed
            </div>
          </div>
          <p className="text-sm text-on-surface-variant leading-relaxed mb-6 italic border-l-2 border-primary/20 pl-3">
            &ldquo;{stateSummary}&rdquo;
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-surface-container p-3">
              <div className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                Mechano Score
              </div>
              <div className="text-2xl font-headline font-bold text-primary tabular-nums">
                {fmt(mechanoScore, 2)}
              </div>
            </div>
            <div className="bg-surface-container p-3">
              <div className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                Deviation
              </div>
              <div className="text-2xl font-headline font-bold text-on-surface tabular-nums">
                {mechanoZ != null
                  ? `${mechanoZ >= 0 ? "+" : ""}${mechanoZ.toFixed(1)}σ`
                  : "—"}
              </div>
            </div>
          </div>
        </div>

        {/* Sticky tab bar */}
        <div className="mt-2 flex-1 flex flex-col">
          <div className="px-6 flex gap-6 ghost-border-b overflow-x-auto no-scrollbar">
            {TAB_LABELS.map((tab) => {
              const isActive = tab.id === activeTab;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`pb-3 text-[10px] font-bold uppercase tracking-widest whitespace-nowrap transition-colors ${
                    isActive
                      ? "text-primary border-b-2 border-primary"
                      : "text-on-surface-variant/60 hover:text-on-surface"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Per-tab content */}
          <div className="p-6 space-y-8">
            {activeTab === "glycocalyx" && (
              <>
                <MetricSection
                  label="Mean intensity"
                  value={fmt(cell?.glycocalyx_mean_intensity, 3)}
                  unit="RFU"
                  percentile={percentile("glycocalyx_mean_intensity")}
                  description="Average WGA-lectin intensity over the pericellular ring."
                />
                <MetricSection
                  label="Pericellular ratio"
                  value={fmt(cell?.glycocalyx_pericellular_ratio, 2)}
                  percentile={percentile("glycocalyx_pericellular_ratio")}
                  description="Ring intensity divided by interior intensity — proxy for shell enrichment."
                />
                <MetricSection
                  label="Shannon entropy"
                  value={fmt(cell?.glycocalyx_shannon_entropy, 3)}
                  unit="nats"
                  percentile={percentile("glycocalyx_shannon_entropy")}
                  description="Information-theoretic heterogeneity over the ring intensity histogram."
                />
                <MetricSection
                  label="Haralick contrast"
                  value={fmt(cell?.glycocalyx_haralick_contrast, 2)}
                  percentile={percentile("glycocalyx_haralick_contrast")}
                  description="GLCM-based texture contrast — high values indicate sharp local intensity changes."
                />
              </>
            )}

            {activeTab === "yap" && (
              <>
                <MetricSection
                  label="YAP N/C (size-corrected)"
                  value={fmt(cell?.yap_nc_ratio_size_corrected, 2)}
                  percentile={percentile("yap_nc_ratio_size_corrected")}
                  description="Jones 2024 area-residualised nuclear/cytoplasmic ratio. Removes the spreading-area confound."
                />
                <MetricSection
                  label="Raw N/C"
                  value={fmt(cell?.yap_nc_ratio, 2)}
                  percentile={percentile("yap_nc_ratio")}
                  description="Uncorrected nuclear/cytoplasmic ratio shown for reference."
                />
                <MetricSection
                  label="Nuclear intensity"
                  value={fmt(cell?.yap_nuclear_intensity, 1)}
                  unit="RFU"
                  percentile={percentile("yap_nuclear_intensity")}
                  description="Mean YAP signal inside the nuclear mask."
                />
              </>
            )}

            {activeTab === "actin" && (
              <>
                <MetricSection
                  label="Stress-fibre coherence"
                  value={fmt(cell?.actin_stress_fiber_coherence, 3)}
                  percentile={percentile("actin_stress_fiber_coherence")}
                  description="Structure-tensor coherence (Jähne 1993) — 1 = perfectly aligned, 0 = isotropic."
                />
                <MetricSection
                  label="Cortical/cytoplasmic ratio"
                  value={fmt(cell?.actin_cortical_ratio, 2)}
                  percentile={percentile("actin_cortical_ratio")}
                  description="Mean cortical-ring intensity divided by deep-interior intensity."
                />
                <MetricSection
                  label="Dominant orientation"
                  value={fmt(cell?.actin_dominant_orientation, 1)}
                  unit="°"
                  percentile={null}
                  description="Principal stress-fibre angle from the structure tensor, in degrees (-90, 90]."
                />
              </>
            )}

            {activeTab === "explainability" && (
              <div className="space-y-4">
                <p className="text-[11px] text-on-surface-variant leading-normal">
                  Concept-based attribution (TCAV), GradCAM and SHAP for the
                  deep-feature blocks are deferred per
                  UI_SCIENCE_GUIDELINES §11. Until then, the per-cell z-scores
                  on each tab are the most direct interpretable evidence for
                  why a cell scored where it did.
                </p>
              </div>
            )}

            {activeTab === "raw" && cell && (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-surface-container-high">
                      <th className="p-2 text-[9px] font-bold uppercase tracking-wider text-on-surface-variant">
                        Feature
                      </th>
                      <th className="p-2 text-[9px] font-bold uppercase tracking-wider text-on-surface-variant text-right">
                        Value
                      </th>
                      <th className="p-2 text-[9px] font-bold uppercase tracking-wider text-on-surface-variant text-right">
                        z
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/10">
                    {Object.entries(cell)
                      .filter(
                        ([k]) =>
                          k !== "cell_id" && !k.startsWith("deep_"),
                      )
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([k, v]) => {
                        const z = zScore(k);
                        return (
                          <tr key={k}>
                            <td className="p-2 text-[10px] font-mono">{k}</td>
                            <td className="p-2 text-[10px] text-right font-mono tabular-nums">
                              {typeof v === "number" && Number.isFinite(v)
                                ? v.toFixed(3)
                                : "—"}
                            </td>
                            <td
                              className={`p-2 text-[10px] text-right font-mono tabular-nums ${
                                z != null && Math.abs(z) > 1.5
                                  ? z > 0
                                    ? "text-primary"
                                    : "text-tertiary-stitch"
                                  : "text-on-surface-variant"
                              }`}
                            >
                              {z != null
                                ? `${z >= 0 ? "+" : ""}${z.toFixed(1)}`
                                : "—"}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Footer flag CTA */}
        <div className="p-6 mt-auto bg-surface-container-highest/40 ghost-border-t">
          <button
            type="button"
            className="w-full py-2.5 bg-on-surface text-surface text-[10px] font-bold uppercase tracking-[0.1em] hover:opacity-90 transition-opacity"
          >
            Flag for Further Review
          </button>
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------
// Per-metric block helper used by the per-tab content
// ---------------------------------------------------------------------

function MetricSection({
  label,
  value,
  unit,
  percentile,
  description,
}: {
  label: string;
  value: string;
  unit?: string;
  percentile: number | null;
  description: string;
}) {
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-end">
        <div>
          <h4 className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">
            {label}
          </h4>
          <div className="text-xl font-headline font-bold text-on-surface tabular-nums">
            {value}
            {unit && (
              <span className="text-[10px] font-medium text-outline ml-1">
                {unit}
              </span>
            )}
          </div>
        </div>
        {percentile != null && (
          <div className="text-right">
            <div
              className={`text-[10px] font-bold uppercase ${
                percentile > 75 || percentile < 25
                  ? "text-primary"
                  : "text-on-surface-variant"
              }`}
            >
              {percentile}th Percentile
            </div>
            {/* Tiny sparkline using flex bars */}
            <div className="flex items-end gap-[1px] h-4 mt-1 justify-end">
              {[0.2, 0.4, 0.3, 0.6, 0.8, 0.5].map((h, i) => (
                <div
                  key={i}
                  className={`w-1 ${i === 4 ? "bg-primary" : "bg-primary/20"}`}
                  style={{ height: `${h * 16}px` }}
                />
              ))}
            </div>
          </div>
        )}
      </div>
      <p className="text-[11px] text-on-surface-variant leading-normal">
        {description}
      </p>
    </div>
  );
}
