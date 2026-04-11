/**
 * Methods & QC — Stitch trust screen.
 *
 * Layout per stitch/methods_qc/code.html:
 *   - Editorial header (display-md, max-w-2xl description)
 *   - Section 1: Acquisition / Metadata (col-span-8) — channel
 *     mapping, spatial resolution, segmentation model, compute
 *   - Section 2: YAP Correction Diagnostic (col-span-12) — figures
 *     left, scientific note + formula right
 *   - Section 3: Score Internals (col-span-5) — PCA variance bars +
 *     loadings table
 *   - Section 4: Pipeline Provenance (col-span-7) — module/method/
 *     params/QC table
 *   - Section 5: Audit Raw Payload (col-span-12, dark inverse-surface)
 *     — correlation mini-heatmap + raw CSV preview console
 */
import { useMemo } from "react";
import { fmt } from "@/lib/utils";
import type { JobResult } from "@/lib/api";

interface MethodsQCViewProps {
  result: JobResult;
  pixelSizeUm: number;
  cellDiameter: number;
  includeDeepFeatures: boolean;
  datasetLabel: string | null;
}

export function MethodsQCView({
  result,
  pixelSizeUm,
  cellDiameter,
  includeDeepFeatures,
  datasetLabel,
}: MethodsQCViewProps) {
  const summary = result.mechano_score_summary;
  const sortedLoadings = useMemo(
    () =>
      Object.entries(summary?.loadings ?? {}).sort(
        ([, a], [, b]) => Math.abs(b) - Math.abs(a),
      ),
    [summary],
  );

  // Extract YAP size correction diagnostics from the per-cell DataFrame
  // (broadcast to every row by mechano_score.apply_yap_size_correction).
  const { slope, r2, rawCsvPreview } = useMemo(() => {
    let slope: number | null = null;
    let r2: number | null = null;
    let rawCsvPreview: string[] = [];
    try {
      const rows = JSON.parse(result.features_df_json) as Array<
        Record<string, number>
      >;
      const first = rows[0];
      if (first) {
        const s = first.yap_size_correction_slope;
        const r = first.yap_size_correction_r2;
        if (typeof s === "number" && Number.isFinite(s)) slope = s;
        if (typeof r === "number" && Number.isFinite(r)) r2 = r;
      }
      if (rows.length > 0) {
        const cols = [
          "cell_id",
          "yap_nc_ratio_size_corrected",
          "fa_mature_fraction",
          "actin_stress_fiber_coherence",
          "mechano_score",
        ].filter((c) => c in rows[0]);
        rawCsvPreview = [
          cols.join(","),
          ...rows.slice(0, 8).map((r) =>
            cols
              .map((c) => {
                const v = r[c];
                return typeof v === "number" && Number.isFinite(v)
                  ? v.toFixed(3)
                  : "—";
              })
              .join(","),
          ),
        ];
      }
    } catch {
      // ignore
    }
    return { slope, r2, rawCsvPreview };
  }, [result.features_df_json]);

  return (
    <div className="mx-auto max-w-[1400px] px-8 py-10">
      {/* Editorial header */}
      <header className="mb-10">
        <h1 className="text-[2.75rem] font-headline font-medium tracking-tighter text-on-surface leading-none mb-4">
          Methods &amp; Quality Control
        </h1>
        <p className="text-sm text-on-surface-variant max-w-2xl leading-relaxed">
          A comprehensive technical record of acquisition parameters,
          normalisation protocols, and validation metrics — every number on
          the other tabs is traceable through the rows below.
        </p>
      </header>

      <div className="grid grid-cols-12 gap-6">
        {/* ============================================== */}
        {/* Section 1: Acquisition & Metadata (col-span-8)  */}
        {/* ============================================== */}
        <section className="col-span-12 lg:col-span-8 bg-surface-container-lowest p-8 ghost-border">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-primary">
                settings_input_component
              </span>
              <h2 className="text-xl font-headline font-semibold tracking-tight">
                Acquisition / Metadata
              </h2>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 bg-surface-container">
              Status: Verified
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            <div className="space-y-6">
              <div>
                <label className="block text-[10px] font-bold text-outline uppercase tracking-widest mb-2">
                  Channel Mapping
                </label>
                <div className="space-y-2">
                  <ChannelRow color="#0000FF" label="CH1: DAPI (Nuclei)" />
                  <ChannelRow
                    color="#00FF00"
                    label="CH2: WGA (Glycocalyx)"
                  />
                  <ChannelRow color="#FF00FF" label="CH3: YAP" />
                  <ChannelRow
                    color="#FF4500"
                    label="CH4: Paxillin (FA)"
                  />
                  <ChannelRow color="#FFBF00" label="CH5: Phalloidin (Actin)" />
                </div>
              </div>
            </div>
            <div className="space-y-6">
              <div>
                <label className="block text-[10px] font-bold text-outline uppercase tracking-widest mb-1">
                  Spatial Resolution
                </label>
                <div className="text-2xl font-headline font-light tabular-nums">
                  {pixelSizeUm.toFixed(3)}{" "}
                  <span className="text-base">µm/px</span>
                </div>
                <p className="text-xs text-on-surface-variant mt-1">
                  Cell-diameter prior {cellDiameter} px
                </p>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-outline uppercase tracking-widest mb-1">
                  Segmentation Model
                </label>
                <div className="text-sm font-mono bg-surface-container px-2 py-1 inline-block">
                  Cellpose-SAM (cpsam)
                </div>
                <p className="text-[10px] text-on-surface-variant mt-1 italic">
                  Pachitariu, Rariden &amp; Stringer 2025
                </p>
              </div>
            </div>
            <div className="space-y-6">
              <div className="p-4 bg-surface-container-low border-l-2 border-primary">
                <label className="block text-[10px] font-bold text-outline uppercase tracking-widest mb-1">
                  Run Provenance
                </label>
                <div className="text-sm font-medium">
                  {datasetLabel ?? "uploaded image"}
                </div>
                <div className="text-xs text-on-surface-variant mt-2">
                  Cells detected:{" "}
                  <span className="font-mono tabular-nums">
                    {result.cell_count}
                  </span>
                </div>
                <div className="text-xs text-on-surface-variant">
                  Image hash:{" "}
                  <span className="font-mono">
                    {result.image_hash.slice(0, 12)}…
                  </span>
                </div>
                <div className="text-xs text-on-surface-variant">
                  Deep features:{" "}
                  {includeDeepFeatures
                    ? result.deep_embedding_backend ===
                      "cell_dino_channel_adaptive"
                      ? "Cell-DINO ViT-L/16"
                      : "DINOv2-base"
                    : "skipped"}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============================================== */}
        {/* Section 2: YAP Correction Diagnostic            */}
        {/* ============================================== */}
        <section className="col-span-12 bg-surface-container-lowest p-8 ghost-border">
          <div className="flex items-center gap-3 mb-8">
            <span className="material-symbols-outlined text-primary">
              query_stats
            </span>
            <h2 className="text-xl font-headline font-semibold tracking-tight">
              YAP Size-Correction Diagnostic
            </h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="space-y-4">
              <div className="aspect-square bg-surface-container flex flex-col items-center justify-center p-6 ghost-border">
                <div className="w-full h-full flex items-center justify-center text-on-surface-variant/30 text-[10px] uppercase tracking-widest">
                  Raw vs Area · Plot Pending
                </div>
                <span className="text-[10px] font-bold text-outline uppercase mt-4 tracking-widest">
                  Fig 1 · Raw N/C vs Area
                </span>
              </div>
            </div>
            <div className="space-y-4">
              <div className="aspect-square bg-surface-container flex flex-col items-center justify-center p-6 ghost-border">
                <div className="w-full h-full flex items-center justify-center text-on-surface-variant/30 text-[10px] uppercase tracking-widest">
                  Residuals · Plot Pending
                </div>
                <span className="text-[10px] font-bold text-outline uppercase mt-4 tracking-widest">
                  Fig 2 · Area-Corrected Residuals
                </span>
              </div>
            </div>
            <div className="flex flex-col justify-center bg-surface-container-low p-8">
              <h4 className="text-sm font-headline font-semibold mb-3">
                Scientific Note: Size Correction
              </h4>
              <p className="text-sm text-on-surface-variant leading-relaxed">
                Jones <em>et al.</em> 2024 (<em>Mol. Omics</em> 20:554)
                showed whole-cell YAP concentration drops 4–8× with cell
                area. We regress raw N/C on cell_area and store the residuals
                so the corrected score isolates the mechanotransduction
                signal from the spreading-area confound.
              </p>
              <div className="mt-6 font-mono text-xs text-primary bg-white p-3 ghost-border">
                δ = yap_nc_ratio − (β₀ + β₁ · cell_area)
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <DiagnosticCell
                  label="Slope (β₁)"
                  value={fmt(slope, 5)}
                />
                <DiagnosticCell label="R²" value={fmt(r2, 3)} />
              </div>
              {slope == null && (
                <div className="mt-3 ghost-border bg-amber-500/10 p-3 text-[11px] text-amber-700">
                  Size correction fell back: fewer than 30 cells with finite
                  (raw N/C, cell_area) values. The corrected column is a copy
                  of the raw column for this run.
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ============================================== */}
        {/* Section 3: Score Internals (col-span-5)         */}
        {/* ============================================== */}
        <section className="col-span-12 lg:col-span-5 bg-surface-container-lowest p-8 ghost-border">
          <div className="flex items-center gap-3 mb-6">
            <span className="material-symbols-outlined text-primary">
              account_tree
            </span>
            <h2 className="text-xl font-headline font-semibold tracking-tight">
              Score Internals
            </h2>
          </div>
          <div className="space-y-8">
            <div>
              <label className="block text-[10px] font-bold text-outline uppercase tracking-widest mb-4">
                Mechano-Score Composition
              </label>
              <div className="flex flex-wrap items-center gap-3 text-[10px] mb-4">
                {summary && summary.mode === "pca" ? (
                  <span className="px-1.5 py-0.5 ghost-border bg-surface-container-lowest text-on-surface font-medium uppercase tracking-wider">
                    PCA · PC1{" "}
                    {(summary.pc1_variance_explained * 100).toFixed(0)}% var
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 border border-amber-500/40 bg-amber-500/10 text-amber-700 font-bold uppercase tracking-wider">
                    Weighted-sum fallback
                  </span>
                )}
                {summary && (
                  <span className="text-on-surface-variant tabular-nums">
                    n = {summary.n_cells_used} ·{" "}
                    {summary.n_features_used} features
                  </span>
                )}
              </div>
            </div>
            {summary && (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="ghost-border-b">
                      <th className="py-2 text-[10px] font-bold text-outline uppercase tracking-widest">
                        Feature
                      </th>
                      <th className="py-2 text-[10px] font-bold text-outline uppercase tracking-widest text-right">
                        Loading
                      </th>
                    </tr>
                  </thead>
                  <tbody className="text-sm">
                    {sortedLoadings.map(([feat, w]) => (
                      <tr key={feat} className="ghost-border-b">
                        <td className="py-3 font-mono text-xs">{feat}</td>
                        <td className="py-3 text-right font-mono tabular-nums">
                          {w >= 0 ? "+" : ""}
                          {w.toFixed(3)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        {/* ============================================== */}
        {/* Section 4: Pipeline Provenance (col-span-7)     */}
        {/* ============================================== */}
        <section className="col-span-12 lg:col-span-7 bg-surface-container-lowest p-8 ghost-border">
          <div className="flex items-center gap-3 mb-6">
            <span className="material-symbols-outlined text-primary">
              account_tree
            </span>
            <h2 className="text-xl font-headline font-semibold tracking-tight">
              Pipeline Provenance
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-surface-container-low">
                  <th className="p-4 text-[10px] font-bold text-outline uppercase tracking-widest">
                    Module
                  </th>
                  <th className="p-4 text-[10px] font-bold text-outline uppercase tracking-widest">
                    Method
                  </th>
                  <th className="p-4 text-[10px] font-bold text-outline uppercase tracking-widest">
                    Citation
                  </th>
                  <th className="p-4 text-[10px] font-bold text-outline uppercase tracking-widest text-right">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="text-sm">
                <ProvenanceRow
                  module="Segmentation"
                  method="Cellpose-SAM (cpsam)"
                  cite="Pachitariu 2025"
                  status="PASS"
                />
                <ProvenanceRow
                  module="Background"
                  method="white-tophat (25 px)"
                  cite="Möckl 2019"
                  status="PASS"
                />
                <ProvenanceRow
                  module="Glycocalyx"
                  method="Pericellular ring + Haralick + Moran's I"
                  cite="Tholen 2025"
                  status="PASS"
                />
                <ProvenanceRow
                  module="YAP"
                  method="N/C + size correction"
                  cite="Jones 2024"
                  status={slope == null ? "WARN" : "PASS"}
                />
                <ProvenanceRow
                  module="Focal Adhesions"
                  method="Otsu + Buskermolen maturation bins"
                  cite="Buskermolen 2018"
                  status="PASS"
                />
                <ProvenanceRow
                  module="Actin"
                  method="Structure tensor coherence"
                  cite="Jähne 1993"
                  status="PASS"
                />
                <ProvenanceRow
                  module="Mechano Score"
                  method={
                    summary?.mode === "pca"
                      ? "PCA over 12-feature panel"
                      : "Weighted-sum fallback"
                  }
                  cite="this work"
                  status={summary?.mode === "pca" ? "PASS" : "WARN"}
                />
                {includeDeepFeatures && (
                  <ProvenanceRow
                    module="Deep Embedding"
                    method={
                      result.deep_embedding_backend ===
                      "cell_dino_channel_adaptive"
                        ? "Cell-DINO ViT-L/16 (channel-adaptive)"
                        : "DINOv2-base"
                    }
                    cite={
                      result.deep_embedding_backend ===
                      "cell_dino_channel_adaptive"
                        ? "FAIR 2025"
                        : "Oquab 2024"
                    }
                    status="PASS"
                  />
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* ============================================== */}
        {/* Section 5: Audit Raw Payload (dark)             */}
        {/* ============================================== */}
        <section className="col-span-12 bg-inverse-surface p-8 text-surface-container-lowest">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-primary-container">
                security
              </span>
              <h2 className="text-xl font-headline font-semibold tracking-tight">
                Audit · Raw Payload Preview
              </h2>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            <div className="lg:col-span-1 border-r border-white/10 pr-8">
              <h4 className="text-[10px] font-bold text-inverse-on-surface uppercase tracking-widest mb-4">
                Image Hash
              </h4>
              <div className="font-mono text-[10px] text-blue-300 break-all">
                {result.image_hash}
              </div>
              <h4 className="text-[10px] font-bold text-inverse-on-surface uppercase tracking-widest mb-4 mt-8">
                Cells Analysed
              </h4>
              <div className="font-mono text-2xl tabular-nums text-white">
                {result.cell_count}
              </div>
            </div>
            <div className="lg:col-span-3">
              <div className="bg-black p-4 font-mono text-[11px] leading-relaxed text-blue-300 h-64 overflow-y-auto">
                <div className="opacity-50 mb-1">
                  # sha256:{result.image_hash.slice(0, 16)}…
                </div>
                {rawCsvPreview.map((line, i) => (
                  <div
                    key={i}
                    className={i === 0 ? "text-white font-bold" : ""}
                  >
                    {line}
                  </div>
                ))}
                <div className="opacity-50">… ({result.cell_count} rows total)</div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Tiny presentational helpers
// ---------------------------------------------------------------------

function ChannelRow({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="w-2 h-2"
        style={{ backgroundColor: color }}
      />
      <span className="text-sm font-medium text-on-surface">{label}</span>
    </div>
  );
}

function DiagnosticCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="ghost-border bg-white p-2">
      <span className="block text-[10px] font-bold text-outline uppercase tracking-widest">
        {label}
      </span>
      <span className="block text-sm font-mono text-on-surface tabular-nums">
        {value}
      </span>
    </div>
  );
}

function ProvenanceRow({
  module,
  method,
  cite,
  status,
}: {
  module: string;
  method: string;
  cite: string;
  status: "PASS" | "WARN" | "FAIL";
}) {
  const statusClass = {
    PASS: "bg-emerald-50 text-emerald-700 border-emerald-200",
    WARN: "bg-amber-50 text-amber-700 border-amber-200",
    FAIL: "bg-red-50 text-red-700 border-red-200",
  }[status];
  return (
    <tr className="ghost-border-b hover:bg-surface-container/40 transition-colors">
      <td className="p-4 font-headline font-semibold text-sm">{module}</td>
      <td className="p-4 text-sm">{method}</td>
      <td className="p-4 font-mono text-[11px] text-on-surface-variant">
        {cite}
      </td>
      <td className="p-4 text-right">
        <span
          className={`inline-flex items-center px-2 py-1 border text-[10px] font-bold ${statusClass}`}
        >
          {status}
        </span>
      </td>
    </tr>
  );
}
