/**
 * Tab 1 — Imaging Analysis (orchestrator).
 *
 * Per UI_SCIENCE_GUIDELINES, this file is intentionally thin: it owns
 * the run-control state, hosts the four sub-views, and routes data
 * between them. All scientific layout lives in
 * `views/{Overview,SingleCell,Compare,MethodsQC}View.tsx`.
 *
 * Sub-views (fixed order):
 *   1. Overview      — hero screen, image-dominant 12-col grid
 *   2. Single Cell   — drill into one selected cell
 *   3. Condition     — perturbation comparison (Phase 2)
 *   4. Methods & QC  — provenance + diagnostics
 */
import { useMutation } from "@tanstack/react-query";
import {
  AlertTriangle,
  BarChart3,
  Beaker,
  Layers,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAnalysisJob } from "@/hooks/useAnalysisJob";
import { uploadPreview, demoPreviewUrl } from "@/lib/api";
import { JobProgress } from "./JobProgress";
import { RunControlStrip, type PendingSource } from "./RunControlStrip";
import { CompareView } from "./views/CompareView";
import { MethodsQCView } from "./views/MethodsQCView";
import { OverviewView } from "./views/OverviewView";
import { SingleCellView } from "./views/SingleCellView";

export function ImagingTab() {
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

  return (
    <div className="space-y-6">
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

      {/* Empty state — onboarding prompt with the one-sentence pitch */}
      {!pending && !job.status && (
        <Card className="border-dashed">
          <CardContent className="py-10">
            <div className="max-w-2xl space-y-3">
              <p className="section-label">From the same image…</p>
              <h2 className="text-[1.15rem] font-semibold leading-snug text-foreground">
                We quantify glycocalyx state, mechanotransduction state, and
                their coupling — at single-cell resolution.
              </h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Pick a bundled HPA dataset above or upload a five-channel TIFF
                in the canonical order DAPI · WGA-lectin · YAP · paxillin ·
                phalloidin to begin.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pre-run preview */}
      {pending && !isRunning && !hasResult && (
        <Card>
          <CardHeader className="flex flex-row items-baseline justify-between">
            <div>
              <CardTitle className="text-[0.95rem]">Input preview</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Composite of the DAPI, antibody and reference channels before
                segmentation.
              </p>
            </div>
            <span className="text-[0.72rem] text-muted-foreground">
              {datasetLabel}
            </span>
          </CardHeader>
          <CardContent>
            {uploadPreviewMutation.isPending ? (
              <div className="flex h-[300px] items-center justify-center gap-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Building preview from your upload
              </div>
            ) : uploadPreviewMutation.isError ? (
              <Alert variant="destructive">
                <AlertTriangle />
                <AlertTitle>Could not read this image</AlertTitle>
                <AlertDescription>
                  {(uploadPreviewMutation.error as Error | undefined)?.message ??
                    "Could not load preview."}
                </AlertDescription>
              </Alert>
            ) : previewSrc ? (
              <div className="flex justify-center rounded-md border border-border bg-muted/40 p-4">
                <img
                  src={previewSrc}
                  alt="Input preview"
                  className="max-h-[420px] w-auto rounded-sm object-contain"
                />
              </div>
            ) : (
              <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
                Preview unavailable
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Submit error */}
      {job.submit.isError && !isRunning && !hasResult && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Pipeline could not start</AlertTitle>
          <AlertDescription>
            {(job.submit.error as Error | undefined)?.message ??
              "Unknown error from the backend."}
          </AlertDescription>
        </Alert>
      )}

      {/* Running / failed states show progress */}
      {job.status && (isRunning || job.isFailed) && (
        <JobProgress status={job.status} />
      )}

      {/* Result state — the four sub-views */}
      {hasResult && job.result && (
        <>
          {job.result.warnings && job.result.warnings.length > 0 && (
            <Alert variant="warning">
              <AlertTriangle />
              <AlertTitle>Partial analysis</AlertTitle>
              <AlertDescription>
                <ul className="list-disc space-y-1 pl-4">
                  {job.result.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <Tabs defaultValue="overview" className="space-y-6">
            <TabsList>
              <TabsTrigger value="overview" className="gap-2">
                <Layers className="h-3.5 w-3.5" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="single" className="gap-2">
                <BarChart3 className="h-3.5 w-3.5" />
                Single Cell
              </TabsTrigger>
              <TabsTrigger value="compare" className="gap-2">
                <Beaker className="h-3.5 w-3.5" />
                Condition Compare
              </TabsTrigger>
              <TabsTrigger value="methods" className="gap-2">
                <ShieldCheck className="h-3.5 w-3.5" />
                Methods &amp; QC
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              <OverviewView
                result={job.result}
                datasetLabel={datasetLabel}
              />
            </TabsContent>

            <TabsContent value="single" className="space-y-6">
              <SingleCellView result={job.result} />
            </TabsContent>

            <TabsContent value="compare" className="space-y-6">
              <CompareView />
            </TabsContent>

            <TabsContent value="methods" className="space-y-6">
              <MethodsQCView
                result={job.result}
                pixelSizeUm={pixelSizeUm}
                cellDiameter={cellDiameter}
                includeDeepFeatures={includeDeepFeatures}
                datasetLabel={datasetLabel}
              />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
