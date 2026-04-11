import { AlertCircle, CheckCircle2, Clock, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Progress } from "@/components/ui/progress";
import type { JobPhase, JobStatusResponse } from "@/lib/api";

const PHASE_LABEL: Record<JobPhase, string> = {
  idle: "Queued",
  segmenting: "Detecting cells and nuclei",
  extracting: "Measuring per-cell features",
  embedding: "Computing visual embeddings",
  done: "Analysis complete",
};

const PHASE_EXPECTED_SECONDS: Record<JobPhase, number> = {
  idle: 0,
  segmenting: 540,
  extracting: 10,
  embedding: 60,
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
              Taking longer than usual. Dense or large images can push the
              runtime up.
            </span>
          )}
        </div>
      )}

      {!isTerminal && phase === "segmenting" && (
        <p className="text-[0.7rem] leading-snug text-muted-foreground">
          Outlining every cell and its nucleus from the raw image. This is
          the slowest step — plan on several minutes per image on a CPU
          server, or a few seconds on a GPU.
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
