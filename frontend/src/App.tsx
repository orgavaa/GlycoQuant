/**
 * App — The Darkroom. Microscopy instrument shell.
 */
import { useState } from "react";
import { TopBar, type ViewId } from "@/components/TopBar";
import { StatusBar } from "@/components/StatusBar";
import { useJobStore } from "@/lib/jobStore";
import { OverviewView } from "@/views/OverviewView";
import { LoaderView } from "@/views/LoaderView";

export default function App() {
  const [activeView, setActiveView] = useState<ViewId>("overview");
  const latestResult = useJobStore((s) => s.latestJobResult);
  const latestLabel = useJobStore((s) => s.latestDatasetLabel);
  const hasResult = latestResult !== null;

  return (
    <div className="h-screen flex flex-col bg-[#0a0a0a] text-[#eee] overflow-hidden">
      <TopBar
        activeView={activeView}
        onChangeView={setActiveView}
        hasResult={hasResult}
      />

      <div className="flex-1 overflow-hidden">
        {!hasResult ? (
          <LoaderView />
        ) : activeView === "overview" || activeView === "single" ? (
          <OverviewView result={latestResult} datasetLabel={latestLabel} />
        ) : activeView === "prioritization" ? (
          <LegacyTabWrapper tab="prioritization" />
        ) : activeView === "experiment" ? (
          <LegacyTabWrapper tab="experiment" />
        ) : activeView === "compare" ? (
          <div className="flex items-center justify-center h-full text-[#888] text-sm">
            Compare view — select two completed analyses to compare
          </div>
        ) : null}
      </div>

      <StatusBar
        datasetLabel={latestLabel}
        cellCount={latestResult?.cell_count ?? null}
      />
    </div>
  );
}

/** Wrapper for legacy Tab 2 / Tab 3 with dark background */
function LegacyTabWrapper({ tab }: { tab: "prioritization" | "experiment" }) {
  return (
    <div className="h-full overflow-y-auto bg-[#0a0a0a] p-8">
      <div className="max-w-[1200px] mx-auto">
        {tab === "prioritization" ? (
          <PrioritizationTabLazy />
        ) : (
          <ExperimentTabLazy />
        )}
      </div>
    </div>
  );
}

// Lazy imports for legacy tabs
import { PrioritizationTab } from "@/features/prioritization/PrioritizationTab";
import { ExperimentTab } from "@/features/experiment/ExperimentTab";

function PrioritizationTabLazy() {
  return <PrioritizationTab />;
}
function ExperimentTabLazy() {
  return <ExperimentTab />;
}
