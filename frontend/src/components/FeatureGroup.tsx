import { useState } from "react";
import { Badge } from "./Badge";

interface Feature {
  name: string;
  value: number;
  zScore: number;
}

interface FeatureGroupProps {
  name: string;
  features: Feature[];
  defaultOpen?: boolean;
}

export function FeatureGroup({ name, features, defaultOpen = false }: FeatureGroupProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="mb-2.5">
      <div onClick={() => setOpen(v => !v)} className="flex items-center justify-between cursor-pointer py-2">
        <span className="text-[11px] font-semibold text-gray-400 tracking-[1.5px] uppercase">
          {name} ({features.length})
        </span>
        <span className="text-[12px] text-gray-300">{open ? "\u25BE" : "\u25B8"}</span>
      </div>
      {open && features.map(f => (
        <div key={f.name} className="flex items-center py-1 text-[11px] border-b border-gray-100">
          <span className="text-gray-500 flex-1 overflow-hidden text-ellipsis whitespace-nowrap mr-2">{f.name}</span>
          <span className="text-gray-800 font-medium w-[60px] text-right flex-shrink-0" style={{ fontFeatureSettings: "'tnum'" }}>
            {Number.isFinite(f.value) ? f.value.toFixed(3) : "\u2014"}
          </span>
          <span className="w-[54px] text-right flex-shrink-0 ml-1.5">
            <Badge z={f.zScore} />
          </span>
        </div>
      ))}
    </div>
  );
}
