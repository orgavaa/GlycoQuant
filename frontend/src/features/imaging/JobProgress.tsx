import { AlertCircle, CheckCircle2, Clock, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Progress } from "@/components/ui/progress";
import type { JobPhase, JobStatusResponse } from "@/lib/api";

const PHASE_LABEL: Record<JobPhase, string> = {
  idle: "Queued",
  segmenting: "Segmenting with Cellpose-SAM",
  extracting: "Extracting 26 interpretable features",
  embedding: "Computing DINOv2 deep embeddings",
  done: "Analysis complete",
};

// Expected CPU wall-clock budget per phase on a 768x768 HPA crop.
// These are honest estimates, not model-reported timings — Cellpose-SAM
// makes blocking native calls with no internal progress callbacks, so
// we interpolate visually using the elapsed-time field below.
const PHASE_EXPECTED_SECONDS: Record<JobPhase, number> = {
  idle: 0,
  segmenting: 300, // ~5 min on CPU for 2 Cellpose-SAM passes
  extracting: 10, // pure Python / skimage
  embedding: 60, // only if DINOv2 is enabled
  done: 0,
};

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

interface JobProgressProps {
  status: JobStatusResponse;
}

export function JobProgress({ status }: JobProgressProps) {
  const pct = status.progress.pct;
  const message = status.progress.message;
  const phase = status.progress.phase;
  const phaseLabel = PHASE_LABEL[phase] ?? "Running";

  const isTerminal = status.status === "complete" || status.status === "failed";

  // Live elapsed-seconds counter that ticks once per second, derived
  // from the job's created_at timestamp so it survives component
  // remounts and polling intervals.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (isTerminal) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [isTerminal]);

  const startMs = status.created_at ? Date.parse(status.created_at) : now;
  const elapsedSec = Math.max(0, Math.floor((now - startMs) / 1000));

  // Phase budget — shown as "X s of Y s budget" so the user knows
  // whether we're still within the expected window.
  const budget = PHASE_EXPECTED_SECONDS[phase] ?? 0;
  const overBudget = budget > 0 && elapsedSec > budget * 1.5;

  const Icon =
    status.status === "complete"
      ? CheckCircle2
      : status.status === "failed"
        ? AlertCircle
        : Loader2;
  const iconColor =
    status.status === "complete"
      ? "text-[hsl(var(--success))]"
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
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <div className="font-mono text-xs font-medium tabular-nums text-muted-foreground">
            {pct}%
          </div>
        </div>
      </div>
      <Progress value={pct} />

      {/* Elapsed-time strip — the honest "something is happening" indicator */}
      {!isTerminal && (
        <div className="flex items-center gap-3 pt-1 text-[0.72rem] text-muted-foreground">
          <Clock className="h-3 w-3 shrink-0" />
          <span className="font-mono tabular-nums">
            elapsed {formatDuration(elapsedSec)}
          </span>
          {budget > 0 && (
            <span className="font-mono tabular-nums">
              of ~{formatDuration(budget)} budget
            </span>
          )}
          {overBudget && (
            <span className="ml-auto text-[hsl(var(--warning))]">
              Slower than expected; Cellpose-SAM on CPU can vary with cell
              density.
            </span>
          )}
        </div>
      )}

      {!isTerminal && phase === "segmenting" && (
        <p className="text-[0.7rem] leading-snug text-muted-foreground">
          Cellpose-SAM runs as a single blocking native call per mask, so
          the progress bar does not advance inside this phase. Expect
          roughly five minutes per image on CPU, a few seconds on GPU.
        </p>
      )}

      {status.status === "failed" && status.error && (
        <div className="mt-2 rounded-md bg-destructive/5 p-2 font-mono text-[0.68rem] text-destructive">
          {status.error.split("\n")[0]}
        </div>
      )}
    </div>
  );
}
