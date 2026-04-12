import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Card } from "@/components/Card";
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
  const isRunning = spawn.isPending || status?.state === "running" || status?.state === "queued";
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
      <Card className="!bg-emerald-50 !border-emerald-200">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-emerald-500 text-[16px]">&#10003;</span>
          <span className="text-[13px] font-semibold text-gray-900">Transcriptomic prior ready</span>
        </div>
        <p className="text-[13px] text-gray-600">
          Geneformer in-silico perturbation finished in {formatDuration(elapsedSec)}.
          The dual-prior ranking with the divergence column is now available.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center gap-3 mb-3">
        <span className="text-blue-500 text-[16px]">&#9733;</span>
        <div>
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block">Optional upgrade</span>
          <h3 className="text-[13px] font-semibold text-gray-900 mt-0.5">Generate the transcriptomic prior</h3>
        </div>
      </div>

      <p className="text-[13px] text-gray-600 leading-relaxed max-w-2xl mb-4">
        The transcriptomic prior runs in-silico perturbation with Geneformer (Theodoris 2023, ~10&#x2074; M cells)
        on a reference Tabula Sapiens fibroblast cohort. Expect roughly twenty to thirty minutes on the Modal L4 GPU.
      </p>

      {!jobId && !spawn.isError && (
        <button
          type="button"
          onClick={() => spawn.mutate()}
          disabled={spawn.isPending}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-[13px] font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {spawn.isPending ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Spawning on Modal GPU...
            </>
          ) : (
            "Generate transcriptomic prior"
          )}
        </button>
      )}

      {spawn.isError && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4 mt-3">
          <span className="text-[11px] font-semibold text-gray-900 uppercase tracking-wider">Could not spawn the Geneformer run</span>
          <p className="text-[13px] text-gray-600 mt-1">{(spawn.error as Error | undefined)?.message ?? "Unknown error"}</p>
        </div>
      )}

      {jobId && isRunning && !isFailed && (
        <div className="bg-gray-50 border border-gray-200 rounded-md p-5 mt-3 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold text-gray-900">{status?.message ?? "Running on Modal GPU"}</div>
              <div className="text-[11px] text-gray-500 mt-0.5">In-silico perturbation of 22 glycocalyx genes &times; 15 mechano targets</div>
            </div>
            <span className="text-[13px] font-bold text-gray-900" style={{ fontFeatureSettings: "'tnum'" }}>{pseudoPct}%</span>
          </div>
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-blue-600 rounded-full transition-all" style={{ width: `${pseudoPct}%` }} />
          </div>
          <div className="flex items-center gap-2 text-[11px] text-gray-500">
            <span style={{ fontFeatureSettings: "'tnum'" }}>elapsed {formatDuration(elapsedSec)}</span>
            <span className="text-gray-300">&middot;</span>
            <span style={{ fontFeatureSettings: "'tnum'" }}>~25m budget</span>
          </div>
        </div>
      )}

      {jobId && isFailed && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4 mt-3">
          <span className="text-[11px] font-semibold text-gray-900 uppercase tracking-wider">Geneformer run failed</span>
          <p className="text-[13px] text-gray-600 mt-1">{status?.error ?? "The Modal call did not return a result."}</p>
        </div>
      )}
    </Card>
  );
}
