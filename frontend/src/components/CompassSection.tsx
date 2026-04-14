import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

interface CompassSectionProps {
  title: string;
  icon?: ReactNode;
  rightLabel?: string;
  children: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  description?: string;
}

/**
 * COMPASS-style section: white card with title + optional icon,
 * optional collapse toggle on the right.
 */
export function CompassSection({
  title,
  icon,
  rightLabel,
  children,
  collapsible = false,
  defaultOpen = true,
  description,
}: CompassSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="bg-white border border-gray-200 rounded-md mb-3">
      {/* Header */}
      <div
        className={`flex items-center px-4 py-3 ${collapsible ? "cursor-pointer hover:bg-gray-50" : ""}`}
        onClick={() => collapsible && setOpen(v => !v)}
      >
        {collapsible && (
          <span className="mr-2 text-gray-400">
            {open ? <ChevronDown size={14} strokeWidth={1.5} /> : <ChevronRight size={14} strokeWidth={1.5} />}
          </span>
        )}
        {icon && <span className="mr-2 text-gray-500 flex-shrink-0">{icon}</span>}
        <h3 className="text-[13px] font-semibold text-gray-900 flex-1">{title}</h3>
        {rightLabel && (
          <span className="text-[11px] text-gray-400 ml-3">{rightLabel}</span>
        )}
        {collapsible && (
          <span className="text-[11px] text-gray-300 ml-3">{open ? "collapse" : "expand"}</span>
        )}
      </div>

      {/* Content */}
      {(!collapsible || open) && (
        <div className="px-4 pb-4 border-t border-gray-100 pt-3">
          {description && (
            <p className="text-[11px] text-gray-500 leading-relaxed mb-3">{description}</p>
          )}
          {children}
        </div>
      )}
    </div>
  );
}

interface CompassPillProps {
  variant?: "default" | "blue" | "green" | "amber" | "red";
  children: ReactNode;
}

export function CompassPill({ variant = "default", children }: CompassPillProps) {
  const colors = {
    default: "bg-gray-100 text-gray-600",
    blue: "bg-blue-50 text-blue-700",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${colors[variant]}`}>
      {children}
    </span>
  );
}
