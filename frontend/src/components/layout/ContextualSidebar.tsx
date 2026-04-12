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
    <aside className="fixed right-0 top-12 h-[calc(100vh-3rem)] w-56 z-40 flex flex-col bg-[#0f0f0f] border-l border-white/10">
      <div className="p-4 border-b border-white/10">
        <h2 className="font-headline font-semibold text-xs text-white/60 tracking-tight">
          Contextual Analysis
        </h2>
        <p className="text-[9px] text-white/30 uppercase tracking-widest mt-0.5">
          Current selection
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
                    ? "bg-white/10 text-primary border-l-2 border-primary"
                    : "text-white/40 hover:bg-white/5",
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
                    ? "bg-white/10 text-primary border-l-2 border-primary"
                    : "text-white/40 hover:bg-white/5",
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
      <div className="p-4 border-t border-white/10">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest">
            Engine State
          </span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        </div>
        <div className="h-0.5 bg-white/10 rounded-full overflow-hidden">
          <div className="h-full bg-primary w-2/3" />
        </div>
      </div>
    </aside>
  );
}
