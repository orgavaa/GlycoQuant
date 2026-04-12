/**
 * OverviewView — canvas + overlay controls + right rail.
 * The primary instrument view.
 */
import { useState } from "react";
import { MicroscopyCanvas } from "@/components/MicroscopyCanvas";
import { OverlayControls } from "@/components/OverlayControls";
import { RightRail } from "@/components/RightRail";
import { useJobStore } from "@/lib/jobStore";
import type { JobResult } from "@/lib/api";

interface OverviewViewProps {
  result: JobResult;
  datasetLabel: string | null;
}

export function OverviewView({ result }: OverviewViewProps) {
  const setSelectedCellId = useJobStore((s) => s.setSelectedCellId);

  const [showSegmentation, setShowSegmentation] = useState(true);
  const [activeOverlay, setActiveOverlay] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [advancedOverlays, setAdvancedOverlays] = useState<Record<string, boolean>>({});
  const [canvasHovered, setCanvasHovered] = useState(false);
  const [channelVisibility, setChannelVisibility] = useState<Record<string, boolean>>({
    dapi: true,
    glycocalyx: true,
    yap: false,
    paxillin: false,
    actin: true,
  });

  return (
    <div
      className="flex h-full"
      onMouseEnter={() => setCanvasHovered(true)}
      onMouseLeave={() => setCanvasHovered(false)}
    >
      {/* Canvas + floating overlay controls */}
      <div className="flex-1 relative">
        <MicroscopyCanvas
          result={result}
          showSegmentation={showSegmentation}
          activeOverlay={activeOverlay}
          channelVisibility={channelVisibility}
        />

        <OverlayControls
          showSegmentation={showSegmentation}
          onToggleSegmentation={() => setShowSegmentation((v) => !v)}
          activeOverlay={activeOverlay}
          onSetOverlay={setActiveOverlay}
          channelVisibility={channelVisibility}
          onToggleChannel={(ch) =>
            setChannelVisibility((prev) => ({ ...prev, [ch]: !prev[ch] }))
          }
          showAdvanced={showAdvanced}
          onToggleAdvanced={() => setShowAdvanced((v) => !v)}
          advancedOverlays={advancedOverlays}
          onToggleAdvancedOverlay={(name) =>
            setAdvancedOverlays((prev) => ({ ...prev, [name]: !prev[name] }))
          }
          hovered={canvasHovered}
        />
      </div>

      {/* Right rail */}
      <RightRail
        result={result}
        onDeselectCell={() => setSelectedCellId(null)}
      />
    </div>
  );
}
