/**
 * AppHeader — fixed glassmorphic top nav per the Stitch design.
 *
 * Layout: GlycoQuant wordmark left + 4 imaging sub-view links inline,
 * right-side actions (Rerun Analysis ghost button + Export primary).
 * Active link gets a 2px primary underline. Implements the "Digital
 * Curator" rule: no shadows, ghost border bottom, glassmorphic blur,
 * Space Grotesk wordmark with tracking-tighter, Inter labels.
 */
import { cn } from "@/lib/utils";

export type ImagingView = "overview" | "single" | "compare" | "methods";
export type AppView = ImagingView | "prioritization" | "experiment";

interface AppHeaderProps {
  activeView: AppView;
  onChangeView: (view: AppView) => void;
  onRerun?: () => void;
  onExport?: () => void;
  canRerun?: boolean;
  canExport?: boolean;
  showViewTabs?: boolean;
}

interface NavItem {
  id: ImagingView;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: "overview", label: "Overview" },
  { id: "single", label: "Single Cell" },
  { id: "compare", label: "Compare" },
];

export function AppHeader({
  activeView,
  onChangeView,
  onRerun,
  onExport,
  canRerun = false,
  canExport = false,
  showViewTabs = true,
}: AppHeaderProps) {
  return (
    <nav className="fixed top-0 left-0 w-full z-50 flex justify-between items-center px-6 h-12 bg-[#0a0a0a]/95 backdrop-blur-md border-b border-white/10">
      <div className="flex items-center gap-8">
        {/* Logo + favicon — Stitch wordmark style: Space Grotesk, bold, tight tracking */}
        <button
          type="button"
          onClick={() => onChangeView("overview")}
          className="flex items-center gap-2.5 group"
        >
          <img
            src="/favicon.png"
            alt=""
            className="h-6 w-6 shrink-0 select-none"
            draggable={false}
          />
          <span className="text-lg font-bold tracking-tighter text-white font-headline group-hover:text-primary transition-colors">
            GlycoQuant
          </span>
        </button>

        {/* Imaging sub-view nav links — hidden until a result exists */}
        <div className={`hidden md:flex items-center gap-6 ${showViewTabs ? "" : "invisible"}`}>
          {NAV_ITEMS.map((item) => {
            const isActive = item.id === activeView;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onChangeView(item.id)}
                className={cn(
                  "font-label text-xs pb-1 transition-colors relative",
                  isActive
                    ? "text-white border-b border-primary"
                    : "text-white/40 hover:text-white/70",
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onRerun}
          disabled={!canRerun}
          className={cn(
            "px-4 py-1.5 text-[11px] font-label tracking-wider uppercase transition-colors ghost-border",
            canRerun
              ? "text-white/60 hover:text-white border-white/20"
              : "text-white/20 cursor-not-allowed border-white/10",
          )}
        >
          Rerun Analysis
        </button>
        <button
          type="button"
          onClick={onExport}
          disabled={!canExport}
          className={cn(
            "px-4 py-1.5 text-[11px] font-label tracking-wider uppercase transition-opacity",
            canExport
              ? "bg-primary text-white hover:opacity-90"
              : "bg-white/10 text-white/20 cursor-not-allowed",
          )}
        >
          Export
        </button>
      </div>
    </nav>
  );
}
