import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  fetchGeneformerStatus,
  generateGeneformer,
  type GeneformerStatusResponse,
} from "@/lib/api";

/**
 * Card that replaces the "pathway-only" warning when the backend
 * reports ``can_generate_geneformer=true``. Clicking the button
 * spawns a Modal Geneformer run and polls until it lands — a Tab-2
 * sibling of Tab 1's progress card, reusing the same 2-second
 * polling interval.
 */
interface GeneformerRunCardProps {
  /** Callback fired when the job completes so Tab 2 can refetch /priors. */
  onComplete: () => void;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

export function GeneformerRunCard({ onComplete }: GeneformerRunCardProps) {
  const queryClient = useQueryClient();
  const [jobId, setJobId] = useState<string | null>(null);

  const spawn = useMutation({
    mutationFn: generateGeneformer,
    onSuccess: (data) => setJobId(data.job_id),
  });

  const statusQuery = useQuery<GeneformerStatusResponse>({
    queryKey: ["geneformer-job", jobId],
    queryFn: () => fetchGeneformerStatus(jobId!),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 2000;
      if (data.state === "complete" || data.state === "failed") return false;
      return 2000;
    },
  });

  const status = statusQuery.data;
  const isRunning =
    spawn.isPending || (status?.state === "running" || status?.state === "queued");
  const isComplete = status?.state === "complete";
  const isFailed = status?.state === "failed" || spawn.isError;

  // Notify parent + invalidate the /priors cache once the Modal run lands
  useEffect(() => {
    if (isComplete) {
      queryClient.invalidateQueries({ queryKey: ["priors"] });
      onComplete();
    }
  }, [isComplete, queryClient, onComplete]);

  // Crude pseudo-progress from elapsed time since we don't get real
  // percentages out of Modal. Expected ~20-30 min → cap at 95% until
  // the real completion ticks it to 100.
  const elapsedSec = status?.elapsed_sec ?? 0;
  const pseudoPct = Math.min(95, Math.floor((elapsedSec / 1500) * 95));

  if (isComplete) {
    return (
      <Alert variant="success">
        <CheckCircle2 />
        <AlertTitle>Transcriptomic prior ready</AlertTitle>
        <AlertDescription>
          Geneformer in-silico perturbation finished in{" "}
          {formatDuration(elapsedSec)}. The dual-prior ranking with the
          divergence column is now available below.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted/60">
            <Sparkles className="h-4 w-4 text-foreground" />
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="section-label">Optional upgrade</span>
            <CardTitle className="text-[0.98rem] leading-tight">
              Generate the transcriptomic prior
            </CardTitle>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <p className="text-[0.82rem] leading-relaxed text-muted-foreground">
          The transcriptomic prior runs in-silico perturbation with
          Geneformer (Theodoris 2023, ~104 M cells) on a reference
          Tabula Sapiens fibroblast cohort. Expect roughly twenty to
          thirty minutes on the Modal L4 GPU. The result is cached on
          the persistent Modal volume, so this only needs to happen
          once — every subsequent user sees the full dual-prior
          ranking including the divergence column.
        </p>

        {!jobId && !spawn.isError && (
          <Button
            onClick={() => spawn.mutate()}
            disabled={spawn.isPending}
            size="lg"
          >
            {spawn.isPending ? (
              <>
                <Loader2 className="animate-spin" />
                Spawning on Modal GPU
              </>
            ) : (
              <>
                <Sparkles />
                Generate transcriptomic prior
              </>
            )}
          </Button>
        )}

        {spawn.isError && (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>Could not spawn the Geneformer run</AlertTitle>
            <AlertDescription>
              {(spawn.error as Error | undefined)?.message ??
                "Unknown error from the backend."}
            </AlertDescription>
          </Alert>
        )}

        {jobId && isRunning && !isFailed && (
          <div className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-foreground">
                  {status?.message ?? "Running on Modal GPU"}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  In-silico perturbation of 22 glycocalyx genes against a
                  15-gene mechanotransduction signature on a reference
                  fibroblast cohort.
                </div>
              </div>
              <div className="shrink-0 font-mono text-xs font-medium tabular-nums text-muted-foreground">
                {pseudoPct}%
              </div>
            </div>
            <Progress value={pseudoPct} />
            <div className="flex items-center gap-3 pt-1 text-[0.72rem] text-muted-foreground">
              <Clock className="h-3 w-3 shrink-0" />
              <span className="font-mono tabular-nums">
                elapsed {formatDuration(elapsedSec)}
              </span>
              <span className="font-mono tabular-nums">
                of ~25m 00s budget
              </span>
            </div>
            <p className="text-[0.7rem] leading-snug text-muted-foreground">
              You can switch tabs freely — the run continues on the Modal
              GPU and this card will update when it lands.
            </p>
          </div>
        )}

        {jobId && isFailed && (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>Geneformer run failed</AlertTitle>
            <AlertDescription>
              {status?.error ??
                "The Modal call did not return a result. Try again, or check the backend logs."}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
