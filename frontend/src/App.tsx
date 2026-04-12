import { useState } from "react";
import { TopBar, type ViewId } from "@/components/TopBar";
import { ImagingTab } from "@/features/imaging/ImagingTab";
import { PrioritizationTab } from "@/features/prioritization/PrioritizationTab";

export default function App() {
  const [activeView, setActiveView] = useState<ViewId>("analysis");

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      <TopBar activeView={activeView} onChangeView={setActiveView} />

      <div className="flex-1 overflow-hidden">
        {activeView === "analysis" ? (
          <ImagingTab />
        ) : activeView === "ranking" ? (
          <div className="h-full overflow-y-auto bg-gray-50 px-6 py-8">
            <div className="max-w-[1200px] mx-auto">
              <PrioritizationTab />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
