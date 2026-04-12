import { useMemo, useState } from "react";
import { MicroscopyCanvas } from "@/components/MicroscopyCanvas";
import { OverlayPanel } from "@/components/OverlayPanel";
import { RightRail } from "@/components/RightRail";
import type { JobResult } from "@/lib/api";
import { extractFeatures } from "@/lib/canvas/extract";

export function OverviewView({ result }: { result: JobResult }) {
  const [showSeg, setShowSeg] = useState(true);
  const [activeOverlay, setActiveOverlay] = useState<string | null>(null);
  const [hovered, setHovered] = useState(false);
  const [channelVis, setChannelVis] = useState<Record<string, boolean>>({ dapi: true, glycocalyx: true, yap: false, paxillin: false, actin: true });

  const cells = useMemo(() => extractFeatures(result.features_df_json), [result.features_df_json]);

  return (
    <div style={{ display: "flex", height: "100%" }}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
        <MicroscopyCanvas result={result} showSegmentation={showSeg} cells={cells} />
        <OverlayPanel
          showSegmentation={showSeg} onToggleSegmentation={() => setShowSeg(v => !v)}
          activeOverlay={activeOverlay} onSetOverlay={setActiveOverlay}
          channelVisibility={channelVis} onToggleChannel={ch => setChannelVis(p => ({ ...p, [ch]: !p[ch] }))}
          hovered={hovered}
        />
      </div>
      <RightRail result={result} cells={cells} />
    </div>
  );
}
