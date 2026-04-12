import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  fetchJobStatus,
  type JobStatusResponse,
  submitAnalyze,
  type SubmitAnalyzeArgs,
} from "@/lib/api";
import { useJobStore } from "@/lib/jobStore";

export function useAnalysisJob() {
  const queryClient = useQueryClient();
  const [jobId, setJobId] = useState<string | null>(null);
  const setLatestJobResult = useJobStore((s) => s.setLatestJobResult);
  const datasetLabelRef = useRef<string | null>(null);

  const submit = useMutation({
    mutationFn: async (args: SubmitAnalyzeArgs) => {
      datasetLabelRef.current = args.demoCondition ?? args.upload?.name ?? null;
      return submitAnalyze(args);
    },
    onSuccess: (response) => {
      setJobId(response.job_id);
      queryClient.setQueryData<JobStatusResponse>(
        ["job", response.job_id],
        {
          job_id: response.job_id,
          status: response.status,
          progress: { phase: "idle", pct: 0, message: "Queued" },
          created_at: response.created_at,
          finished_at: null,
          result: null,
          error: null,
        },
      );
    },
  });

  const statusQuery = useQuery<JobStatusResponse>({
    queryKey: ["job", jobId],
    queryFn: () => fetchJobStatus(jobId!),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 2000;
      if (data.status === "complete" || data.status === "failed") return false;
      return 2000;
    },
  });

  const status = statusQuery.data;
  const isRunning = !!status && (status.status === "queued" || status.status === "running");
  const isComplete = status?.status === "complete";
  const isFailed = status?.status === "failed";
  const result = status?.result ?? null;
  const progress = status?.progress ?? null;

  useEffect(() => {
    if (isComplete && result) {
      setLatestJobResult(result, datasetLabelRef.current);
    }
  }, [isComplete, result, setLatestJobResult]);

  const reset = () => {
    setJobId(null);
    submit.reset();
  };

  return {
    submit,
    statusQuery,
    status,
    jobId,
    isRunning,
    isComplete,
    isFailed,
    result,
    progress,
    reset,
  } as const;
}
