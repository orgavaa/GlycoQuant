import { create } from "zustand";
import type { JobResult, PhenotypeResponse, SpatialGNNResponse, CrossModalResponse } from "@/lib/api";

interface JobStoreState {
  latestJobResult: JobResult | null;
  latestDatasetLabel: string | null;
  latestJobId: string | null;
  // URL of the originally-selected/-uploaded image (demo preview URL or upload blob URL).
  // Surfaced on Analysis view's "Raw image" toggle so the user can return to the
  // untouched source composite at any time.
  latestRawPreviewUrl: string | null;
  selectedCellId: number | null;
  completedJobs: { result: JobResult; label: string }[];
  // ML feature results
  phenotypeResult: PhenotypeResponse | null;
  spatialGNNResult: SpatialGNNResponse | null;
  crossModalResult: CrossModalResponse | null;
  // Actions
  setLatestJobId: (jobId: string) => void;
  setLatestJobResult: (result: JobResult, datasetLabel?: string | null, jobId?: string | null) => void;
  /** Replace the current result in place without touching completedJobs
   * or resetting ML panels — used by the recompute-correlation toggle. */
  patchLatestJobResult: (result: JobResult) => void;
  setLatestRawPreviewUrl: (url: string | null) => void;
  clearLatestJobResult: () => void;
  setSelectedCellId: (cellId: number | null) => void;
  setPhenotypeResult: (r: PhenotypeResponse | null) => void;
  setSpatialGNNResult: (r: SpatialGNNResponse | null) => void;
  setCrossModalResult: (r: CrossModalResponse | null) => void;
}

export const useJobStore = create<JobStoreState>((set) => ({
  latestJobResult: null,
  latestDatasetLabel: null,
  latestJobId: null,
  latestRawPreviewUrl: null,
  selectedCellId: null,
  completedJobs: [],
  phenotypeResult: null,
  spatialGNNResult: null,
  crossModalResult: null,
  setLatestJobId: (jobId) => set({ latestJobId: jobId }),
  setLatestRawPreviewUrl: (url) => set({ latestRawPreviewUrl: url }),
  setLatestJobResult: (result, datasetLabel = null, jobId = null) =>
    set((state) => ({
      latestJobResult: result,
      latestDatasetLabel: datasetLabel,
      latestJobId: jobId,
      selectedCellId: null,
      // Clear ML results when a new analysis completes
      phenotypeResult: null,
      spatialGNNResult: null,
      crossModalResult: null,
      completedJobs: [
        ...state.completedJobs,
        { result, label: datasetLabel ?? "Untitled" },
      ],
    })),
  patchLatestJobResult: (result) =>
    set({ latestJobResult: result }),
  clearLatestJobResult: () =>
    set({
      latestJobResult: null,
      latestDatasetLabel: null,
      latestJobId: null,
      latestRawPreviewUrl: null,
      selectedCellId: null,
      phenotypeResult: null,
      spatialGNNResult: null,
      crossModalResult: null,
    }),
  setSelectedCellId: (cellId) => set({ selectedCellId: cellId }),
  setPhenotypeResult: (r) => set({ phenotypeResult: r }),
  setSpatialGNNResult: (r) => set({ spatialGNNResult: r }),
  setCrossModalResult: (r) => set({ crossModalResult: r }),
}));
