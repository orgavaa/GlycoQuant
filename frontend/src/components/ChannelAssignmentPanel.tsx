import type { DemoChannelSlotSource } from "@/lib/api";

const CANONICAL_ORDER = ["dapi", "glycocalyx", "yap", "paxillin", "actin"];

const ROLE_OPTIONS = [
  { value: "dapi", label: "DAPI (nuclei)" },
  { value: "glycocalyx", label: "WGA-lectin (glycocalyx)" },
  { value: "yap", label: "YAP antibody" },
  { value: "paxillin", label: "Paxillin (focal adhesions)" },
  { value: "actin", label: "Phalloidin (actin)" },
  { value: "other", label: "Other" },
  { value: "unknown", label: "Unknown / skip" },
];

const ROLE_COLORS: Record<string, string> = {
  dapi: "#2166ac",
  glycocalyx: "#1b7837",
  yap: "#762a83",
  paxillin: "#b35806",
  actin: "#4d4d4d",
  other: "#9ca3af",
  unknown: "#d1d5db",
};

interface Props {
  slotSources: Record<string, DemoChannelSlotSource> | null;
  nChannels: number;
  value: Record<string, string>;
  onChange: (assignments: Record<string, string>) => void;
  disabled?: boolean;
}

export function ChannelAssignmentPanel({ slotSources, nChannels, value, onChange, disabled }: Props) {
  const hasDapi = Object.values(value).includes("dapi");

  return (
    <div className="space-y-2">
      <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-[1px]">
        Channel assignment
      </div>

      {Array.from({ length: Math.min(nChannels, 5) }, (_, i) => {
        const idx = String(i);
        const currentRole = value[idx] ?? "unknown";
        const source = slotSources?.[CANONICAL_ORDER[i]];
        const isSubstitute = source && !source.matches_labouesse_protocol;

        return (
          <div key={i} className="flex items-center gap-2">
            {/* Color dot */}
            <div
              className="w-3 h-3 rounded-sm flex-shrink-0"
              style={{ background: ROLE_COLORS[currentRole] ?? "#d1d5db" }}
            />

            {/* Channel index */}
            <span className="text-[11px] text-gray-400 w-[28px] flex-shrink-0 font-medium">
              Ch {i}
            </span>

            {/* Role dropdown */}
            <select
              value={currentRole}
              onChange={(e) => onChange({ ...value, [idx]: e.target.value })}
              disabled={disabled}
              className="flex-1 bg-white border border-gray-300 rounded-md px-2 py-1 text-[11px] text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {ROLE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>

            {/* Synthetic badge */}
            {isSubstitute && (
              <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 flex-shrink-0">
                Substitute
              </span>
            )}
          </div>
        );
      })}

      {/* Biological identity hints from manifest */}
      {slotSources && (
        <div className="mt-1 space-y-0.5">
          {Array.from({ length: Math.min(nChannels, 5) }, (_, i) => {
            const source = slotSources[CANONICAL_ORDER[i]];
            if (!source) return null;
            return (
              <div key={i} className="text-[9px] text-gray-400 pl-[52px]">
                Ch {i}: {source.biological_identity}
                {source.note && <span className="italic"> — {source.note.slice(0, 80)}{source.note.length > 80 ? "..." : ""}</span>}
              </div>
            );
          })}
        </div>
      )}

      {/* DAPI warning */}
      {!hasDapi && (
        <div className="text-[10px] text-red-600 font-medium mt-1">
          DAPI channel is required for nuclear segmentation.
        </div>
      )}
    </div>
  );
}

/**
 * Build default channel assignments from demo slot_sources.
 * Real channels get their canonical role; synthetic ones get "unknown".
 */
export function defaultAssignmentsFromManifest(
  slotSources: Record<string, DemoChannelSlotSource> | null,
  nChannels: number = 5,
): Record<string, string> {
  const assignments: Record<string, string> = {};
  for (let i = 0; i < Math.min(nChannels, 5); i++) {
    const canonical = CANONICAL_ORDER[i];
    const source = slotSources?.[canonical];
    if (source && source.matches_labouesse_protocol) {
      assignments[String(i)] = canonical;
    } else if (source) {
      assignments[String(i)] = "unknown";
    } else {
      assignments[String(i)] = canonical;
    }
  }
  return assignments;
}

/**
 * Build default positional assignments for uploads.
 */
export function defaultPositionalAssignments(nChannels: number = 5): Record<string, string> {
  const assignments: Record<string, string> = {};
  for (let i = 0; i < Math.min(nChannels, 5); i++) {
    assignments[String(i)] = CANONICAL_ORDER[i];
  }
  return assignments;
}
