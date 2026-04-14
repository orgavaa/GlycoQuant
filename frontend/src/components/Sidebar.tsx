import { Activity, BookOpen, BarChart2, Layers, Database, Brain, FlaskConical, PanelLeftClose, PanelLeft } from "lucide-react";

export type ViewId = "analysis" | "ranking";

interface SidebarProps {
  activeView: ViewId;
  onChangeView: (v: ViewId) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

interface NavItem {
  id: string;
  label: string;
  icon: typeof Activity;
  view?: ViewId;
  disabled?: boolean;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: "Design",
    items: [
      { id: "home", label: "Home", icon: Activity, view: "analysis" },
      { id: "methods", label: "Methods", icon: BookOpen, disabled: true },
      { id: "results", label: "Results", icon: BarChart2, disabled: true },
    ],
  },
  {
    label: "Library",
    items: [
      { id: "panels", label: "Panels", icon: Layers, view: "ranking" },
      { id: "datasets", label: "Datasets", icon: Database, disabled: true },
    ],
  },
  {
    label: "Models",
    items: [
      { id: "scoring", label: "Scoring", icon: Brain, disabled: true },
      { id: "research", label: "Research", icon: FlaskConical, disabled: true },
    ],
  },
];

export function Sidebar({ activeView, onChangeView, collapsed, onToggleCollapsed }: SidebarProps) {
  return (
    <aside
      className={`flex flex-col bg-white border-r border-gray-200 flex-shrink-0 transition-all duration-200 ${
        collapsed ? "w-[56px]" : "w-[200px]"
      }`}
    >
      {/* Logo + collapse button */}
      <div className="h-14 flex items-center px-3 border-b border-gray-200 flex-shrink-0">
        {!collapsed && (
          <div className="flex items-center gap-1.5 flex-1">
            <img src="/logo.png" alt="GlycoQuant" className="h-5 w-5 rounded" draggable={false} />
            <span className="text-[13px] font-bold text-gray-900 tracking-tight">GlycoQuant</span>
          </div>
        )}
        {collapsed && (
          <img src="/logo.png" alt="GlycoQuant" className="h-5 w-5 rounded mx-auto" draggable={false} />
        )}
        <button
          onClick={onToggleCollapsed}
          className="text-gray-400 hover:text-gray-700 transition-colors p-1 rounded hover:bg-gray-50 flex-shrink-0"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeft size={14} strokeWidth={1.5} /> : <PanelLeftClose size={14} strokeWidth={1.5} />}
        </button>
      </div>

      {/* Nav sections */}
      <nav className="flex-1 overflow-y-auto py-3">
        {NAV_SECTIONS.map(section => (
          <div key={section.label} className="mb-4">
            {!collapsed && (
              <div className="px-3 mb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-[1px]">
                {section.label}
              </div>
            )}
            {section.items.map(item => {
              const isActive = item.view === activeView;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => item.view && !item.disabled && onChangeView(item.view)}
                  disabled={item.disabled}
                  className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] transition-colors ${
                    isActive
                      ? "bg-blue-50 text-blue-700 border-l-2 border-blue-600 -ml-[2px] pl-[10px]"
                      : item.disabled
                      ? "text-gray-300 cursor-not-allowed"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  } ${collapsed ? "justify-center" : ""}`}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon size={14} strokeWidth={1.5} className="flex-shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Version label */}
      {!collapsed && (
        <div className="px-3 py-2 text-[9px] text-gray-300 border-t border-gray-100">
          v0.4
        </div>
      )}
    </aside>
  );
}
