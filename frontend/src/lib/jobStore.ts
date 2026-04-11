/**
 * Cross-tab store for the most recent Tab 1 analysis result.
 *
 * Tab 2 (Perturbation Prioritization) reads the latest JobResult from
 * here to build an image-aware re-weighted ranking — see the Axis A
 * plan in tender-humming-catmull.md. The store is deliberately
 * minimal: just the completed JobResult plus an optional display
 * label (the HPA demo name or the uploaded filename).
 *
 * Zustand was chosen over React Context so subscribers outside the
 * Tab 1 React tree (like Tab 2) re-render only when the slice they
 * select actually changes. React Context would re-render every
 * consumer on any setState, which is bad for the large Plotly figure
 * trees downstream.
 */
import { create } from "zustand";
import type { JobResult } from "@/lib/api";

interface JobStoreState {
  /** The most recently completed Tab 1 analysis, or null if none yet. */
  latestJobResult: JobResult | null;
  /** Human-readable label for the banner in Tab 2 (dataset name or filename). */
  latestDatasetLabel: string | null;
  /** Called by useAnalysisJob when a job transitions to status="complete". */
  setLatestJobResult: (result: JobResult, datasetLabel?: string | null) => void;
  /** Clear the store — useful for the "Show static ranking" toggle in Tab 2. */
  clearLatestJobResult: () => void;
}

export const useJobStore = create<JobStoreState>((set) => ({
  latestJobResult: null,
  latestDatasetLabel: null,
  setLatestJobResult: (result, datasetLabel = null) =>
    set({ latestJobResult: result, latestDatasetLabel: datasetLabel }),
  clearLatestJobResult: () =>
    set({ latestJobResult: null, latestDatasetLabel: null }),
}));
