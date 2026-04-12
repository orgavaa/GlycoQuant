import { useState } from "react";

const CHANNELS = [
  { name: "dapi", abbr: "D", color: "#2166ac" },
  { name: "glycocalyx", abbr: "G", color: "#1b7837" },
  { name: "yap", abbr: "Y", color: "#762a83" },
  { name: "paxillin", abbr: "P", color: "#b35806" },
  { name: "actin", abbr: "A", color: "#4d4d4d" },
];

interface Props {
  showSegmentation: boolean;
  onToggleSegmentation: () => void;
  activeOverlay: string | null;
  onSetOverlay: (v: string | null) => void;
  channelVisibility: Record<string, boolean>;
  onToggleChannel: (ch: string) => void;
  hovered: boolean;
}

export function OverlayPanel({ showSegmentation, onToggleSegmentation, activeOverlay, onSetOverlay, channelVisibility, onToggleChannel, hovered }: Props) {
  const [showAdv, setShowAdv] = useState(false);

  return (
    <div style={{
      position: "absolute", top: 12, left: 12, width: 140, zIndex: 10,
      background: "rgba(255,255,255,0.92)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
      border: "1px solid rgba(0,0,0,0.08)", borderRadius: 6, boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
      padding: "12px 14px", opacity: hovered ? 1 : 0.4, transition: "opacity 200ms",
    }}>
      <SectionLabel>Overlays</SectionLabel>
      <Toggle label="Segmentation" active={showSegmentation} onClick={onToggleSegmentation} />
      <Toggle label="Glycocalyx" active={activeOverlay === "glyco"} onClick={() => onSetOverlay(activeOverlay === "glyco" ? null : "glyco")} />
      <Toggle label="Mechano score" active={activeOverlay === "mechano"} onClick={() => onSetOverlay(activeOverlay === "mechano" ? null : "mechano")} />
      <div onClick={() => setShowAdv(v => !v)} style={{ fontSize: 10, color: "#bbb", cursor: "pointer", padding: "4px 0", marginTop: 2 }}>
        {showAdv ? "\u25be" : "\u25b8"} Advanced
      </div>
      <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #f0f0f0" }}>
        <SectionLabel>Channels</SectionLabel>
        <div style={{ display: "flex", gap: 5 }}>
          {CHANNELS.map(ch => {
            const vis = channelVisibility[ch.name] ?? false;
            return (
              <div key={ch.name} onClick={() => onToggleChannel(ch.name)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, cursor: "pointer" }}>
                <div style={{ width: 18, height: 18, borderRadius: 3, background: ch.color, opacity: vis ? 1 : 0.2, transition: "opacity 0.15s" }} />
                <span style={{ fontSize: 7, fontWeight: 600, color: "#bbb", textTransform: "uppercase" as const }}>{ch.abbr}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 10, fontWeight: 600, color: "#bbb", letterSpacing: 1.5, textTransform: "uppercase" as const, marginBottom: 8 }}>{children}</div>;
}

function Toggle({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <div onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", cursor: "pointer" }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", border: `1.5px solid ${active ? "#2166ac" : "#ccc"}`, background: active ? "#2166ac" : "transparent", flexShrink: 0 }} />
      <span style={{ fontSize: 11, fontWeight: 500, color: "#666" }}>{label}</span>
    </div>
  );
}
