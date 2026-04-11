/**
 * RunControlStrip — load + configure + run, collapsed once a result exists.
 *
 * Per UI_SCIENCE_GUIDELINES, the four sub-views (Overview, Single
 * Cell, Compare, Methods & QC) only have meaning once an analysis has
 * produced a result. This strip is the entry point: an expanded
 * three-step flow before the first run, then a single status line
 * with a "Re-run" button afterwards so the result tabs own the
 * vertical real estate.
 */
import { CheckCircle2, Circle, CircleDashed, ImageIcon, Loader2, Play, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { DemoCondition } from "@/lib/api";
import { AnalysisParams } from "./AnalysisParams";
import { LoadImagePanel } from "./LoadImagePanel";

type StepId = "load" | "params" | "run";

export type PendingSource =
  | { kind: "demo"; dataset: DemoCondition }
  | { kind: "upload"; file: File }
  | null;

interface RunControlStripProps {
  pending: PendingSource;
  onPending: (source: PendingSource) => void;
  cellDiameter: number;
  onCellDiameter: (v: number) => void;
  pixelSizeUm: number;
  onPixelSizeUm: (v: number) => void;
  includeDeepFeatures: boolean;
  onIncludeDeepFeatures: (v: boolean) => void;
  isRunning: boolean;
  hasResult: boolean;
  onRun: () => void;
  activeStep: StepId;
  onActiveStep: (step: StepId) => void;
}

export function RunControlStrip(props: RunControlStripProps) {
  const {
    pending,
    onPending,
    cellDiameter,
    onCellDiameter,
    pixelSizeUm,
    onPixelSizeUm,
    includeDeepFeatures,
    onIncludeDeepFeatures,
    isRunning,
    hasResult,
    onRun,
    activeStep,
    onActiveStep,
  } = props;

  // Compact mode: result is on screen, the strip becomes a single
  // status row so the result tabs get the full canvas.
  if (hasResult && !isRunning) {
    return (
      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 py-3">
          <div className="flex items-center gap-2 text-xs">
            <CheckCircle2 className="h-4 w-4 text-foreground" />
            <span className="text-muted-foreground">Loaded</span>
            <span className="font-mono text-foreground">
              {pending?.kind === "demo"
                ? pending.dataset.display_name || pending.dataset.name
                : pending?.kind === "upload"
                  ? pending.file.name
                  : "—"}
            </span>
          </div>
          <span className="text-[0.72rem] text-muted-foreground">·</span>
          <span className="text-[0.72rem] text-muted-foreground">
            cell ⌀ {cellDiameter} px · pixel size {pixelSizeUm.toFixed(3)} µm
            {includeDeepFeatures ? " · DINOv2 on" : ""}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onActiveStep("params")}
            >
              <Settings2 className="h-4 w-4" />
              Adjust
            </Button>
            <Button type="button" size="sm" onClick={onRun} disabled={!pending}>
              <Play className="h-4 w-4" />
              Re-run
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Expanded mode: full three-step flow.
  const stepStates: Record<StepId, "done" | "current" | "upcoming"> = {
    load: pending ? "done" : "current",
    params: pending
      ? activeStep === "params" || activeStep === "run"
        ? "done"
        : "current"
      : "upcoming",
    run: hasResult
      ? "done"
      : pending
        ? "current"
        : "upcoming",
  };

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <StepCard
        stepNumber={1}
        title="Load image"
        icon={ImageIcon}
        state={stepStates.load}
        active={activeStep === "load"}
        onSelect={() => onActiveStep("load")}
      >
        <LoadImagePanel
          onLoadDemo={(dataset) => {
            onPending({ kind: "demo", dataset });
            if (dataset.pixel_size_um != null) {
              onPixelSizeUm(dataset.pixel_size_um);
            }
            onActiveStep("params");
          }}
          onLoadUpload={(file) => {
            onPending({ kind: "upload", file });
            onActiveStep("params");
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
        onSelect={() => onActiveStep("params")}
      >
        <AnalysisParams
          cellDiameter={cellDiameter}
          includeDeepFeatures={includeDeepFeatures}
          pixelSizeUm={pixelSizeUm}
          onDiameterChange={onCellDiameter}
          onDeepFeaturesChange={onIncludeDeepFeatures}
          onPixelSizeChange={onPixelSizeUm}
          disabled={isRunning}
        />
      </StepCard>

      <StepCard
        stepNumber={3}
        title="Run analysis"
        icon={Play}
        state={stepStates.run}
        active={activeStep === "run"}
        onSelect={() => onActiveStep("run")}
      >
        <div className="space-y-4">
          <Button
            onClick={onRun}
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
          <p className="text-[0.72rem] leading-snug text-muted-foreground">
            Segmentation, feature extraction, and optional deep embedding run
            sequentially. Expect approximately six minutes on CPU for the first
            bundled image; subsequent runs on the same input are cached.
          </p>
        </div>
      </StepCard>
    </div>
  );
}

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
