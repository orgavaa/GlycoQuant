import { useMemo, useState } from "react";
import { Card } from "@/components/Card";
import { MicroscopyCanvas } from "@/components/MicroscopyCanvas";
import { OverlayPanel } from "@/components/OverlayPanel";
import { RightRail } from "@/components/RightRail";
import { ImageCaption } from "@/components/ImageCaption";
import type { JobResult } from "@/lib/api";
import { extractFeatures } from "@/lib/canvas/extract";
import { useJobStore } from "@/lib/jobStore";

interface Props {
  result: JobResult;
}

export function AnalysisView({ result }: Props) {
  const [showSeg, setShowSeg] = useState(true);
  const [activeOverlay, setActiveOverlay] = useState<string | null>(null);
  const [channelVis, setChannelVis] = useState<Record<string, boolean>>({
    dapi: true, glycocalyx: true, yap: false, paxillin: false, actin: true,
  });
  const datasetLabel = useJobStore(s => s.latestDatasetLabel);
  const cells = useMemo(() => extractFeatures(result.features_df_json), [result.features_df_json]);

  return (
    <div className="flex h-full bg-gray-50">
      {/* Left: microscopy image in a card */}
      <div className="flex-1 min-w-0 p-4">
        <div className="h-full bg-white border border-gray-200 rounded-lg shadow-sm flex flex-col overflow-hidden">
          {/* Image area — fills all available space */}
          <div className="flex-1 relative min-h-0">
            <MicroscopyCanvas
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
              onToggleChannel={ch => setChannelVis(p => ({ ...p, [ch]: !p[ch] }))}
            />
          </div>
          {/* Caption bar at bottom */}
          <ImageCaption
            datasetLabel={datasetLabel}
            cellCount={result.cell_count}
            pixelSizeUm={result.pixel_size_um}
          />
        </div>
      </div>

      {/* Right rail */}
      <RightRail result={result} cells={cells} />
    </div>
  );
}
