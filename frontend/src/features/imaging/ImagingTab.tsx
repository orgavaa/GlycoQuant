/**
 * Tab 1 — Imaging Analysis (orchestrator).
 *
 * Stitch-1:1 rewrite. Two responsibilities only:
 *
 *   1. Empty state — when no JobResult is loaded, render a compact
 *      loader card (LoadImagePanel + diameter + pixel size + start
 *      button + progress strip). The Stitch four-screen UI never shows
 *      this card; it appears only as the pre-result onboarding surface.
 *
 *   2. View dispatch — once a JobResult is available, route to the
 *      Stitch view component matching the App-level `view` prop.
 *      Each view file is a literal port of the corresponding
 *      `stitch/{view}/code.html` `<main>` block.
 *
 * The shell (top nav, right sidebar) is rendered once globally by
 * App.tsx and does not appear here.
 */
import { useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAnalysisJob } from "@/hooks/useAnalysisJob";
import { demoPreviewUrl, uploadPreview, type DemoCondition } from "@/lib/api";
import { LoadImagePanel } from "./LoadImagePanel";
import { CompareView } from "./views/CompareView";
import { MethodsQCView } from "./views/MethodsQCView";
import { OverviewView } from "./views/OverviewView";
import { SingleCellView } from "./views/SingleCellView";

export type ImagingSubView = "overview" | "single" | "compare" | "methods";

interface ImagingTabProps {
  view: ImagingSubView;
}

type PendingSource =
  | { kind: "demo"; dataset: DemoCondition }
  | { kind: "upload"; file: File }
  | null;

