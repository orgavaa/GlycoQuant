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
    <div className="mx-auto max-w-2xl px-8 py-16">
      <div className="bg-surface-container-lowest p-8 ghost-border space-y-6">
        <div>
          <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
            Single-cell mechanobiology pipeline
          </p>
          <h2 className="mt-2 text-[1.5rem] font-headline font-semibold leading-tight tracking-tighter text-on-surface">
            Per-cell quantification of glycocalyx organisation and
            mechanotransduction state from a five-channel confocal image,
            and the cross-block correlation that links the two.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-on-surface-variant">
            Cellpose-SAM segments each cell and its nucleus. Twelve
            glycocalyx descriptors are extracted from the pericellular WGA
            ring, and the mechanotransduction panel reports size-corrected
            YAP N/C (Jones&nbsp;2024), focal-adhesion maturation classes
            (Buskermolen&nbsp;2018), actin coherence and nuclear morphology.
            PC1 over the curated mechano panel yields a per-cell composite
            score; a Spearman cross-block matrix tests their coupling.
          </p>
        </div>

        <LoadImagePanel
          onLoadDemo={(dataset) => onPending({ kind: "demo", dataset })}
          onLoadUpload={(file) => onPending({ kind: "upload", file })}
          disabled={isRunning}
        />

        {pending && (
          <>
            {previewSrc && (
              <div className="bg-inverse-surface p-3 flex justify-center">
                <img
                  src={previewSrc}
                  alt="Input preview"
                  className="max-h-[260px] w-auto object-contain"
                />
              </div>
            )}

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
          </>
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
      </div>
    </div>
  );
}
