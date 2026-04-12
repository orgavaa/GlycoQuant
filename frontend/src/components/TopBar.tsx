export type ViewId = "analysis" | "ranking";

interface TopBarProps {
  activeView: ViewId;
  onChangeView: (v: ViewId) => void;
}

export function TopBar({ activeView, onChangeView }: TopBarProps) {
  return (
    <nav style={{ height: 52, background: "#fff", borderBottom: "1px solid #e8e8e8", display: "flex", alignItems: "center", padding: "0 24px", flexShrink: 0, zIndex: 50 }}>
      <span style={{ fontWeight: 700, fontSize: 15, color: "#111", letterSpacing: -0.3 }}>GlycoQuant</span>
      <div style={{ display: "flex", gap: 32, marginLeft: 48 }}>
        <NavTab label="Analysis" active={activeView === "analysis"} onClick={() => onChangeView("analysis")} />
        <NavTab label="Ranking" active={activeView === "ranking"} onClick={() => onChangeView("ranking")} />
      </div>
      <div style={{ flex: 1 }} />
      <button style={{ fontFamily: "inherit", fontSize: 12, fontWeight: 500, color: "#999", background: "none", border: "1px solid #e8e8e8", borderRadius: 4, padding: "6px 14px", cursor: "pointer" }}>
        Export &darr;
      </button>
    </nav>
  );
}

function NavTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      background: "none", border: "none", borderBottom: active ? "2px solid #2166ac" : "2px solid transparent",
      color: active ? "#111" : "#999", fontSize: 13, fontWeight: 500, cursor: "pointer",
      padding: "16px 0", fontFamily: "inherit",
    }}>
      {label}
    </button>
  );
}
