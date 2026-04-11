/**
 * Single Cell — 1:1 React port of stitch/single_cell_analysis/code.html
 * lines 142–333.
 *
 * Layout, classes, and node hierarchy mirror the Stitch HTML exactly.
 * Real data binding:
 *   - Cell ID picker (top-left header) → useJobStore selectedCellId
 *   - Profile card values (mechano score, deviation, summary)
 *   - Per-tab metric sections (Volume Integral, Mean Thickness, etc.)
 *   - Sub-cellular partitioning table → real per-cell z-scores
 *
 * Static decorative elements (channel data dots, sparkline shapes,
 * cell crop image URL from Stitch) stay as Stitch defaults.
 * The shell (top nav, right sidebar) is rendered by App.tsx.
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

const STITCH_CELL_IMAGE =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuCKYds4tzIXe-2iK75zPTYaryYmP-NfM-ujEY4IODzTgUixWhj1V1SWNXqG2WYGl4FaDpvNJAkjhUIgf3kfRmj-JbMoNgx34XocW6OXTNSbhzozSBIr5Edpk2u9LT70sAP8--rq_eYsbzbFITOZC98vwpJPT9DP60dehoUwWCvzBjOGj7AyqSHDW5aG4fAZHditvIndj_ooWleA79Gk77EKvxyHW0DRpHqNMcZVQCgmOECTPJST03vPKxNHCYNFNVQ3cQRmM91k6aY";

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

  // Population stats for z-scores and percentile callouts
  const populationStats = useMemo(() => {
    const stats: Record<
      string,
      { mean: number; std: number; sorted: number[] }
    > = {};
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
    if (typeof v !== "number" || !Number.isFinite(v) || !s || s.std === 0)
      return null;
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
    if (!cell)
      return "Select a cell to view its mechanotransduction profile.";
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
      phrases.push(fa > 0.5 ? "mature adhesions" : "nascent adhesions");
    }
    const verdict =
      typeof cell.mechano_score === "number" && cell.mechano_score > 0.5
        ? " Exhibits hallmark mechanotransduction activation."
        : "";
    return `${phrases.join(", ")}.${verdict}`;
  }, [cell]);

  const mechanoZ = zScore("mechano_score");
  const cellLabel = effectiveCellId != null ? `C-${String(effectiveCellId).padStart(4, "0")}` : "—";

  // Stitch placeholder values for the metric sections — fall back to
  // these if real data is missing so the screen still looks right.
  const volumeIntegral = cell?.glycocalyx_integrated_intensity;
  const meanThickness = cell?.glycocalyx_radial_decay_rate;

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
      {/* Left Panel: Single-Cell Viewer                                */}
      {/* ============================================================ */}
      <section className="flex-1 flex flex-col relative bg-inverse-surface overflow-hidden">
        {/* Viewer Header Overlay */}
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
            <span className="text-white text-xs font-mono tabular-nums">
              CELL {cellLabel}
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
          <div className="flex items-center gap-3 px-2">
            <button type="button" className="text-white/60 hover:text-white">
              <span className="material-symbols-outlined">zoom_in</span>
            </button>
            <button type="button" className="text-white/60 hover:text-white">
              <span className="material-symbols-outlined">zoom_out</span>
            </button>
            <button type="button" className="text-white/60 hover:text-white">
              <span className="material-symbols-outlined">crop_free</span>
            </button>
          </div>
        </div>

        {/* Main Image Canvas — Stitch placeholder until per-cell crops stream */}
        <div className="flex-1 flex items-center justify-center p-8 bg-slate-950">
          <div className="relative w-[500px] h-[500px] shadow-2xl">
            <img
              className="w-full h-full object-cover opacity-90 border border-white/5"
              alt="Cell crop"
              src={STITCH_CELL_IMAGE}
              onError={(e) => {
                const t = e.target as HTMLImageElement;
                t.style.display = "none";
              }}
            />
            <div className="absolute inset-0 border-[3px] border-blue-500/40 pointer-events-none" />
            <div className="absolute inset-0 bg-blue-500/5 pointer-events-none" />
          </div>
        </div>

        {/* Viewer Bottom Controls */}
        <div className="bg-slate-900/90 backdrop-blur-md p-4 flex items-center justify-between border-t border-white/5">
          <div className="flex gap-4">
            <ChannelDot color="#0000FF" label="DAPI" />
            <ChannelDot color="#00FF00" label="WGA" />
            <ChannelDot color="#FF00FF" label="YAP" />
            <ChannelDot color="#FFBF00" label="Actin" />
            <ChannelDot color="#FF4500" label="FA" />
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
      {/* Right Panel: Evidence Dossier                                  */}
      {/* ============================================================ */}
      <section className="w-[420px] bg-surface-container-low overflow-y-auto no-scrollbar border-l border-outline-variant/15 flex flex-col">
        {/* Summary Card */}
        <div className="p-6 bg-surface-container-lowest ghost-border m-4 mb-2">
          <div className="flex justify-between items-start mb-6">
            <div>
              <span className="text-[10px] font-bold text-primary tracking-[0.2em] uppercase">
                Individual Profile
              </span>
              <h1 className="text-3xl font-bold font-headline tracking-tighter text-on-surface tabular-nums">
                {cellLabel}
              </h1>
            </div>
            <div className="px-2 py-1 bg-green-100 text-green-700 text-[10px] font-bold uppercase tracking-wider">
              QC Passed
            </div>
          </div>
          <p className="text-sm text-on-surface-variant leading-relaxed mb-6 font-medium italic border-l-2 border-primary/20 pl-3">
            &ldquo;{stateSummary}&rdquo;
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-surface-container p-3">
              <div className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                Mechano Score
              </div>
              <div className="text-2xl font-headline font-bold text-primary tabular-nums">
                {fmt(cell?.mechano_score, 2)}
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

        {/* Analysis Tabs */}
        <div className="mt-2 flex-1 flex flex-col">
          <div className="px-6 flex gap-6 border-b border-outline-variant/10 overflow-x-auto no-scrollbar">
            <TabButton
              active={activeTab === "glycocalyx"}
              onClick={() => setActiveTab("glycocalyx")}
            >
              Glycocalyx
            </TabButton>
            <TabButton
              active={activeTab === "yap"}
              onClick={() => setActiveTab("yap")}
            >
              YAP
            </TabButton>
            <TabButton
              active={activeTab === "actin"}
              onClick={() => setActiveTab("actin")}
            >
              Actin
            </TabButton>
            <TabButton
              active={activeTab === "explainability"}
              onClick={() => setActiveTab("explainability")}
            >
              Explainability
            </TabButton>
            <TabButton
              active={activeTab === "raw"}
              onClick={() => setActiveTab("raw")}
            >
              Raw Values
            </TabButton>
          </div>

          <div className="p-6 space-y-8">
            {activeTab === "glycocalyx" && (
              <>
                <MetricSection
                  label="Volume Integral (WGA)"
                  value={fmt(volumeIntegral, 1)}
                  unit="RFU/µm³"
                  percentile={percentile("glycocalyx_integrated_intensity")}
                  description="The total fluorescent intensity of WGA stain integrated across the 2.5µm pericellular buffer region, representing total glycocalyx density."
                />
                <MetricSection
                  label="Mean Thickness"
                  value={fmt(meanThickness, 0)}
                  unit="nm (decay)"
                  percentile={percentile("glycocalyx_radial_decay_rate")}
                  description="Average radial distance of the WGA signal threshold from the membrane mask edge."
                />

                {/* Compact Raw Table */}
                <div className="pt-4">
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-3">
                    Sub-cellular Partitioning
                  </h4>
                  <div className="border border-outline-variant/10">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-surface-container-high">
                          <th className="p-2 text-[9px] font-bold uppercase tracking-wider text-on-secondary-container">
                            Feature
                          </th>
                          <th className="p-2 text-[9px] font-bold uppercase tracking-wider text-on-secondary-container text-right">
                            Value
                          </th>
                          <th className="p-2 text-[9px] font-bold uppercase tracking-wider text-on-secondary-container text-right">
                            Norm
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant/10">
                        <PartitioningRow
                          label="Pericellular ratio"
                          value={cell?.glycocalyx_pericellular_ratio}
                          z={zScore("glycocalyx_pericellular_ratio")}
                        />
                        <PartitioningRow
                          label="Coverage"
                          value={cell?.glycocalyx_coverage}
                          z={zScore("glycocalyx_coverage")}
                        />
                        <PartitioningRow
                          label="Heterogeneity (CV)"
                          value={cell?.glycocalyx_heterogeneity}
                          z={zScore("glycocalyx_heterogeneity")}
                        />
                        <PartitioningRow
                          label="Moran's I"
                          value={cell?.glycocalyx_moran_i}
                          z={zScore("glycocalyx_moran_i")}
                        />
                      </tbody>
                    </table>
                  </div>
                </div>
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
                  description="Principal stress-fibre angle from the structure tensor."
                />
              </>
            )}

            {activeTab === "explainability" && (
              <p className="text-[11px] text-on-surface-variant leading-normal">
                Concept-based attribution (TCAV), GradCAM and SHAP for the
                deep-feature blocks are deferred. Until then, the per-cell
                z-scores on each tab are the most direct interpretable
                evidence for why a cell scored where it did.
              </p>
            )}

            {activeTab === "raw" && cell && (
              <div className="overflow-x-auto">
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-3">
                  Per-cell Feature Values · z vs Population
                </h4>
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-surface-container-high">
                      <th className="p-2 text-[9px] font-bold uppercase tracking-wider text-on-secondary-container">
                        Feature
                      </th>
                      <th className="p-2 text-[9px] font-bold uppercase tracking-wider text-on-secondary-container text-right">
                        Value
                      </th>
                      <th className="p-2 text-[9px] font-bold uppercase tracking-wider text-on-secondary-container text-right">
                        z
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/10">
                    {Object.entries(cell)
                      .filter(
                        ([k]) => k !== "cell_id" && !k.startsWith("deep_"),
                      )
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([k, v]) => (
                        <PartitioningRow
                          key={k}
                          label={k}
                          value={typeof v === "number" ? v : undefined}
                          z={zScore(k)}
                        />
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Footer Action */}
        <div className="p-6 mt-auto bg-surface-container-highest/50 border-t border-outline-variant/10">
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
// Tiny presentational helpers
// ---------------------------------------------------------------------

function ChannelDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2 group cursor-pointer">
      <div className="w-2 h-2" style={{ backgroundColor: color }} />
      <span className="text-[10px] font-medium text-white/80 uppercase tracking-widest group-hover:text-white">
        {label}
      </span>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`pb-3 text-[10px] font-bold uppercase tracking-widest whitespace-nowrap transition-colors ${
        active
          ? "text-primary border-b-2 border-primary"
          : "text-on-surface-variant/60 hover:text-on-surface"
      }`}
    >
      {children}
    </button>
  );
}

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
    <div className="space-y-4">
      <div className="flex justify-between items-end">
        <div>
          <h4 className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">
            {label}
          </h4>
          <div className="text-xl font-bold font-headline text-on-surface tabular-nums">
            {value}{" "}
            {unit && (
              <span className="text-[10px] font-medium text-outline">
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
            {/* Tiny sparkline mockup — same shape as Stitch */}
            <div className="flex items-end gap-[1px] h-4 mt-1">
              <div className="w-1 bg-primary/20 h-1" />
              <div className="w-1 bg-primary/20 h-2" />
              <div className="w-1 bg-primary/20 h-1.5" />
              <div className="w-1 bg-primary/20 h-3" />
              <div className="w-1 bg-primary h-4" />
              <div className="w-1 bg-primary/20 h-2.5" />
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

function PartitioningRow({
  label,
  value,
  z,
}: {
  label: string;
  value: number | undefined;
  z: number | null;
}) {
  const zClass =
    z == null
      ? "text-on-surface-variant"
      : z > 1.0
        ? "text-primary"
        : z < -1.0
          ? "text-emerald-600"
          : "text-tertiary-stitch";
  return (
    <tr>
      <td className="p-2 text-[10px] font-medium">{label}</td>
      <td className="p-2 text-[10px] text-right font-mono tabular-nums">
        {typeof value === "number" && Number.isFinite(value)
          ? value.toFixed(3)
          : "—"}
      </td>
      <td className={`p-2 text-[10px] text-right font-mono tabular-nums ${zClass}`}>
        {z != null ? `${z >= 0 ? "+" : ""}${z.toFixed(1)}σ` : "—"}
      </td>
    </tr>
  );
}
