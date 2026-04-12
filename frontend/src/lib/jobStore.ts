import { create } from "zustand";
import type { JobResult } from "@/lib/api";

interface JobStoreState {
  latestJobResult: JobResult | null;
  latestDatasetLabel: string | null;
  selectedCellId: number | null;
  completedJobs: { result: JobResult; label: string }[];
  setLatestJobResult: (result: JobResult, datasetLabel?: string | null) => void;
  clearLatestJobResult: () => void;
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
