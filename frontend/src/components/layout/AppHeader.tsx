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
  { id: "compare", label: "Condition Compare" },
  { id: "methods", label: "Methods & QC" },
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
    <nav className="fixed top-0 left-0 w-full z-50 flex justify-between items-center px-6 h-14 bg-surface/80 backdrop-blur-md ghost-border-b">
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
          <span className="text-xl font-bold tracking-tighter text-on-surface font-headline group-hover:text-primary transition-colors">
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
                  "font-label text-sm pb-1 transition-colors relative",
                  isActive
                    ? "text-primary border-b-2 border-primary font-medium"
                    : "text-on-surface-variant hover:text-primary",
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
              ? "text-on-surface hover:bg-surface-container"
              : "text-on-surface-variant/50 cursor-not-allowed",
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
              ? "bg-primary text-on-primary hover:opacity-90"
              : "bg-surface-container-highest text-on-surface-variant cursor-not-allowed",
          )}
        >
          Export
        </button>
      </div>
    </nav>
  );
}
