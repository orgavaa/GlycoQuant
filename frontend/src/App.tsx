import { useState } from "react";
import { TopBar, type ViewId } from "@/components/TopBar";
import { StatusBar } from "@/components/StatusBar";
import { useJobStore } from "@/lib/jobStore";
import { OverviewView } from "@/views/OverviewView";
import { LoaderView } from "@/views/LoaderView";
import { PrioritizationTab } from "@/features/prioritization/PrioritizationTab";
import { ExperimentTab } from "@/features/experiment/ExperimentTab";

export default function App() {
  const [activeView, setActiveView] = useState<ViewId>("overview");
  const latestResult = useJobStore(s => s.latestJobResult);
  const latestLabel = useJobStore(s => s.latestDatasetLabel);
  const hasResult = latestResult !== null;

  return (
    <div style={{
      height: "100vh", display: "flex", flexDirection: "column",
      background: "#0a0a0a", color: "#eee", overflow: "hidden",
    }}>
      <TopBar activeView={activeView} onChangeView={setActiveView} hasResult={hasResult} />

      <div style={{ flex: 1, overflow: "hidden" }}>
        {!hasResult ? (
          <LoaderView />
        ) : activeView === "overview" || activeView === "single" ? (
          <OverviewView result={latestResult} />
        ) : activeView === "compare" ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#555", fontSize: 13 }}>
            Compare view — select two completed analyses to compare
          </div>
        ) : activeView === "prioritization" ? (
          <div style={{ height: "100%", overflowY: "auto", background: "#fff", color: "#111", padding: 32 }}>
            <div style={{ maxWidth: 1200, margin: "0 auto" }}>
              <PrioritizationTab />
            </div>
          </div>
        ) : activeView === "experiment" ? (
          <div style={{ height: "100%", overflowY: "auto", background: "#fff", color: "#111", padding: 32 }}>
            <div style={{ maxWidth: 1200, margin: "0 auto" }}>
              <ExperimentTab />
            </div>
          </div>
        ) : null}
      </div>

      <StatusBar
        datasetLabel={latestLabel}
        cellCount={latestResult?.cell_count ?? null}
        pixelSizeUm={latestResult?.pixel_size_um}
        deepBackend={latestResult?.deep_embedding_backend}
      />
    </div>
  );
}
