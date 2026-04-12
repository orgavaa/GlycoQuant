/**
 * FeatureGroup — collapsible feature list with z-scores.
 * Shows features sorted by |z| within a biological module.
 */
import { useState } from "react";

interface FeatureEntry {
  name: string;
  value: number;
  zScore: number;
}

interface FeatureGroupProps {
  groupName: string;
  features: FeatureEntry[];
  defaultOpen?: boolean;
}

function zColor(z: number): string {
  if (z > 1) return "#4CAF50";   // green = above 1 SD
  if (z < -1) return "#f44336";  // red = below 1 SD
  return "#888";                 // gray = within 1 SD
}

function zBadgeColor(z: number): string {
  if (z > 1) return "rgba(76,175,80,0.15)";
  if (z < -1) return "rgba(244,67,54,0.15)";
  return "rgba(255,255,255,0.05)";
}

export function FeatureGroup({ groupName, features, defaultOpen = false }: FeatureGroupProps) {
  const [open, setOpen] = useState(defaultOpen);

  // Sort by |z-score| descending
  const sorted = [...features].sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore));

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between py-1.5"
      >
        <span className="label">{groupName} ({features.length})</span>
        <span className="text-[8px] text-[#666]">{open ? "\u25be" : "\u25b8"}</span>
      </button>

      {open && (
        <div className="space-y-0 pb-2">
          {sorted.map((f) => (
            <div
              key={f.name}
              className="flex items-center justify-between py-[3px] border-b border-[#1a1a1a]"
            >
              <span className="text-[10px] text-[#888] truncate mr-2 flex-1">
                {f.name}
              </span>
              <span className="text-[11px] mono text-[#eee] shrink-0 w-16 text-right">
                {Number.isFinite(f.value) ? f.value.toFixed(3) : "\u2014"}
              </span>
              <span
                className="text-[9px] mono shrink-0 w-14 text-right px-1 rounded-sm ml-1"
                style={{
                  color: zColor(f.zScore),
                  backgroundColor: zBadgeColor(f.zScore),
                }}
              >
                z={Number.isFinite(f.zScore) ? (f.zScore >= 0 ? "+" : "") + f.zScore.toFixed(1) : "\u2014"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
