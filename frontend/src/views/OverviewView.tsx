/**
 * OverviewView — the primary instrument view.
 * Canvas (flex-1) + OverlayPanel + RightRail (320px).
 */
import { useMemo, useState } from "react";
import { MicroscopyImage } from "@/components/MicroscopyImage";
import { OverlayPanel } from "@/components/OverlayPanel";
import { RightRail } from "@/components/RightRail";
import type { JobResult } from "@/lib/api";
import { extractFeatures, type CellFeatures } from "@/lib/canvas/extract";

interface OverviewViewProps {
  result: JobResult;
}

export function OverviewView({ result }: OverviewViewProps) {
  const [showSeg, setShowSeg] = useState(true);
  const [activeOverlay, setActiveOverlay] = useState<string | null>(null);
  const [canvasHovered, setCanvasHovered] = useState(false);
  const [channelVis, setChannelVis] = useState<Record<string, boolean>>({
    dapi: true, glycocalyx: true, yap: false, paxillin: false, actin: true,
  });

  // Parse per-cell features once
  const cells: CellFeatures[] = useMemo(
    () => extractFeatures(result.features_df_json),
    [result.features_df_json],
  );

  return (
    <div
      style={{ display: "flex", height: "100%" }}
      onMouseEnter={() => setCanvasHovered(true)}
      onMouseLeave={() => setCanvasHovered(false)}
    >
      {/* Canvas area — all remaining width */}
      <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
        <MicroscopyImage
          result={result}
          showSegmentation={showSeg}
          activeOverlay={activeOverlay}
          cells={cells}
        />
        <OverlayPanel
          showSegmentation={showSeg}
          onToggleSegmentation={() => setShowSeg(v => !v)}
          activeOverlay={activeOverlay}
          onSetOverlay={setActiveOverlay}
          channelVisibility={channelVis}
          onToggleChannel={ch => setChannelVis(prev => ({ ...prev, [ch]: !prev[ch] }))}
          hovered={canvasHovered}
        />
      </div>

      {/* Right rail — 320px fixed */}
      <RightRail result={result} cells={cells} />
    </div>
  );
}
