/**
 * Tab 1 — Imaging Analysis (orchestrator).
 *
 * Per UI_SCIENCE_GUIDELINES + Stitch redesign, this file is intentionally
 * thin: it owns the run-control state, hosts the four sub-views, and
 * routes data between them. The active sub-view comes from App-level
 * state via the ``view`` prop so the AppHeader top-nav links control
 * which view renders here.
 *
 * Sub-views (fixed order):
 *   1. Overview      — hero screen, image-dominant 12-col grid
 *   2. Single Cell   — drill into one selected cell
 *   3. Condition     — perturbation comparison (Phase 2)
 *   4. Methods & QC  — provenance + diagnostics
 */
import { useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useAnalysisJob } from "@/hooks/useAnalysisJob";
import { uploadPreview, demoPreviewUrl } from "@/lib/api";
import { JobProgress } from "./JobProgress";
import { RunControlStrip, type PendingSource } from "./RunControlStrip";
import { CompareView } from "./views/CompareView";
import { MethodsQCView } from "./views/MethodsQCView";
import { OverviewView } from "./views/OverviewView";
import { SingleCellView } from "./views/SingleCellView";

export type ImagingSubView = "overview" | "single" | "compare" | "methods";

interface ImagingTabProps {
  view: ImagingSubView;
}

