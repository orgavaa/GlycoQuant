/**
 * Methods & QC — the trust screen.
 *
 * Per UI_SCIENCE_GUIDELINES §6, every number on the other tabs must
 * be traceable to a method via at most two clicks. This view is
 * those clicks: segmentation parameters, pixel-size source, exclusion
 * rules, the YAP size-correction diagnostic, and the mechano-score
 * loadings table.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  const loadings = summary?.loadings ?? {};
  const sortedLoadings = Object.entries(loadings).sort(
    ([, a], [, b]) => Math.abs(b) - Math.abs(a),
  );

  return (
    <div className="space-y-6">
      {/* Run provenance — segmentation, pixel size, deep features */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-[0.95rem]">Run provenance</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Every parameter that shaped this analysis. The segmentation model
            and pixel size in particular drive every µm-denominated metric on
            the other tabs.
          </p>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <ProvenanceRow label="Dataset" value={datasetLabel ?? "uploaded image"} />
            <ProvenanceRow
              label="Image hash"
              value={
                <span className="font-mono text-[0.72rem]">
                  {result.image_hash.slice(0, 16)}…
                </span>
              }
            />
            <ProvenanceRow
              label="Segmentation model"
              value="Cellpose-SAM (cpsam)"
              note="Pachitariu, Rariden & Stringer 2025, bioRxiv"
            />
            <ProvenanceRow
              label="Cell diameter prior"
              value={`${cellDiameter} px`}
            />
            <ProvenanceRow
              label="Pixel size"
              value={`${pixelSizeUm.toFixed(3)} µm/px`}
              note="Drives FA maturation bins (Buskermolen 2018)"
            />
            <ProvenanceRow
              label="Deep embedding backbone"
              value={
                !includeDeepFeatures
                  ? "skipped"
                  : result.deep_embedding_backend ===
                      "cell_dino_channel_adaptive"
                    ? "Cell-DINO ViT-L/16 (channel-adaptive)"
                    : result.deep_embedding_backend === "dinov2_base"
                      ? "DINOv2-base (natural-image)"
                      : "computed"
              }
              note={
                !includeDeepFeatures
                  ? undefined
                  : result.deep_embedding_backend ===
                      "cell_dino_channel_adaptive"
                    ? "5×1024 = 5120 dim per cell · FAIR Non-Commercial Research License"
                    : result.deep_embedding_backend === "dinov2_base"
                      ? "768 dim per cell · facebook/dinov2-base · Apache 2.0"
                      : undefined
              }
            />
            <ProvenanceRow
              label="Cells detected"
              value={String(result.cell_count)}
            />
            <ProvenanceRow
              label="Has deep features"
              value={result.has_deep_features ? "yes" : "no"}
            />
          </dl>
          {result.warnings && result.warnings.length > 0 && (
            <div className="mt-4 rounded-md border border-amber-500/50 bg-amber-500/10 p-3">
              <p className="text-[0.72rem] uppercase tracking-wide text-amber-700 dark:text-amber-300">
                Channel warnings
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-foreground">
                {result.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* YAP size correction diagnostic */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-[0.95rem]">
            YAP size-correction diagnostic
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Jones <em>et al.</em> 2024 (<em>Mol. Omics</em> 20:554) showed
            whole-cell YAP concentration drops 4–8× with cell area. Without
            correction, the raw N/C ratio entangles spreading area with
            mechanotransduction state. We regress raw N/C on{" "}
            <span className="font-mono">cell_area</span> and store the
            residuals.
          </p>
        </CardHeader>
        <CardContent>
          <YapDiagnostic result={result} />
        </CardContent>
      </Card>

      {/* Mechano score loadings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-[0.95rem]">
            Mechano score loadings
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            How each feature contributes to the per-cell composite score. PC1
            sign-aligned to{" "}
            <span className="font-mono">yap_nc_ratio_size_corrected</span> so a
            positive score is biologically interpretable as "more activated".
          </p>
        </CardHeader>
        <CardContent>
          {summary == null ? (
            <p className="text-xs text-muted-foreground">
              No mechano score summary available for this job.
            </p>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-3 text-xs">
                <span className="rounded border border-border bg-muted px-2 py-1 font-mono">
                  mode = {summary.mode}
                </span>
                <span className="rounded border border-border bg-muted px-2 py-1 font-mono">
                  n_cells = {summary.n_cells_used}
                </span>
                <span className="rounded border border-border bg-muted px-2 py-1 font-mono">
                  n_features = {summary.n_features_used}
                </span>
                <span className="rounded border border-border bg-muted px-2 py-1 font-mono">
                  PC1 var = {(summary.pc1_variance_explained * 100).toFixed(0)}%
                </span>
              </div>
              <div className="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
                {sortedLoadings.map(([feat, w]) => (
                  <div
                    key={feat}
                    className="flex items-center justify-between rounded border border-border bg-muted/40 px-3 py-1.5"
                  >
                    <span className="font-mono text-foreground">{feat}</span>
                    <span className="font-mono text-foreground">
                      {w >= 0 ? "+" : ""}
                      {w.toFixed(3)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function YapDiagnostic({ result }: { result: JobResult }) {
  // Read slope/r² from the per-cell DataFrame — they're broadcast to
  // every row by mechano_score.apply_yap_size_correction.
  let slope: number | null = null;
  let r2: number | null = null;
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
  } catch {
    // ignore
  }
  const fellBack = slope == null;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <ProvenanceRow
          label="Regression slope"
          value={fmt(slope, 5)}
          note="N/C ratio per pixel² of cell area"
        />
        <ProvenanceRow label="R²" value={fmt(r2, 3)} />
      </div>
      {fellBack && (
        <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-xs">
          Size correction fell back: fewer than 30 cells with finite (raw N/C,
          cell_area) values were available. The corrected column is a copy of
          the raw column for this run.
        </div>
      )}
    </div>
  );
}

function ProvenanceRow({
  label,
  value,
  note,
}: {
  label: string;
  value: React.ReactNode;
  note?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md border border-border bg-muted/40 p-3">
      <dt className="text-[0.7rem] uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="text-sm font-medium text-foreground">{value}</dd>
      {note && (
        <p className="text-[0.7rem] leading-snug text-muted-foreground">
          {note}
        </p>
      )}
    </div>
  );
}
