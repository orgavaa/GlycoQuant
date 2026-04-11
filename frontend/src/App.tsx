/**
 * App shell — Stitch "Quantitative Aesthetic" layout.
 *
 * The visible top nav exposes the four imaging sub-views directly
 * (Overview / Single Cell / Condition Compare / Methods & QC); the
 * legacy Tab 2 (Perturbation Prioritization) and Tab 3 (Experiment
 * Designer) are reachable from the right ContextualSidebar's "Other
 * tools" section so the primary surface stays focused on the imaging
 * pipeline per UI_SCIENCE_GUIDELINES.
 *
 * Active-view state lives here so the AppHeader, the ImagingTab
 * orchestrator, and the ContextualSidebar all stay in lock-step
 * without prop drilling through the four view files.
 */
import { useState } from "react";
import { AppHeader, type AppView } from "@/components/layout/AppHeader";
import {
  ContextualSidebar,
  type ContextualNavItem,
} from "@/components/layout/ContextualSidebar";
import { ExperimentTab } from "@/features/experiment/ExperimentTab";
import { ImagingTab } from "@/features/imaging/ImagingTab";
import { PrioritizationTab } from "@/features/prioritization/PrioritizationTab";

const IMAGING_VIEWS: AppView[] = ["overview", "single", "compare", "methods"];

export default function App() {
  const [activeView, setActiveView] = useState<AppView>("overview");
  const [contextualItem, setContextualItem] =
    useState<ContextualNavItem>("selection");

  const isImagingView = IMAGING_VIEWS.includes(activeView);

  return (
    <div className="min-h-screen bg-surface text-on-surface font-body antialiased">
      <AppHeader
        activeView={activeView}
        onChangeView={setActiveView}
        canRerun={false}
        canExport={false}
      />

      <ContextualSidebar
        activeItem={contextualItem}
        onSelectItem={setContextualItem}
        onOpenPrioritization={() => setActiveView("prioritization")}
        onOpenExperiment={() => setActiveView("experiment")}
        isPrioritizationActive={activeView === "prioritization"}
        isExperimentActive={activeView === "experiment"}
      />

      {/*
        Main content surface. Top padding clears the fixed h-14 nav,
        right padding clears the w-64 contextual sidebar. ImagingTab
        renders one of the four view components based on the App-level
        activeView; legacy Tab 2/3 render full-bleed inside the same
        canvas.
      */}
      <main className="pt-14 pr-64 min-h-screen">
        {isImagingView && (
          <ImagingTab
            view={activeView as Exclude<AppView, "prioritization" | "experiment">}
          />
        )}
        {activeView === "prioritization" && (
          <div className="mx-auto max-w-[1400px] px-6 py-8">
            <PrioritizationTab />
          </div>
        )}
        {activeView === "experiment" && (
          <div className="mx-auto max-w-[1400px] px-6 py-8">
            <ExperimentTab />
          </div>
        )}
      </main>
    </div>
  );
}
