import { useState } from "react";
import { TopBar, type ViewId } from "@/components/TopBar";
import { ImagingTab } from "@/features/imaging/ImagingTab";
import { PrioritizationTab } from "@/features/prioritization/PrioritizationTab";
import { MethodsTab } from "@/features/methods/MethodsTab";

export default function App() {
  const [activeView, setActiveView] = useState<ViewId>("analysis");

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      <TopBar activeView={activeView} onChangeView={setActiveView} />

      <div className="flex-1 overflow-hidden">
        {activeView === "analysis" ? (
          <ImagingTab />
        ) : activeView === "ranking" ? (
          <div className="h-full overflow-y-auto bg-gray-50">
            <div className="max-w-[1200px] mx-auto px-8 py-8">
              <PrioritizationTab />
            </div>
          </div>
        ) : activeView === "methods" ? (
          <div className="h-full overflow-y-auto bg-gray-50">
            <div className="max-w-[1100px] mx-auto px-8 py-8">
              <MethodsTab />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
