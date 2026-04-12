import { useState } from "react";
import { TopBar, type ViewId } from "@/components/TopBar";
import { DatasetBar } from "@/components/DatasetBar";
import { useJobStore } from "@/lib/jobStore";
import { OverviewView } from "@/views/OverviewView";
import { LoaderView } from "@/views/LoaderView";
import { PrioritizationTab } from "@/features/prioritization/PrioritizationTab";

export default function App() {
  const [activeView, setActiveView] = useState<ViewId>("analysis");
  const latestResult = useJobStore(s => s.latestJobResult);
  const latestLabel = useJobStore(s => s.latestDatasetLabel);
  const hasResult = latestResult !== null;

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#fff", color: "#111", overflow: "hidden" }}>
      <TopBar activeView={activeView} onChangeView={setActiveView} />

      <div style={{ flex: 1, overflow: "hidden" }}>
        {activeView === "analysis" ? (
          hasResult ? <OverviewView result={latestResult} /> : <LoaderView />
        ) : activeView === "ranking" ? (
          <div style={{ height: "100%", overflowY: "auto", background: "#fff", padding: 32 }}>
            <div style={{ maxWidth: 1200, margin: "0 auto" }}>
              <PrioritizationTab />
            </div>
          </div>
        ) : null}
      </div>

      <DatasetBar
        datasetLabel={latestLabel}
        cellCount={latestResult?.cell_count ?? null}
        pixelSizeUm={latestResult?.pixel_size_um}
      />
    </div>
  );
}