export function ImagingTab({ view }: ImagingTabProps) {
  const job = useAnalysisJob();
  const [pending, setPending] = useState<PendingSource>(null);
  const [cellDiameter, setCellDiameter] = useState(80);
  const [includeDeepFeatures, setIncludeDeepFeatures] = useState(false);
  const [pixelSizeUm, setPixelSizeUm] = useState(0.325);
  const [activeStep, setActiveStep] = useState<"load" | "params" | "run">(
    "load",
  );

  const isRunning = job.isRunning || job.submit.isPending;
  const hasResult = job.isComplete && !!job.result;

  const handleRun = () => {
    if (!pending) return;
    job.submit.mutate({
      ...(pending.kind === "demo"
        ? { demoCondition: pending.dataset.name }
        : { upload: pending.file }),
      cellDiameter,
      includeDeepFeatures,
      pixelSizeUm,
    });
  };

  // Upload preview for the empty-state header (TIFF cannot be rendered
  // by <img> directly).
  const uploadPreviewMutation = useMutation({ mutationFn: uploadPreview });
  useEffect(() => {
    if (pending?.kind !== "upload") return;
    uploadPreviewMutation.reset();
    uploadPreviewMutation.mutate(pending.file);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);
  useEffect(() => {
    const url = uploadPreviewMutation.data;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [uploadPreviewMutation.data]);

  const previewSrc = useMemo(() => {
    if (!pending) return null;
    if (pending.kind === "demo") return demoPreviewUrl(pending.dataset.name);
    return uploadPreviewMutation.data ?? null;
  }, [pending, uploadPreviewMutation.data]);

  const datasetLabel =
    pending?.kind === "demo"
      ? pending.dataset.display_name || pending.dataset.name
      : pending?.kind === "upload"
        ? pending.file.name
        : null;

  // -------------------------------------------------------------------
  // Empty / pre-run state — full-width onboarding flow occupies the
  // canvas. The Stitch sub-view layouts only kick in once a result is
  // available; before that, the user needs the load + configure + run
  // affordances front and centre.
  // -------------------------------------------------------------------
  if (!hasResult) {
    return (
      <div className="mx-auto max-w-[1400px] px-8 py-8 space-y-8">
        <RunControlStrip
          pending={pending}
          onPending={(p) => {
            setPending(p);
            job.reset();
          }}
          cellDiameter={cellDiameter}
          onCellDiameter={setCellDiameter}
          pixelSizeUm={pixelSizeUm}
          onPixelSizeUm={setPixelSizeUm}
          includeDeepFeatures={includeDeepFeatures}
          onIncludeDeepFeatures={setIncludeDeepFeatures}
          isRunning={isRunning}
          hasResult={hasResult}
          onRun={handleRun}
          activeStep={activeStep}
          onActiveStep={setActiveStep}
        />

        {/* Onboarding card — Stitch editorial copy, no marketing hype */}
        {!pending && !job.status && (
          <div className="bg-surface-container-lowest p-8 ghost-border max-w-3xl space-y-4">
            <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
              Single-cell mechanobiology pipeline
            </p>
            <h2 className="text-[1.5rem] font-headline font-semibold leading-tight tracking-tight text-on-surface">
              Per-cell quantification of glycocalyx organisation and
              mechanotransduction state from a five-channel confocal image,
              and the cross-block correlation that links the two.
            </h2>
            <p className="text-sm leading-relaxed text-on-surface-variant">
              Cellpose-SAM segments each cell and its nucleus. Twelve
              glycocalyx descriptors are extracted from the pericellular
              WGA ring (mean intensity, coverage, Shannon entropy, Haralick
              texture, Moran&apos;s I), and the mechanotransduction panel
              reports size-corrected YAP nuclear/cytoplasmic ratio
              (Jones&nbsp;2024), focal-adhesion maturation classes
              (Buskermolen&nbsp;2018), actin stress-fibre coherence and
              nuclear morphology. PC1 over the curated mechano panel yields
              a per-cell composite score; a rectangular Spearman matrix
              between the glycocalyx and mechanotransduction blocks then
              tests their coupling at single-cell resolution — a
              measurement no published study has reported.
            </p>
            <p className="text-xs leading-snug text-on-surface-variant">
              Required input: a five-channel image stack in the canonical
              order DAPI · WGA-lectin · YAP · paxillin · phalloidin
              (multi-page TIFF, OME-TIFF, or PNG). The bundled BBBC022
              Cell Painting field above lets you exercise the pipeline
              end-to-end against real WGA-lectin signal without uploading
              anything.
            </p>
          </div>
        )}

        {/* Pre-run preview */}
        {pending && !isRunning && !hasResult && (
          <div className="bg-surface-container-lowest p-6 ghost-border">
            <div className="flex items-baseline justify-between mb-4">
              <div>
                <h3 className="text-sm font-headline font-semibold text-on-surface uppercase tracking-tight">
                  Input preview
                </h3>
                <p className="mt-1 text-xs text-on-surface-variant">
                  Composite of the DAPI, antibody and reference channels
                  before segmentation.
                </p>
              </div>
              <span className="text-[10px] text-on-surface-variant uppercase tracking-widest">
                {datasetLabel}
              </span>
            </div>
            {uploadPreviewMutation.isPending ? (
              <div className="flex h-[300px] items-center justify-center text-sm text-on-surface-variant">
                <span className="material-symbols-outlined animate-spin mr-2">
                  progress_activity
                </span>
                Building preview from your upload
              </div>
            ) : uploadPreviewMutation.isError ? (
              <div className="ghost-border bg-error-container/20 p-4 text-sm text-on-error-container">
                <strong className="block text-xs uppercase tracking-widest mb-1">
                  Could not read this image
                </strong>
                {(uploadPreviewMutation.error as Error | undefined)?.message ??
                  "Unknown error"}
              </div>
            ) : previewSrc ? (
              <div className="flex justify-center bg-inverse-surface p-4">
                <img
                  src={previewSrc}
                  alt="Input preview"
                  className="max-h-[420px] w-auto object-contain"
                />
              </div>
            ) : (
              <div className="flex h-[300px] items-center justify-center text-sm text-on-surface-variant">
                Preview unavailable
              </div>
            )}
          </div>
        )}

        {/* Submit error */}
        {job.submit.isError && !isRunning && (
          <div className="ghost-border bg-error-container/20 p-4">
            <strong className="block text-[11px] uppercase tracking-widest text-on-error-container mb-1">
              Pipeline could not start
            </strong>
            <p className="text-sm text-on-error-container">
              {(job.submit.error as Error | undefined)?.message ??
                "Unknown error from the backend."}
            </p>
          </div>
        )}

        {/* Running */}
        {job.status && (isRunning || job.isFailed) && (
          <JobProgress status={job.status} />
        )}
      </div>
    );
  }

  // -------------------------------------------------------------------
  // Result state — render the appropriate Stitch sub-view. Each view
  // owns its own internal layout (12-col asymmetric grid, dark image
  // canvas + dossier, etc.). The orchestrator just dispatches.
  // -------------------------------------------------------------------
  if (!job.result) return null;

  if (view === "overview") {
    return (
      <OverviewView result={job.result} datasetLabel={datasetLabel} />
    );
  }
  if (view === "single") {
    return <SingleCellView result={job.result} />;
  }
  if (view === "compare") {
    return <CompareView />;
  }
  if (view === "methods") {
    return (
      <MethodsQCView
        result={job.result}
        pixelSizeUm={pixelSizeUm}
        cellDiameter={cellDiameter}
        includeDeepFeatures={includeDeepFeatures}
        datasetLabel={datasetLabel}
      />
    );
  }
  return null;
}
