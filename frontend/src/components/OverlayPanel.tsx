import { useState } from "react";

const CHANNELS = [
  { name: "dapi", abbr: "D", color: "#4A90D9" },
  { name: "glycocalyx", abbr: "W", color: "#4CAF50" },
  { name: "yap", abbr: "Y", color: "#E040FB" },
  { name: "paxillin", abbr: "P", color: "#FF9800" },
  { name: "actin", abbr: "A", color: "#B0BEC5" },
];

interface OverlayPanelProps {
  showSegmentation: boolean;
  onToggleSegmentation: () => void;
  activeOverlay: string | null;
  onSetOverlay: (v: string | null) => void;
  channelVisibility: Record<string, boolean>;
  onToggleChannel: (ch: string) => void;
  hovered: boolean;
}

export function OverlayPanel({
  showSegmentation, onToggleSegmentation,
  activeOverlay, onSetOverlay,
  channelVisibility, onToggleChannel, hovered,
}: OverlayPanelProps) {
  const [showAdv, setShowAdv] = useState(false);

  return (
    <div style={{
      position: "absolute", top: 16, left: 16, width: 150,
      background: "rgba(13,13,13,0.92)", backdropFilter: "blur(12px)",
      borderRadius: 6, padding: "14px 16px", zIndex: 10,
      opacity: hovered ? 1 : 0.35, transition: "opacity 200ms",
      border: "1px solid rgba(255,255,255,0.06)",
    }}>
      <div style={sectionLabelStyle}>Overlays</div>

      <Toggle label="Seg" active={showSegmentation} onClick={onToggleSegmentation} color="#0ff" />
      <Toggle label="Glyco" active={activeOverlay === "glyco"}
        onClick={() => onSetOverlay(activeOverlay === "glyco" ? null : "glyco")} color="#4CAF50" />
      <Toggle label="Mechano" active={activeOverlay === "mechano"}
        onClick={() => onSetOverlay(activeOverlay === "mechano" ? null : "mechano")} color="#E040FB" />

      <div onClick={() => setShowAdv(v => !v)} style={{
        fontSize: 11, color: "#666", cursor: "pointer", padding: "6px 0", marginTop: 4,
      }}>
        {showAdv ? "\u25be" : "\u25b8"} Advanced
      </div>

      <div style={{ ...sectionLabelStyle, marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        Channels
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {CHANNELS.map(ch => {
          const vis = channelVisibility[ch.name] ?? false;
          return (
            <div key={ch.name} onClick={() => onToggleChannel(ch.name)} style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer",
            }}>
              <div style={{
                width: 22, height: 22, borderRadius: 3, background: ch.color,
                opacity: vis ? 1 : 0.15,
                boxShadow: vis ? `0 0 8px ${ch.color}` : "none",
                transition: "opacity 0.15s, box-shadow 0.15s",
              }} />
              <span style={{ fontSize: 9, color: "#666", fontWeight: 500 }}>{ch.abbr}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "#666",
  marginBottom: 10, fontWeight: 600,
};

function Toggle({ label, active, onClick, color }: {
  label: string; active: boolean; onClick: () => void; color?: string;
}) {
  return (
    <div onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 10, padding: "5px 0", cursor: "pointer",
    }}>
      <div style={{
        width: 12, height: 12, borderRadius: "50%",
        border: `2px solid ${active ? (color ?? "#0ff") : "#444"}`,
        background: active ? (color ?? "#0ff") : "transparent",
        boxShadow: active ? `0 0 6px ${color ?? "#0ff"}` : "none",
        flexShrink: 0, transition: "all 0.15s",
      }} />
      <span style={{ fontSize: 12, color: active ? "#ddd" : "#888", fontWeight: active ? 500 : 400 }}>{label}</span>
    </div>
  );
}
