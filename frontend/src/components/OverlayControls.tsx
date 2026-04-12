/**
 * OverlayControls — floating panel, top-left of canvas.
 * Semi-transparent, fades when mouse leaves canvas area.
 */
// overlay controls — no local state needed

const CHANNEL_COLORS: Record<string, string> = {
  dapi: "var(--ch-dapi)",
  glycocalyx: "var(--ch-wga)",
  yap: "var(--ch-yap)",
  paxillin: "var(--ch-pax)",
  actin: "var(--ch-actin)",
};
const CHANNEL_ABBR: Record<string, string> = {
  dapi: "D",
  glycocalyx: "W",
  yap: "Y",
  paxillin: "P",
  actin: "A",
};

interface OverlayControlsProps {
  showSegmentation: boolean;
  onToggleSegmentation: () => void;
  activeOverlay: string | null; // "glyco" | "mechano" | null
  onSetOverlay: (overlay: string | null) => void;
  channelVisibility: Record<string, boolean>;
  onToggleChannel: (ch: string) => void;
  showAdvanced: boolean;
  onToggleAdvanced: () => void;
  advancedOverlays: Record<string, boolean>;
  onToggleAdvancedOverlay: (name: string) => void;
  hovered: boolean;
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
  advancedOverlays,
  onToggleAdvancedOverlay,
  hovered,
}: OverlayControlsProps) {
  return (
    <div
      className="absolute top-4 left-4 z-20 transition-opacity duration-200"
      style={{ opacity: hovered ? 0.95 : 0.3 }}
    >
      <div className="bg-[#111]/85 backdrop-blur-sm border border-[#333] p-3 w-[140px] space-y-3">
        <div className="label border-b border-[#333] pb-1.5">Overlays</div>

        <Toggle label="Segmentation" active={showSegmentation} onToggle={onToggleSegmentation} />
        <Toggle
          label="Glycocalyx"
          active={activeOverlay === "glyco"}
          onToggle={() => onSetOverlay(activeOverlay === "glyco" ? null : "glyco")}
        />
        <Toggle
          label="Mechano"
          active={activeOverlay === "mechano"}
          onToggle={() => onSetOverlay(activeOverlay === "mechano" ? null : "mechano")}
        />

        <button
          type="button"
          onClick={onToggleAdvanced}
          className="text-[9px] text-[#888] hover:text-[#ccc] transition-colors flex items-center gap-1"
        >
          <span className="text-[8px]">{showAdvanced ? "▾" : "▸"}</span> Advanced
        </button>

        {showAdvanced && (
          <div className="space-y-2 pl-2 border-l border-[#333]">
            <Toggle label="FA Detection" active={!!advancedOverlays.fa} onToggle={() => onToggleAdvancedOverlay("fa")} />
            <Toggle label="YAP Compartment" active={!!advancedOverlays.yap} onToggle={() => onToggleAdvancedOverlay("yap")} />
            <Toggle label="Peri Ring" active={!!advancedOverlays.ring} onToggle={() => onToggleAdvancedOverlay("ring")} />
          </div>
        )}

        <div className="border-t border-[#333] pt-2">
          <div className="label mb-1.5">Channels</div>
          <div className="flex gap-1.5">
            {Object.entries(CHANNEL_COLORS).map(([ch, color]) => (
              <button
                key={ch}
                type="button"
                onClick={() => onToggleChannel(ch)}
                className="flex flex-col items-center gap-0.5"
              >
                <div
                  className="w-4 h-4 transition-all"
                  style={{
                    backgroundColor: color,
                    opacity: channelVisibility[ch] ? 1 : 0.2,
                    boxShadow: channelVisibility[ch] ? `0 0 6px ${color}` : "none",
                  }}
                />
                <span className="text-[8px] text-[#888]">{CHANNEL_ABBR[ch]}</span>
              </button>
            ))}
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
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex items-center justify-between w-full text-[10px]"
    >
      <span className={active ? "text-[#eee]" : "text-[#666]"}>{label}</span>
      <div
        className={`w-6 h-3 rounded-full flex items-center px-0.5 transition-colors ${
          active ? "bg-[#343dff]" : "bg-[#333]"
        }`}
      >
        <div
          className={`w-2 h-2 bg-white rounded-full transition-all ${
            active ? "ml-auto" : ""
          }`}
        />
      </div>
    </button>
  );
}
