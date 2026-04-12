/**
 * GeneformerRunCard — optional transcriptomic prior generation.
 * Restyled for the Stitch design language.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  fetchGeneformerStatus,
  generateGeneformer,
  type GeneformerStatusResponse,
} from "@/lib/api";

interface GeneformerRunCardProps {
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
    spawn.isPending || status?.state === "running" || status?.state === "queued";
  const isComplete = status?.state === "complete";
  const isFailed = status?.state === "failed" || spawn.isError;

  useEffect(() => {
    if (isComplete) {
      queryClient.invalidateQueries({ queryKey: ["priors"] });
      onComplete();
    }
  }, [isComplete, queryClient, onComplete]);

  const elapsedSec = status?.elapsed_sec ?? 0;
  const pseudoPct = Math.min(95, Math.floor((elapsedSec / 1500) * 95));

  if (isComplete) {
    return (
      <div className="ghost-border bg-emerald-50 p-6">
        <div className="flex items-center gap-3 mb-2">
          <span className="material-symbols-outlined text-emerald-600">check_circle</span>
          <span className="text-sm font-headline font-semibold text-on-surface">
            Transcriptomic prior ready
          </span>
        </div>
        <p className="text-xs text-on-surface-variant">
          Geneformer in-silico perturbation finished in {formatDuration(elapsedSec)}.
          The dual-prior ranking with the divergence column is now available.
        </p>
      </div>
    );
  }

  return (
    <div className="ghost-border bg-surface-container-lowest p-6 space-y-5">
      <div className="flex items-center gap-3">
        <span className="material-symbols-outlined text-primary">auto_awesome</span>
        <div>
          <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
            Optional upgrade
          </span>
          <h3 className="text-sm font-headline font-semibold text-on-surface mt-0.5">
            Generate the transcriptomic prior
          </h3>
        </div>
      </div>

      <p className="text-xs text-on-surface-variant leading-relaxed max-w-2xl">
        The transcriptomic prior runs in-silico perturbation with
        Geneformer (Theodoris 2023, ~10⁴ M cells) on a reference Tabula
        Sapiens fibroblast cohort. Expect roughly twenty to thirty minutes
        on the Modal L4 GPU. The result is cached on the persistent Modal
        volume, so this only needs to happen once — every subsequent user
        sees the full dual-prior ranking including the divergence column.
      </p>

      {!jobId && !spawn.isError && (
        <button
          type="button"
          onClick={() => spawn.mutate()}
          disabled={spawn.isPending}
          className="bg-primary text-on-primary px-5 py-2.5 text-[11px] font-bold uppercase tracking-widest hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center gap-2"
        >
          {spawn.isPending ? (
            <>
              <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
              Spawning on Modal GPU
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-[16px]">auto_awesome</span>
              Generate transcriptomic prior
            </>
          )}
        </button>
      )}

      {spawn.isError && (
        <div className="ghost-border bg-error-container/20 p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-error-stitch text-[18px]">warning</span>
            <span className="text-xs font-bold text-on-surface uppercase tracking-widest">
              Could not spawn the Geneformer run
            </span>
          </div>
          <p className="text-xs text-on-surface-variant">
            {(spawn.error as Error | undefined)?.message ?? "Unknown error from the backend."}
          </p>
        </div>
      )}

      {jobId && isRunning && !isFailed && (
        <div className="ghost-border bg-surface-container p-5 space-y-3">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-primary animate-spin text-[20px]">
              progress_activity
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-on-surface">
                {status?.message ?? "Running on Modal GPU"}
              </div>
              <div className="text-[10px] text-on-surface-variant mt-0.5">
                In-silico perturbation of 22 glycocalyx genes × 15 mechano targets
              </div>
            </div>
            <span className="font-mono text-xs font-bold tabular-nums text-on-surface">
              {pseudoPct}%
            </span>
          </div>
          <div className="h-1 bg-surface-container-highest overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${pseudoPct}%` }} />
          </div>
          <div className="flex items-center gap-3 text-[10px] text-on-surface-variant">
            <span className="material-symbols-outlined text-[14px]">schedule</span>
            <span className="font-mono tabular-nums">elapsed {formatDuration(elapsedSec)}</span>
            <span className="font-mono tabular-nums">of ~25m budget</span>
          </div>
        </div>
      )}

      {jobId && isFailed && (
        <div className="ghost-border bg-error-container/20 p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-error-stitch text-[18px]">error</span>
            <span className="text-xs font-bold text-on-surface uppercase tracking-widest">
              Geneformer run failed
            </span>
          </div>
          <p className="text-xs text-on-surface-variant">
            {status?.error ?? "The Modal call did not return a result. Check the backend logs."}
          </p>
        </div>
      )}
    </div>
  );
}
