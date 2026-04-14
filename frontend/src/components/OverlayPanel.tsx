const CHANNELS = [
  { name: "dapi", label: "DAPI", color: "#2166ac" },
  { name: "glycocalyx", label: "Glyco", color: "#1b7837" },
  { name: "yap", label: "YAP", color: "#762a83" },
  { name: "paxillin", label: "Paxillin", color: "#b35806" },
  { name: "actin", label: "Actin", color: "#4d4d4d" },
];

interface Props {
  showSegmentation: boolean;
  onToggleSegmentation: () => void;
  activeOverlay: string | null;
  onSetOverlay: (v: string | null) => void;
  channelVisibility: Record<string, boolean>;
  onToggleChannel: (ch: string) => void;
}

export function OverlayPanel({ showSegmentation, onToggleSegmentation, activeOverlay, onSetOverlay, channelVisibility, onToggleChannel }: Props) {
  return (
    <div className="absolute top-3 left-3 w-[172px] z-10 bg-white/[0.92] backdrop-blur-xl border border-black/[0.06] rounded-lg shadow-md p-[14px]">
      <SectionLabel>Overlays</SectionLabel>
      <div className="space-y-1 mb-1">
        <Toggle label="Segmentation" active={showSegmentation} onClick={onToggleSegmentation} kind="checkbox" />
        <Toggle label="Glycocalyx" active={activeOverlay === "glyco"} onClick={() => onSetOverlay(activeOverlay === "glyco" ? null : "glyco")} kind="radio" />
        <Toggle label="Mechano score" active={activeOverlay === "mechano"} onClick={() => onSetOverlay(activeOverlay === "mechano" ? null : "mechano")} kind="radio" />
      </div>

      <div className="mt-2.5 pt-2.5 border-t border-gray-100">
        <SectionLabel>Channels</SectionLabel>
        <div className="flex flex-col gap-1">
          {CHANNELS.map(ch => {
            const vis = channelVisibility[ch.name] ?? false;
            return (
              <div
                key={ch.name}
                onClick={() => onToggleChannel(ch.name)}
                className="flex items-center gap-2 py-0.5 cursor-pointer"
              >
                <div
                  className="w-3 h-3 rounded-sm flex-shrink-0 transition-opacity"
                  style={{ background: ch.color, opacity: vis ? 1 : 0.2 }}
                />
                <span className={`text-[11px] font-medium transition-colors ${vis ? "text-gray-700" : "text-gray-400"}`}>
                  {ch.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-semibold text-gray-400 tracking-[1.5px] uppercase mb-2">{children}</div>;
}

function Toggle({
  label,
  active,
  onClick,
  kind,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  kind: "radio" | "checkbox";
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <input
        type={kind}
        checked={active}
        onChange={onClick}
        className="w-3 h-3 text-blue-600 focus:ring-blue-500 cursor-pointer"
      />
      <span className={`text-[11px] transition-colors ${active ? "text-gray-900 font-medium" : "text-gray-600"}`}>
        {label}
      </span>
    </label>
  );
}
