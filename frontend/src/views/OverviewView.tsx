/**
 * OverviewView — canvas + overlay controls + right rail.
 * The primary instrument view. Handles both overview and single-cell modes
 * (single cell = a cell is selected on the canvas → right rail shows dossier).
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
      {/* Canvas area — takes all remaining width */}
      <div className="flex-1 relative min-w-0">
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
          onSetOverlay={(o) => {
            // Only one fill overlay active at a time
            setActiveOverlay(o);
          }}
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

      {/* Right rail — 320px fixed */}
      <RightRail
        result={result}
        onDeselectCell={() => setSelectedCellId(null)}
      />
    </div>
  );
}
