import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  fetchJobStatus,
  JobStatusResponse,
  submitAnalyze,
  SubmitAnalyzeArgs,
} from "@/lib/api";
import { useJobStore } from "@/lib/jobStore";

/**
 * Submit an analysis job and poll its status every 2 s until terminal.
 *
 * Returns everything the UI needs: the current job_id, submit mutation
 * state, poll query state, and convenience booleans for rendering.
 */
export function useAnalysisJob() {
  const queryClient = useQueryClient();
  const [jobId, setJobId] = useState<string | null>(null);
  const setLatestJobResult = useJobStore((s) => s.setLatestJobResult);
  const datasetLabelRef = useRef<string | null>(null);

  // ----- Mutation: POST /analysis/analyze -----
  const submit = useMutation({
    mutationFn: async (args: SubmitAnalyzeArgs) => {
      // Capture a human-readable label for Tab 2's dynamic banner.
      datasetLabelRef.current = args.demoCondition
        ?? args.upload?.name
        ?? null;
      return submitAnalyze(args);
    },
    onSuccess: (response) => {
      setJobId(response.job_id);
      // Seed the query cache with the initial status so the polling
      // query has something to merge into on its first tick.
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

  // ----- Query: GET /analysis/jobs/{id}, polled every 2s -----
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
  const isRunning =
    !!status && (status.status === "queued" || status.status === "running");
  const isComplete = status?.status === "complete";
  const isFailed = status?.status === "failed";
  const result = status?.result ?? null;
  const progress = status?.progress ?? null;

  // Mirror the completed JobResult into the cross-tab Zustand store so
  // Tab 2 can pick it up for image-aware re-weighting. Firing in an
  // effect (not inside the useQuery hook) keeps React's "setState
  // during render" warning quiet and preserves referential stability.
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
