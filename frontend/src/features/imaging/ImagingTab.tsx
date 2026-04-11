import { Loader2, Play, Sparkles } from "lucide-react";
import { useState } from "react";
import { PlotlyFigure } from "@/components/PlotlyFigure";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAnalysisJob } from "@/hooks/useAnalysisJob";
import { AnalysisParams } from "./AnalysisParams";
import { FeatureTable } from "./FeatureTable";
import { HeroMetrics } from "./HeroMetrics";
import { JobProgress } from "./JobProgress";
import { LoadImagePanel } from "./LoadImagePanel";

type PendingSource =
  | { kind: "demo"; condition: "control" | "siSDC1" | "heparinase" }
  | { kind: "upload"; file: File }
  | null;

export function ImagingTab() {
  const job = useAnalysisJob();
  const [pending, setPending] = useState<PendingSource>(null);
  const [cellDiameter, setCellDiameter] = useState(80);
  const [includeDeepFeatures, setIncludeDeepFeatures] = useState(false);

  const isRunning = job.isRunning || job.submit.isPending;

  const handleRun = () => {
    if (!pending) return;
    job.submit.mutate({
      ...(pending.kind === "demo"
        ? { demoCondition: pending.condition }
        : { upload: pending.file }),
      cellDiameter,
      includeDeepFeatures,
    });
  };

  // Status badge state derived from job state
  const badgeState: {
    kind: "idle" | "ready" | "running" | "warn" | "error";
    label: string;
  } = (() => {
    if (job.isFailed) return { kind: "error", label: "Failed" };
    if (job.isComplete) return { kind: "ready", label: "Analysis ready" };
    if (isRunning) return { kind: "running", label: "Running" };
    if (pending) return { kind: "idle", label: "Image loaded · click Run" };
    return { kind: "idle", label: "Awaiting input" };
  })();

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
      {/* ------------------------------------------------------------ */}
      {/*                          SIDEBAR                             */}
      {/* ------------------------------------------------------------ */}
      <aside className="space-y-5">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">1 · Load image</CardTitle>
          </CardHeader>
          <CardContent>
            <LoadImagePanel
              onLoadDemo={(condition) => {
                setPending({ kind: "demo", condition });
                job.reset();
              }}
              onLoadUpload={(file) => {
                setPending({ kind: "upload", file });
                job.reset();
              }}
              disabled={isRunning}
            />
            {pending && (
              <div className="mt-3 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs">
                <span className="font-semibold text-primary">Loaded: </span>
                <span className="font-mono text-foreground">
                  {pending.kind === "demo" ? pending.condition : pending.file.name}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">2 · Analysis parameters</CardTitle>
          </CardHeader>
          <CardContent>
            <AnalysisParams
              cellDiameter={cellDiameter}
              includeDeepFeatures={includeDeepFeatures}
              onDiameterChange={setCellDiameter}
              onDeepFeaturesChange={setIncludeDeepFeatures}
              disabled={isRunning}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">3 · Run</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              onClick={handleRun}
              disabled={!pending || isRunning}
              className="w-full"
              size="lg"
            >
              {isRunning ? (
                <>
                  <Loader2 className="animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play />
                  Run Analysis
                </>
              )}
            </Button>
            <div className="flex items-center justify-between">
              <span className="section-label">Status</span>
              <StatusBadge kind={badgeState.kind} label={badgeState.label} />
            </div>
          </CardContent>
        </Card>
      </aside>

      {/* ------------------------------------------------------------ */}
      {/*                         MAIN PANEL                           */}
      {/* ------------------------------------------------------------ */}
      <main className="min-w-0 space-y-6">
        {/* Empty state */}
        {!pending && !job.status && (
          <Card>
            <CardContent className="py-10">
              <div className="flex flex-col items-start gap-3 max-w-2xl">
                <Sparkles className="h-5 w-5 text-primary" />
                <div>
                  <h2 className="text-xl font-semibold text-foreground">
                    Load an image to begin analysis
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Use the sidebar to select one of the bundled demo
                    conditions (
                    <span className="font-mono text-foreground">control</span>,{" "}
                    <span className="font-mono text-foreground">siSDC1</span>,{" "}
                    <span className="font-mono text-foreground">heparinase</span>
                    ) or upload your own 5-channel fluorescence TIFF. Expected
                    channel order: <b>DAPI · WGA-lectin · YAP · paxillin ·
                    phalloidin</b>.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Loaded but not yet run */}
        {pending && !job.status && (
          <Card>
            <CardContent className="py-6">
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-primary animate-pulse-brand" />
                <p className="text-sm font-medium">
                  Image loaded. Click <span className="font-semibold text-primary">Run Analysis</span> in the sidebar to start the pipeline.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Running — show progress card */}
        {job.status && isRunning && <JobProgress status={job.status} />}

        {/* Failed */}
        {job.isFailed && job.status && <JobProgress status={job.status} />}

        {/* Complete — show hero + image + tabs */}
        {job.isComplete && job.result && (
          <>
            <HeroMetrics result={job.result} />

            <Card>
              <CardHeader className="flex-row items-baseline justify-between">
                <CardTitle className="text-sm">Segmented image</CardTitle>
                <span className="font-mono text-[0.72rem] text-muted-foreground">
                  {job.result.cell_count} cells · hover to inspect
                </span>
              </CardHeader>
              <CardContent>
                <PlotlyFigure
                  figureJson={job.result.segmentation_figure_json}
                  height={560}
                />
              </CardContent>
            </Card>

            <Tabs defaultValue="table">
              <TabsList>
                <TabsTrigger value="table">Feature table</TabsTrigger>
                <TabsTrigger value="radial">Radial profile</TabsTrigger>
                <TabsTrigger value="corr">Correlation</TabsTrigger>
              </TabsList>
              <TabsContent value="table">
                <FeatureTable result={job.result} />
              </TabsContent>
              <TabsContent value="radial">
                <Card>
                  <CardContent className="pt-6">
                    <PlotlyFigure
                      figureJson={job.result.radial_profile_figure_json}
                      height={400}
                    />
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="corr">
                <Card>
                  <CardContent className="pt-6">
                    <PlotlyFigure
                      figureJson={job.result.correlation_figure_json}
                      height={500}
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
