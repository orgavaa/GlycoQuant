import { useMutation } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  CircleDashed,
  ImageIcon,
  Loader2,
  Play,
  Settings2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PlotlyFigure } from "@/components/PlotlyFigure";
import { StatusBadge } from "@/components/StatusBadge";
import { DataProvenanceNotice } from "@/components/SyntheticDataNotice";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAnalysisJob } from "@/hooks/useAnalysisJob";
import { cn } from "@/lib/utils";
import {
  demoPreviewUrl,
  uploadPreview,
  type DemoCondition,
} from "@/lib/api";
import { AnalysisParams } from "./AnalysisParams";
import { FeatureTable } from "./FeatureTable";
import { HeroMetrics } from "./HeroMetrics";
import { JobProgress } from "./JobProgress";
import { LoadImagePanel } from "./LoadImagePanel";

type PendingSource =
  | { kind: "demo"; dataset: DemoCondition }
  | { kind: "upload"; file: File }
  | null;

type StepId = "load" | "params" | "run";

export function ImagingTab() {
  const job = useAnalysisJob();
  const [pending, setPending] = useState<PendingSource>(null);
  const [cellDiameter, setCellDiameter] = useState(80);
  const [includeDeepFeatures, setIncludeDeepFeatures] = useState(false);
  const [activeStep, setActiveStep] = useState<StepId>("load");

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
    });
  };

  const badgeState: {
    kind: "idle" | "ready" | "running" | "warn" | "error";
    label: string;
  } = (() => {
    if (job.isFailed) return { kind: "error", label: "Failed" };
    if (hasResult) return { kind: "ready", label: "Analysis ready" };
    if (isRunning) return { kind: "running", label: "Running" };
    if (pending) return { kind: "idle", label: "Ready to run" };
    return { kind: "idle", label: "Awaiting input" };
  })();

  // Which pipeline steps are complete
  const stepStates: Record<StepId, "done" | "current" | "upcoming"> = useMemo(
    () => {
      const load = pending ? "done" : "current";
      const params: "done" | "current" | "upcoming" = pending
        ? activeStep === "params" || activeStep === "run"
          ? "done"
          : "current"
        : "upcoming";
      const run: "done" | "current" | "upcoming" = hasResult
        ? "done"
        : pending
          ? "current"
          : "upcoming";
      return { load, params, run };
    },
    [pending, hasResult, activeStep],
  );

  // Upload preview is fetched from the backend (TIFFs cannot be
  // rendered by <img>) — the mutation is keyed on the File object so
  // re-selecting the same file replays the request.
  const uploadPreviewMutation = useMutation({
    mutationFn: uploadPreview,
  });

  useEffect(() => {
    if (pending?.kind !== "upload") return;
    uploadPreviewMutation.reset();
    uploadPreviewMutation.mutate(pending.file);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  // Release the blob URL when it's swapped out to avoid a leak.
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

  const isPreviewLoading =
    pending?.kind === "upload" && uploadPreviewMutation.isPending;
  const previewError =
    pending?.kind === "upload" && uploadPreviewMutation.isError
      ? (uploadPreviewMutation.error as Error | undefined)?.message ??
        "Could not load preview."
      : null;

  const bundledDataset = pending?.kind === "demo" ? pending.dataset : null;

  return (
    <div className="space-y-8">
      {/* ------------------------------------------------------------ */}
      {/*           HORIZONTAL PIPELINE STEPPER (3 cards)             */}
      {/* ------------------------------------------------------------ */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StepCard
          stepNumber={1}
          title="Load image"
          icon={ImageIcon}
          state={stepStates.load}
          active={activeStep === "load"}
          onSelect={() => setActiveStep("load")}
        >
          <LoadImagePanel
            onLoadDemo={(dataset) => {
              setPending({ kind: "demo", dataset });
              job.reset();
              setActiveStep("params");
            }}
            onLoadUpload={(file) => {
              setPending({ kind: "upload", file });
              job.reset();
              setActiveStep("params");
            }}
            disabled={isRunning}
          />
          {pending && (
            <div className="mt-4 rounded-md border border-border bg-muted px-3 py-2 text-xs">
              <span className="font-medium text-foreground">Loaded:</span>{" "}
              <span className="text-muted-foreground">
                {pending.kind === "demo"
                  ? pending.dataset.display_name || pending.dataset.name
                  : pending.file.name}
              </span>
            </div>
          )}
        </StepCard>

        <StepCard
          stepNumber={2}
          title="Configure pipeline"
          icon={Settings2}
          state={stepStates.params}
          active={activeStep === "params"}
          onSelect={() => setActiveStep("params")}
        >
          <AnalysisParams
            cellDiameter={cellDiameter}
            includeDeepFeatures={includeDeepFeatures}
            onDiameterChange={setCellDiameter}
            onDeepFeaturesChange={setIncludeDeepFeatures}
            disabled={isRunning}
          />
        </StepCard>

        <StepCard
          stepNumber={3}
          title="Run analysis"
          icon={Play}
          state={stepStates.run}
          active={activeStep === "run"}
          onSelect={() => setActiveStep("run")}
        >
          <div className="space-y-4">
            <Button
              onClick={handleRun}
              disabled={!pending || isRunning}
              className="w-full"
              size="lg"
            >
              {isRunning ? (
                <>
                  <Loader2 className="animate-spin" />
                  Running analysis
                </>
              ) : (
                <>
                  <Play />
                  Start pipeline
                </>
              )}
            </Button>
            <div className="flex items-center justify-between">
              <span className="section-label">Pipeline status</span>
              <StatusBadge kind={badgeState.kind} label={badgeState.label} />
            </div>
            <p className="text-[0.72rem] leading-snug text-muted-foreground">
              Segmentation, feature extraction, and optional deep embedding
              run sequentially. Expect approximately six minutes on CPU for
              the first bundled image; subsequent runs on the same input are
              cached.
            </p>
          </div>
        </StepCard>
      </div>

      {/* ------------------------------------------------------------ */}
      {/*                         MAIN PANEL                           */}
      {/* ------------------------------------------------------------ */}
      <main className="min-w-0 space-y-8">
        {/* Empty state */}
        {!pending && !job.status && (
          <Card className="border-dashed">
            <CardContent className="py-12">
              <div className="flex flex-col items-start gap-3 max-w-2xl">
                <div>
                  <div className="section-label mb-2">Starting point</div>
                  <h2 className="text-[1.15rem] font-semibold leading-snug text-foreground">
                    Select a bundled dataset or upload a five-channel image
                    to begin.
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Three synthetic conditions are bundled for quick
                    inspection: a control, an SDC1 knockdown, and a heparinase
                    treatment. Uploaded TIFFs should follow the canonical
                    channel order DAPI, WGA-lectin, YAP, paxillin, phalloidin.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Loaded: show preview + prompt to run */}
        {pending && !isRunning && !hasResult && (
          <>
            {bundledDataset && (
              <DataProvenanceNotice dataset={bundledDataset} />
            )}
            <Card>
              <CardHeader className="flex flex-row items-baseline justify-between">
                <div className="flex items-center gap-3">
                  <div>
                    <CardTitle className="text-[0.95rem]">
                      Input preview
                    </CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Composite of the DAPI, antibody and reference channels
                      before segmentation.
                    </p>
                  </div>
                  {bundledDataset && (
                    <DataProvenanceNotice
                      dataset={bundledDataset}
                      variant="inline"
                    />
                  )}
                </div>
                <span className="text-[0.72rem] text-muted-foreground">
                  {pending.kind === "demo"
                    ? pending.dataset.display_name || pending.dataset.name
                    : pending.file.name}
                </span>
              </CardHeader>
              <CardContent>
                {isPreviewLoading ? (
                  <div className="flex h-[300px] items-center justify-center gap-3 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Building preview from your upload
                  </div>
                ) : previewError ? (
                  <Alert variant="destructive">
                    <AlertTriangle />
                    <AlertTitle>Could not read this image</AlertTitle>
                    <AlertDescription>{previewError}</AlertDescription>
                  </Alert>
                ) : previewSrc ? (
                  <div className="flex justify-center rounded-md border border-border bg-muted/40 p-4">
                    <img
                      src={previewSrc}
                      alt="Input preview"
                      className="max-h-[520px] w-auto rounded-sm object-contain"
                    />
                  </div>
                ) : (
                  <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
                    Preview unavailable
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {/* Submit error — backend HTTPException before a job is created */}
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

        {/* Running */}
        {job.status && isRunning && <JobProgress status={job.status} />}

        {/* Failed */}
        {job.isFailed && job.status && <JobProgress status={job.status} />}

        {/* Complete: hero metrics + segmented image + tabs */}
        {hasResult && job.result && (
          <>
            {bundledDataset && (
              <DataProvenanceNotice dataset={bundledDataset} />
            )}
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
            <HeroMetrics result={job.result} />

            <Card>
              <CardHeader className="flex flex-row items-baseline justify-between">
                <div className="flex items-center gap-3">
                  <div>
                    <CardTitle className="text-[0.95rem]">
                      Segmented image
                    </CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Cell outlines overlaid on the cytoplasmic channel.
                      Hover for per-cell tooltips.
                    </p>
                  </div>
                  {bundledDataset && (
                    <DataProvenanceNotice
                      dataset={bundledDataset}
                      variant="inline"
                    />
                  )}
                </div>
                <span className="text-[0.72rem] text-muted-foreground">
                  {job.result.cell_count} cells detected
                </span>
              </CardHeader>
              <CardContent>
                <PlotlyFigure
                  figureJson={job.result.segmentation_figure_json}
                  height={560}
                  downloadName="glycoquant_segmented"
                />
              </CardContent>
            </Card>

            <Tabs defaultValue="table">
              <TabsList>
                <TabsTrigger value="table">Feature table</TabsTrigger>
                <TabsTrigger value="radial">Radial profile</TabsTrigger>
                <TabsTrigger value="corr">Correlation</TabsTrigger>
              </TabsList>
              <TabsContent value="table" className="mt-6">
                <FeatureTable result={job.result} />
              </TabsContent>
              <TabsContent value="radial" className="mt-6">
                <Card>
                  <CardContent className="pt-6">
                    <PlotlyFigure
                      figureJson={job.result.radial_profile_figure_json}
                      height={400}
                      downloadName="glycoquant_radial_profile"
                    />
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="corr" className="mt-6">
                <Card>
                  <CardContent className="pt-6">
                    <PlotlyFigure
                      figureJson={job.result.correlation_figure_json}
                      height={500}
                      downloadName="glycoquant_correlation"
                    />
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StepCard — one of the three horizontal pipeline cards at the top of Tab 1
// ---------------------------------------------------------------------------

interface StepCardProps {
  stepNumber: number;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  state: "done" | "current" | "upcoming";
  active: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}

function StepCard({
  stepNumber,
  title,
  icon: Icon,
  state,
  active,
  onSelect,
  children,
}: StepCardProps) {
  const StateIcon =
    state === "done" ? CheckCircle2 : state === "current" ? Circle : CircleDashed;

  return (
    <Card
      className={cn(
        "transition-colors",
        active && "ring-1 ring-foreground/10",
      )}
    >
      <CardHeader
        className="cursor-pointer pb-3"
        onClick={onSelect}
        role="button"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted/60">
            <Icon className="h-4 w-4 text-foreground" />
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="section-label">Step {stepNumber}</span>
            <CardTitle className="text-[0.98rem] leading-tight">
              {title}
            </CardTitle>
          </div>
          <div className="ml-auto shrink-0">
            <StateIcon
              className={cn(
                "h-4 w-4",
                state === "done"
                  ? "text-foreground"
                  : state === "current"
                    ? "text-foreground/60"
                    : "text-muted-foreground/40",
              )}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  );
}
