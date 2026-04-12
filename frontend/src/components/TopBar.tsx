/**
 * TopBar — 40px nav. Logo left, view tabs center, Export right.
 */
export type ViewId = "overview" | "single" | "compare" | "prioritization" | "experiment";

const TABS: { id: ViewId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "single", label: "Single Cell" },
  { id: "compare", label: "Compare" },
  { id: "prioritization", label: "Ranking" },
  { id: "experiment", label: "Experiment" },
];

interface TopBarProps {
  activeView: ViewId;
  onChangeView: (v: ViewId) => void;
  hasResult: boolean;
}

export function TopBar({ activeView, onChangeView, hasResult }: TopBarProps) {
  return (
    <nav style={{
      height: 40, background: "#0d0d0d", borderBottom: "1px solid #1a1a1a",
      display: "flex", alignItems: "center", padding: "0 16px", gap: 40,
      flexShrink: 0, zIndex: 50,
    }}>
      <button
        onClick={() => onChangeView("overview")}
        style={{ background: "none", border: "none", color: "#eee", fontSize: 13, fontWeight: 600,
          cursor: "pointer", fontFamily: "inherit", letterSpacing: -0.5 }}
      >
        &#9679; GlycoQuant
      </button>

      <div style={{ display: "flex", gap: 24 }}>
        {TABS.map(t => {
          const isActive = t.id === activeView || (t.id === "overview" && activeView === "single");
          const disabled = !hasResult && t.id !== "overview";
          return (
            <button
              key={t.id}
              onClick={() => !disabled && onChangeView(t.id)}
              disabled={disabled}
              style={{
                background: "none", border: "none", borderBottom: isActive ? "2px solid #4A90D9" : "2px solid transparent",
                color: isActive ? "#eee" : disabled ? "#333" : "#555",
                fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase" as const,
                cursor: disabled ? "not-allowed" : "pointer", padding: "12px 0",
                fontFamily: "inherit",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div style={{ flex: 1 }} />

      <button style={{
        background: "#1a1a1a", border: "none", color: "#888", fontSize: 10,
        letterSpacing: 1, textTransform: "uppercase" as const, padding: "5px 12px",
        cursor: "pointer", fontFamily: "inherit",
      }}>
        Export
      </button>
    </nav>
  );
}
