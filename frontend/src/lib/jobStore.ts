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
  /**
   * Globally selected cell ID for cross-view highlighting per
   * UI_SCIENCE_GUIDELINES §5 — Single Cell, the canvas overlay, and
   * the Methods & QC drawer must all reflect the same selection so
   * the user never has to mentally re-link their context when
   * switching sub-tabs.
   */
  selectedCellId: number | null;
  /** Called by useAnalysisJob when a job transitions to status="complete". */
  setLatestJobResult: (result: JobResult, datasetLabel?: string | null) => void;
  /** Clear the store — useful for the "Show static ranking" toggle in Tab 2. */
  clearLatestJobResult: () => void;
  /** Set or clear the cross-view cell selection. */
  setSelectedCellId: (cellId: number | null) => void;
}

export const useJobStore = create<JobStoreState>((set) => ({
  latestJobResult: null,
  latestDatasetLabel: null,
  selectedCellId: null,
  setLatestJobResult: (result, datasetLabel = null) =>
    set({
      latestJobResult: result,
      latestDatasetLabel: datasetLabel,
      // Clear selection on new analysis — old cell IDs are no longer valid.
      selectedCellId: null,
    }),
  clearLatestJobResult: () =>
    set({
      latestJobResult: null,
      latestDatasetLabel: null,
      selectedCellId: null,
    }),
  setSelectedCellId: (cellId) => set({ selectedCellId: cellId }),
}));
