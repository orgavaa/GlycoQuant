import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type { JobPhase, JobStatusResponse } from "@/lib/api";

const PHASE_LABEL: Record<JobPhase, string> = {
  idle: "Queued",
  segmenting: "Segmenting with Cellpose-SAM",
  extracting: "Extracting 26 interpretable features",
  embedding: "Computing DINOv2 deep embeddings",
  done: "Analysis complete",
};

interface JobProgressProps {
  status: JobStatusResponse;
}

export function JobProgress({ status }: JobProgressProps) {
  const pct = status.progress.pct;
  const message = status.progress.message;
  const phaseLabel = PHASE_LABEL[status.progress.phase] ?? "Running";

  const isTerminal = status.status === "complete" || status.status === "failed";
  const Icon = status.status === "complete"
    ? CheckCircle2
    : status.status === "failed"
      ? AlertCircle
      : Loader2;
  const iconColor = status.status === "complete"
    ? "text-[hsl(var(--brand))]"
    : status.status === "failed"
      ? "text-destructive"
      : "text-primary";

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <Icon
          className={`h-5 w-5 shrink-0 ${iconColor} ${!isTerminal && "animate-spin"}`}
        />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-foreground">
            {phaseLabel}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {message}
          </div>
        </div>
        <div className="shrink-0 font-mono text-xs font-medium tabular-nums text-muted-foreground">
          {pct}%
        </div>
      </div>
      <Progress value={pct} />
      {status.status === "failed" && status.error && (
        <div className="mt-2 rounded-md bg-destructive/5 p-2 font-mono text-[0.68rem] text-destructive">
          {status.error.split("\n")[0]}
        </div>
      )}
    </div>
  );
}
