/**
 * OverviewView — canvas + overlay controls + right rail.
 * 60/40 layout: image takes 60%, right rail takes 40%.
 */
import { useState } from "react";
import { MicroscopyCanvas } from "@/components/MicroscopyCanvas";
import { OverlayControls } from "@/components/OverlayControls";
import { RightRail } from "@/components/RightRail";
import { useJobStore } from "@/lib/jobStore";
import type { JobResult } from "@/lib/api";

interface OverviewViewProps {
  result: JobResult;
}

export function OverviewView({ result }: OverviewViewProps) {
  const setSelectedCellId = useJobStore((s) => s.setSelectedCellId);

  const [showSegmentation, setShowSegmentation] = useState(true);
  const [activeOverlay, setActiveOverlay] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [advancedOverlays, setAdvancedOverlays] = useState<Record<string, boolean>>({});
  const [showScaleBar, setShowScaleBar] = useState(true);
  const [showCellLabels, setShowCellLabels] = useState(false);
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
      {/* Canvas area — 60% width */}
      <div className="relative min-w-0" style={{ width: "60%" }}>
        <MicroscopyCanvas
          result={result}
          showSegmentation={showSegmentation}
          activeOverlay={activeOverlay}
          channelVisibility={channelVisibility}
          showScaleBar={showScaleBar}
          showCellLabels={showCellLabels}
        />
        <OverlayControls
          showSegmentation={showSegmentation}
          onToggleSegmentation={() => setShowSegmentation((v) => !v)}
          activeOverlay={activeOverlay}
          onSetOverlay={(o) => setActiveOverlay(o)}
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
          showScaleBar={showScaleBar}
          onToggleScaleBar={() => setShowScaleBar((v) => !v)}
          showCellLabels={showCellLabels}
          onToggleCellLabels={() => setShowCellLabels((v) => !v)}
          hovered={canvasHovered}
          channelWarnings={result.warnings}
        />
      </div>

      {/* Right rail — 40% width */}
      <RightRail
        result={result}
        onDeselectCell={() => setSelectedCellId(null)}
      />
    </div>
  );
}
