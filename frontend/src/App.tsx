import { useState } from "react";
import { Sidebar, type ViewId } from "@/components/Sidebar";
import { ImagingTab } from "@/features/imaging/ImagingTab";
import { PrioritizationTab } from "@/features/prioritization/PrioritizationTab";

export default function App() {
  const [activeView, setActiveView] = useState<ViewId>("analysis");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="h-screen flex bg-gray-50 overflow-hidden">
      <Sidebar
        activeView={activeView}
        onChangeView={setActiveView}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed(v => !v)}
      />

      <div className="flex-1 overflow-hidden flex flex-col">
        {activeView === "analysis" ? (
          <ImagingTab />
        ) : activeView === "ranking" ? (
          <div className="h-full overflow-y-auto bg-gray-50">
            <div className="max-w-[1200px] mx-auto px-8 py-8">
              <PrioritizationTab />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
