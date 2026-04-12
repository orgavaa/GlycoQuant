/**
 * ContextualSidebar — fixed right rail per the Stitch design.
 *
 * Per UI_SCIENCE_GUIDELINES and the Stitch screens, the imaging tab
 * is anchored asymmetrically: image-dominant left pane, evidence
 * stack in the middle, and a 256px right rail that hosts contextual
 * actions and an "Engine state" footer.
 *
 * The rail items are visual-only (no routing yet) for selection
 * info / condition summary / QC metrics / channel controls / history.
 * The bottom "Other tools" section links to the legacy Tab 2 and
 * Tab 3 routes via the App-level view state.
 */
import { cn } from "@/lib/utils";

export type ContextualNavItem = "prioritization" | "experiment";

interface ContextualSidebarProps {
  activeItem?: ContextualNavItem;
  onOpenPrioritization?: () => void;
  onOpenExperiment?: () => void;
  isPrioritizationActive?: boolean;
  isExperimentActive?: boolean;
}

export function ContextualSidebar({
  onOpenPrioritization,
  onOpenExperiment,
  isPrioritizationActive = false,
  isExperimentActive = false,
}: ContextualSidebarProps) {
  return (
    <aside className="fixed right-0 top-14 h-[calc(100vh-3.5rem)] w-64 z-40 flex flex-col bg-surface-container-low ghost-border-l">
      <div className="p-5 ghost-border-b">
        <h2 className="font-headline font-semibold text-sm text-on-surface tracking-tight">
          Contextual Analysis
        </h2>
        <p className="text-[10px] text-on-surface-variant uppercase tracking-widest mt-1">
          Current selection details
        </p>
      </div>

      <nav className="flex-1 overflow-y-auto no-scrollbar">
        {/* Other tools section — links to Tab 2 / Tab 3 */}
        {(onOpenPrioritization || onOpenExperiment) && (
          <div className="mt-2">
            <div className="px-5 pt-4 pb-2">
              <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
                Other tools
              </span>
            </div>
            {onOpenPrioritization && (
              <button
                type="button"
                onClick={onOpenPrioritization}
                className={cn(
                  "w-full flex items-center gap-3 px-5 py-3 transition-all duration-200",
                  isPrioritizationActive
                    ? "bg-surface-container-lowest text-primary border-l-2 border-primary"
                    : "text-on-surface-variant hover:bg-surface-container",
                )}
              >
                <span className="material-symbols-outlined text-[18px]">
                  hub
                </span>
                <span className="font-label text-[11px] font-medium tracking-wider uppercase">
                  Perturbation Ranking
                </span>
              </button>
            )}
            {onOpenExperiment && (
              <button
                type="button"
                onClick={onOpenExperiment}
                className={cn(
                  "w-full flex items-center gap-3 px-5 py-3 transition-all duration-200",
                  isExperimentActive
                    ? "bg-surface-container-lowest text-primary border-l-2 border-primary"
                    : "text-on-surface-variant hover:bg-surface-container",
                )}
              >
                <span className="material-symbols-outlined text-[18px]">
                  science
                </span>
                <span className="font-label text-[11px] font-medium tracking-wider uppercase">
                  Experiment Designer
                </span>
              </button>
            )}
          </div>
        )}
      </nav>

      {/* Engine state footer */}
      <div className="p-4 bg-surface-container-low ghost-border-t">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
            Engine State
          </span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        </div>
        <div className="h-1 bg-surface-container-highest rounded-full overflow-hidden">
          <div className="h-full bg-primary w-2/3" />
        </div>
      </div>
    </aside>
  );
}
