/**
 * Cross-tab store for the most recent Tab 1 analysis result.
 *
 * Tab 2 (Perturbation Prioritization) reads the latest JobResult from
 * here to build an image-aware re-weighted ranking. The store is
 * deliberately minimal: just the completed JobResult plus an optional
 * display label (the HPA demo name or the uploaded filename).
 *
 * Zustand was chosen over React Context so subscribers outside the
 * Tab 1 React tree (like Tab 2) re-render only when the slice they
 * select actually changes.
 */
import { create } from "zustand";
import type { JobResult } from "@/lib/api";

interface JobStoreState {
  /** The most recently completed Tab 1 analysis, or null if none yet. */
  latestJobResult: JobResult | null;
  /** Human-readable label for the banner (dataset name or filename). */
  latestDatasetLabel: string | null;
  /** Globally selected cell ID for cross-view highlighting. */
  selectedCellId: number | null;
  /** History of completed job results for compare view. */
  completedJobs: { result: JobResult; label: string }[];
  /** Called by useAnalysisJob when a job transitions to status="complete". */
  setLatestJobResult: (result: JobResult, datasetLabel?: string | null) => void;
  /** Clear the store. */
  clearLatestJobResult: () => void;
  /** Set or clear the cross-view cell selection. */
  setSelectedCellId: (cellId: number | null) => void;
}

export const useJobStore = create<JobStoreState>((set) => ({
  latestJobResult: null,
  latestDatasetLabel: null,
  selectedCellId: null,
  completedJobs: [],
  setLatestJobResult: (result, datasetLabel = null) =>
    set((state) => ({
      latestJobResult: result,
      latestDatasetLabel: datasetLabel,
      selectedCellId: null,
      completedJobs: [
        ...state.completedJobs,
        { result, label: datasetLabel ?? "Untitled" },
      ],
    })),
  clearLatestJobResult: () =>
    set({
      latestJobResult: null,
      latestDatasetLabel: null,
      selectedCellId: null,
    }),
  setSelectedCellId: (cellId) => set({ selectedCellId: cellId }),
}));