export function ImagingTab({ view }: ImagingTabProps) {
  const job = useAnalysisJob();
  const [pending, setPending] = useState<PendingSource>(null);
  const [cellDiameter, setCellDiameter] = useState(80);
  const [pixelSizeUm, setPixelSizeUm] = useState(0.656); // BBBC022 default
  const [includeDeepFeatures] = useState(false);

  const isRunning = job.isRunning || job.submit.isPending;
  const hasResult = job.isComplete && !!job.result;

  const datasetLabel =
    pending?.kind === "demo"
      ? pending.dataset.display_name || pending.dataset.name
      : pending?.kind === "upload"
        ? pending.file.name
        : null;

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

  // Result state — dispatch to the matching Stitch view.
  if (hasResult && job.result) {
    if (view === "overview") {
      return <OverviewView result={job.result} datasetLabel={datasetLabel} />;
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

  // Empty state — compact loader card centred in the canvas.
  return (
    <EmptyStateLoader
      pending={pending}
      onPending={(p) => {
        setPending(p);
        if (p?.kind === "demo" && p.dataset.pixel_size_um != null) {
          setPixelSizeUm(p.dataset.pixel_size_um);
        }
        job.reset();
      }}
      cellDiameter={cellDiameter}
      onCellDiameter={setCellDiameter}
      pixelSizeUm={pixelSizeUm}
      onPixelSizeUm={setPixelSizeUm}
      isRunning={isRunning}
      onRun={handleRun}
      progress={job.progress}
      submitError={(job.submit.error as Error | undefined)?.message ?? null}
    />
  );
}

// ---------------------------------------------------------------------
// Empty-state loader — Stitch never shows this. It's our compact
// onboarding surface that appears only before the first JobResult.
// ---------------------------------------------------------------------

interface EmptyStateLoaderProps {
  pending: PendingSource;
  onPending: (p: PendingSource) => void;
  cellDiameter: number;
  onCellDiameter: (v: number) => void;
  pixelSizeUm: number;
  onPixelSizeUm: (v: number) => void;
  isRunning: boolean;
  onRun: () => void;
  progress: { phase: string; pct: number; message: string } | null;
  submitError: string | null;
}

function EmptyStateLoader({
  pending,
  onPending,
  cellDiameter,
  onCellDiameter,
  pixelSizeUm,
  onPixelSizeUm,
  isRunning,
  onRun,
  progress,
  submitError,
}: EmptyStateLoaderProps) {
  // Upload preview for the empty-state header (TIFF cannot render in <img>).
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

  return (
    <div className="grid grid-cols-12 gap-0 min-h-[calc(100vh-3.5rem)]">
      {/* Left: image preview canvas (matches the Overview dark pane) */}
      <section className="col-span-7 relative h-[calc(100vh-3.5rem)] bg-inverse-surface overflow-hidden flex items-center justify-center">
        {previewSrc ? (
          <img
            src={previewSrc}
            alt="Input preview"
            className="w-full h-full object-contain opacity-90"
          />
        ) : (
          <div className="flex flex-col items-center gap-4 text-white/30">
            <span className="material-symbols-outlined text-[48px]">
              microscope
            </span>
            <p className="text-[10px] uppercase tracking-[0.2em]">
              Load an image to begin
            </p>
          </div>
        )}
      </section>

      {/* Right: controls panel */}
      <section className="col-span-5 bg-surface-container-low p-8 overflow-y-auto h-[calc(100vh-3.5rem)] flex flex-col gap-8">
        <div>
          <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
            Image analysis
          </p>
          <h2 className="mt-3 text-[1.4rem] font-headline font-semibold leading-snug tracking-tighter text-on-surface">
            Quantify how glycocalyx conformation relates to
            mechanotransduction — one cell at a time.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-on-surface-variant">
            Upload a multi-channel fluorescence image (DAPI, WGA-lectin,
            YAP, paxillin, phalloidin) and the pipeline segments every
            cell, extracts glycocalyx spatial features from the lectin
            channel, measures size-corrected YAP nuclear/cytoplasmic ratio,
            classifies focal adhesion maturation state, and quantifies
            actin stress fibre alignment. Per-cell features are combined
            into a composite mechanotransduction score and correlated with
            glycocalyx metrics to map the coupling between surface coat
            structure and mechanical signalling at single-cell resolution.
          </p>
        </div>

        <LoadImagePanel
          onLoadDemo={(dataset) => onPending({ kind: "demo", dataset })}
          onLoadUpload={(file) => onPending({ kind: "upload", file })}
          disabled={isRunning}
        />

        {pending && (
          <div className="space-y-6 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label
                  htmlFor="cell-diameter"
                  className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant"
                >
                  Cell diameter (px)
                </Label>
                <Input
                  id="cell-diameter"
                  type="number"
                  min={10}
                  max={300}
                  step={5}
                  value={cellDiameter}
                  onChange={(e) => onCellDiameter(Number(e.target.value))}
                  disabled={isRunning}
                />
              </div>
              <div className="space-y-1.5">
                <Label
                  htmlFor="pixel-size"
                  className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant"
                >
                  Pixel size (µm)
                </Label>
                <Input
                  id="pixel-size"
                  type="number"
                  min={0.05}
                  max={2.0}
                  step={0.005}
                  value={pixelSizeUm}
                  onChange={(e) => onPixelSizeUm(Number(e.target.value))}
                  disabled={isRunning}
                />
              </div>
            </div>

            <Button
              onClick={onRun}
              disabled={!pending || isRunning}
              className="w-full bg-primary text-on-primary uppercase tracking-widest text-[11px] font-bold py-3 hover:opacity-90"
              size="lg"
            >
              {isRunning ? (
                <>
                  <span className="material-symbols-outlined animate-spin mr-2 text-[16px]">
                    progress_activity
                  </span>
                  Running analysis
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined mr-2 text-[16px]">
                    play_arrow
                  </span>
                  Start pipeline
                </>
              )}
            </Button>
          </div>
        )}

        {progress && isRunning && (
          <div className="space-y-2">
            <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
              <span>{progress.phase}</span>
              <span className="tabular-nums">{progress.pct}%</span>
            </div>
            <div className="h-1 bg-surface-container-highest overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${progress.pct}%` }}
              />
            </div>
            <p className="text-xs text-on-surface-variant">{progress.message}</p>
          </div>
        )}

        {submitError && (
          <div className="ghost-border bg-error-container/20 p-4">
            <strong className="block text-[10px] uppercase tracking-widest text-on-error-container mb-1">
              Pipeline could not start
            </strong>
            <p className="text-sm text-on-error-container">{submitError}</p>
          </div>
        )}
      </section>
    </div>
  );
}
