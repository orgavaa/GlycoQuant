import type { ReactNode } from "react";
import { Eye, Layers, Radio, ScanLine, Users } from "lucide-react";

const CHANNELS = [
  { name: "dapi", label: "DAPI", color: "#2166ac" },
  { name: "glycocalyx", label: "WGA", color: "#1b7837" },
  { name: "yap", label: "YAP", color: "#762a83" },
  { name: "paxillin", label: "Paxillin", color: "#b35806" },
  { name: "actin", label: "Actin", color: "#4d4d4d" },
];

type CellFilter = "all" | "analysis_ready" | "qc_failed";

interface Props {
  showSegmentation: boolean;
  onToggleSegmentation: () => void;
  activeOverlay: string | null;
  onSetOverlay: (v: string | null) => void;
  channelVisibility: Record<string, boolean>;
  onToggleChannel: (ch: string) => void;
  cellFilter: CellFilter;
  onSetCellFilter: (v: CellFilter) => void;
  rawCellCount: number;
  readyCellCount: number;
}

export function OverlayPanel({
  showSegmentation,
  onToggleSegmentation,
  activeOverlay,
  onSetOverlay,
  channelVisibility,
  onToggleChannel,
  cellFilter,
  onSetCellFilter,
  rawCellCount,
  readyCellCount,
}: Props) {
  const qcFailed = Math.max(0, rawCellCount - readyCellCount);

  return (
    <div className="absolute left-4 top-4 z-10 w-[236px] rounded-lg border border-gray-200 bg-white/95 p-3 text-gray-900 shadow-lg backdrop-blur">
      <div className="mb-3 flex items-center gap-2">
        <SlabIcon icon={<ScanLine size={14} strokeWidth={1.8} />} />
        <div>
          <div className="text-[12px] font-semibold text-gray-950">View controls</div>
          <div className="text-[10px] text-gray-500">
            {readyCellCount} ready / {rawCellCount} masks
          </div>
        </div>
      </div>

      <ControlSection icon={<Eye size={13} strokeWidth={1.8} />} label="Overlays">
        <ToggleRow
          label="Segmentation"
          active={showSegmentation}
          onClick={onToggleSegmentation}
          kind="checkbox"
        />
        <ToggleRow
          label="WGA signal"
          active={activeOverlay === "glyco"}
          onClick={() => onSetOverlay(activeOverlay === "glyco" ? null : "glyco")}
          kind="radio"
        />
        <ToggleRow
          label="Mechano score"
          active={activeOverlay === "mechano"}
          onClick={() => onSetOverlay(activeOverlay === "mechano" ? null : "mechano")}
          kind="radio"
        />
      </ControlSection>

      <ControlSection icon={<Layers size={13} strokeWidth={1.8} />} label="Channels">
        <div className="grid grid-cols-2 gap-1.5">
          {CHANNELS.map((ch) => {
            const vis = channelVisibility[ch.name] ?? false;
            return (
              <button
                key={ch.name}
                type="button"
                onClick={() => onToggleChannel(ch.name)}
                className={`flex min-w-0 items-center gap-1.5 rounded-md border px-2 py-1.5 text-left text-[11px] transition ${
                  vis
                    ? "border-gray-300 bg-gray-50 text-gray-950"
                    : "border-gray-200 bg-white text-gray-400 hover:bg-gray-50"
                }`}
                title={`${vis ? "Hide" : "Show"} ${ch.label}`}
              >
                <span
                  className="h-2.5 w-2.5 flex-shrink-0 rounded-sm ring-1 ring-black/10"
                  style={{ background: ch.color, opacity: vis ? 1 : 0.25 }}
                />
                <span className="truncate">{ch.label}</span>
              </button>
            );
          })}
        </div>
      </ControlSection>

      <ControlSection icon={<Users size={13} strokeWidth={1.8} />} label="Cell visibility">
        <div className="grid grid-cols-3 gap-1 rounded-md bg-gray-100 p-1">
          <SegmentButton
            label="Ready"
            count={readyCellCount}
            active={cellFilter === "analysis_ready"}
            onClick={() => onSetCellFilter("analysis_ready")}
          />
          <SegmentButton
            label="All"
            count={rawCellCount}
            active={cellFilter === "all"}
            onClick={() => onSetCellFilter("all")}
          />
          <SegmentButton
            label="QC"
            count={qcFailed}
            active={cellFilter === "qc_failed"}
            onClick={() => onSetCellFilter("qc_failed")}
          />
        </div>
      </ControlSection>
    </div>
  );
}

function SlabIcon({ icon }: { icon: ReactNode }) {
  return (
    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-gray-700">
      {icon}
    </span>
  );
}

function ControlSection({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-gray-100 py-3 last:pb-0">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase text-gray-400">
        {icon}
        <span>{label}</span>
      </div>
      {children}
    </section>
  );
}

function ToggleRow({
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
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[11px] text-gray-700 transition hover:bg-gray-50"
    >
      {kind === "radio" ? (
        <Radio
          size={12}
          strokeWidth={2}
          className={active ? "text-gray-950" : "text-gray-300"}
          fill={active ? "currentColor" : "none"}
        />
      ) : (
        <span
          className={`flex h-3 w-3 items-center justify-center rounded border ${
            active ? "border-gray-950 bg-gray-950" : "border-gray-300 bg-white"
          }`}
        >
          {active && <span className="h-1.5 w-1.5 rounded-sm bg-white" />}
        </span>
      )}
      <span className={active ? "font-medium text-gray-950" : ""}>{label}</span>
    </button>
  );
}

function SegmentButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded px-1.5 py-1 text-[10px] font-medium transition ${
        active ? "bg-white text-gray-950 shadow-sm ring-1 ring-gray-200" : "text-gray-500 hover:text-gray-900"
      }`}
    >
      <span>{label}</span>
      <span className="ml-1 tabular-nums text-gray-400">{count}</span>
    </button>
  );
}
