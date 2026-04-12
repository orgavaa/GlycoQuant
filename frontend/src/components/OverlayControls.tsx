/**
 * OverlayControls — floating panel, top-left of canvas.
 * Semi-transparent with backdrop blur. Fades when mouse leaves canvas.
 */

const CHANNEL_META: { name: string; abbr: string; color: string }[] = [
  { name: "dapi", abbr: "D", color: "#4A90D9" },
  { name: "glycocalyx", abbr: "W", color: "#4CAF50" },
  { name: "yap", abbr: "Y", color: "#E040FB" },
  { name: "paxillin", abbr: "P", color: "#FF9800" },
  { name: "actin", abbr: "A", color: "#B0BEC5" },
];

interface OverlayControlsProps {
  showSegmentation: boolean;
  onToggleSegmentation: () => void;
  activeOverlay: string | null;
  onSetOverlay: (overlay: string | null) => void;
  channelVisibility: Record<string, boolean>;
  onToggleChannel: (ch: string) => void;
  showAdvanced: boolean;
  onToggleAdvanced: () => void;
  advancedOverlays: Record<string, boolean>;
  onToggleAdvancedOverlay: (name: string) => void;
  showScaleBar: boolean;
  onToggleScaleBar: () => void;
  showCellLabels: boolean;
  onToggleCellLabels: () => void;
  hovered: boolean;
  channelWarnings?: string[];
}

export function OverlayControls({
  showSegmentation,
  onToggleSegmentation,
  activeOverlay,
  onSetOverlay,
  channelVisibility,
  onToggleChannel,
  showAdvanced,
  onToggleAdvanced,
  showScaleBar,
  onToggleScaleBar,
  showCellLabels,
  onToggleCellLabels,
  hovered,
  channelWarnings = [],
}: OverlayControlsProps) {
  return (
    <div
      className="absolute top-4 left-4 z-20 transition-opacity duration-200 pointer-events-auto"
      style={{ opacity: hovered ? 0.95 : 0.3 }}
    >
      <div
        className="w-[140px] p-3 space-y-3"
        style={{
          background: "rgba(17,17,17,0.85)",
          backdropFilter: "blur(8px)",
          borderRadius: "4px",
        }}
      >
        <div className="label border-b border-[#333] pb-1.5">Overlays</div>

        <Toggle
          label="Seg"
          active={showSegmentation}
          onToggle={onToggleSegmentation}
          color="#00ffff"
        />
        <Toggle
          label="Glyco"
          active={activeOverlay === "glyco"}
          onToggle={() => onSetOverlay(activeOverlay === "glyco" ? null : "glyco")}
          color="#4CAF50"
        />
        <Toggle
          label="Mechano"
          active={activeOverlay === "mechano"}
          onToggle={() => onSetOverlay(activeOverlay === "mechano" ? null : "mechano")}
          color="#E040FB"
        />

        <button
          type="button"
          onClick={onToggleAdvanced}
          className="text-[9px] text-[#666] hover:text-[#aaa] transition-colors flex items-center gap-1"
        >
          <span className="text-[8px]">{showAdvanced ? "\u25be" : "\u25b8"}</span> Advanced
        </button>

        {showAdvanced && (
          <div className="space-y-2 pl-2 border-l border-[#333]">
            <Toggle label="Scale Bar" active={showScaleBar} onToggle={onToggleScaleBar} />
            <Toggle label="Cell Labels" active={showCellLabels} onToggle={onToggleCellLabels} />
          </div>
        )}

        <div className="border-t border-[#333] pt-2">
          <div className="label mb-1.5">Channels</div>
          <div className="flex gap-1.5">
            {CHANNEL_META.map((ch) => {
              const isWarned = channelWarnings.some(
                (w) => w.toLowerCase().includes(ch.name),
              );
              return (
                <button
                  key={ch.name}
                  type="button"
                  onClick={() => onToggleChannel(ch.name)}
                  className="flex flex-col items-center gap-0.5 relative"
                >
                  <div
                    className="w-[18px] h-[18px] transition-all"
                    style={{
                      backgroundColor: ch.color,
                      opacity: channelVisibility[ch.name] ? 1 : 0.15,
                      boxShadow: channelVisibility[ch.name]
                        ? `0 0 6px ${ch.color}`
                        : "none",
                    }}
                  />
                  {isWarned && (
                    <span className="absolute -top-0.5 -right-0.5 text-[7px] text-[#888]">~</span>
                  )}
                  <span className="text-[8px] text-[#666]">{ch.abbr}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function Toggle({
  label,
  active,
  onToggle,
  color,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
  color?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex items-center gap-2 w-full text-[10px]"
    >
      <div
        className="w-3 h-3 rounded-full border transition-all shrink-0"
        style={{
          borderColor: active ? (color ?? "#00ffff") : "#444",
          backgroundColor: active ? (color ?? "#00ffff") : "transparent",
          boxShadow: active ? `0 0 4px ${color ?? "#00ffff"}` : "none",
        }}
      />
      <span className={active ? "text-[#ccc]" : "text-[#666]"}>{label}</span>
    </button>
  );
}
