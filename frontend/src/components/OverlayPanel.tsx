/**
 * OverlayPanel — floating controls, top-left of canvas.
 */
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
      position: "absolute", top: 16, left: 16, width: 130,
      background: "rgba(17,17,17,0.88)", backdropFilter: "blur(8px)",
      borderRadius: 3, padding: 12, zIndex: 10,
      opacity: hovered ? 0.95 : 0.3, transition: "opacity 200ms",
    }}>
      <div style={labelStyle}>Overlays</div>

      <Toggle label="Seg" active={showSegmentation} onClick={onToggleSegmentation} color="#0ff" />
      <Toggle label="Glyco" active={activeOverlay === "glyco"}
        onClick={() => onSetOverlay(activeOverlay === "glyco" ? null : "glyco")} color="#4CAF50" />
      <Toggle label="Mechano" active={activeOverlay === "mechano"}
        onClick={() => onSetOverlay(activeOverlay === "mechano" ? null : "mechano")} color="#E040FB" />

      <div onClick={() => setShowAdv(v => !v)}
        style={{ fontSize: 9, color: "#555", cursor: "pointer", padding: "4px 0" }}>
        {showAdv ? "\u25be" : "\u25b8"} Advanced
      </div>

      <div style={labelStyle}>Channels</div>
      <div style={{ display: "flex", gap: 5 }}>
        {CHANNELS.map(ch => {
          const vis = channelVisibility[ch.name] ?? false;
          return (
            <div key={ch.name} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
              <div
                onClick={() => onToggleChannel(ch.name)}
                style={{
                  width: 20, height: 20, borderRadius: 2, cursor: "pointer",
                  background: ch.color, opacity: vis ? 1 : 0.2,
                  boxShadow: vis ? `0 0 6px ${ch.color}` : "none",
                  transition: "opacity 0.15s, box-shadow 0.15s",
                }}
              />
              <span style={{ fontSize: 8, color: "#555" }}>{ch.abbr}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 9, textTransform: "uppercase", letterSpacing: 1.5, color: "#555", marginBottom: 8,
};

function Toggle({ label, active, onClick, color }: {
  label: string; active: boolean; onClick: () => void; color?: string;
}) {
  return (
    <div onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", cursor: "pointer" }}>
      <div style={{
        width: 10, height: 10, borderRadius: "50%",
        border: `1.5px solid ${active ? (color ?? "#0ff") : "#444"}`,
        background: active ? (color ?? "#0ff") : "transparent",
        boxShadow: active ? `0 0 6px ${color ?? "#0ff"}` : "none",
        flexShrink: 0,
      }} />
      <span style={{ fontSize: 11, color: active ? "#ccc" : "#999" }}>{label}</span>
    </div>
  );
}
