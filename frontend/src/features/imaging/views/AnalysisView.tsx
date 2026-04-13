import { useEffect, useMemo, useState } from "react";
import { PanelRightOpen, PanelRightClose } from "lucide-react";
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
  const [railOpen, setRailOpen] = useState(false);
  const [channelVis, setChannelVis] = useState<Record<string, boolean>>({
    dapi: true, glycocalyx: true, yap: false, paxillin: false, actin: true,
  });
  const datasetLabel = useJobStore(s => s.latestDatasetLabel);
  const selectedCellId = useJobStore(s => s.selectedCellId);
  const cells = useMemo(() => extractFeatures(result.features_df_json), [result.features_df_json]);

  // Auto-open the rail when a cell is clicked
  useEffect(() => {
    if (selectedCellId != null) {
      setRailOpen(true);
    }
  }, [selectedCellId]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      {/* Full-bleed microscopy image */}
      <div className="absolute inset-0">
        <MicroscopyCanvas
          result={result}
          showSegmentation={showSeg}
          activeOverlay={activeOverlay}
          cells={cells}
          channelVisibility={channelVis}
        />
      </div>

      {/* Overlay controls (top-left) */}
      <OverlayPanel
        showSegmentation={showSeg}
        onToggleSegmentation={() => setShowSeg(v => !v)}
        activeOverlay={activeOverlay}
        onSetOverlay={setActiveOverlay}
        channelVisibility={channelVis}
        onToggleChannel={ch => setChannelVis(p => ({ ...p, [ch]: !p[ch] }))}
      />

      {/* Caption bar (bottom) */}
      <div className="absolute bottom-0 left-0 right-0 z-10 pointer-events-none">
        <div className="bg-black/60 backdrop-blur-sm">
          <ImageCaption
            datasetLabel={datasetLabel}
            cellCount={result.cell_count}
            pixelSizeUm={result.pixel_size_um}
          />
        </div>
      </div>

      {/* Rail toggle button */}
      <button
        onClick={() => setRailOpen(v => !v)}
        className={`absolute top-4 z-30 bg-white/90 backdrop-blur-xl border border-gray-200 rounded-lg shadow-md w-9 h-9 flex items-center justify-center text-gray-600 hover:bg-white hover:text-gray-900 transition-all duration-300 ${
          railOpen ? "right-[calc(min(640px,60vw)+12px)]" : "right-4"
        }`}
        title={railOpen ? "Close panel" : "Open results"}
      >
        {railOpen ? <PanelRightClose size={18} strokeWidth={1.5} /> : <PanelRightOpen size={18} strokeWidth={1.5} />}
      </button>

      {/* Sliding results panel */}
      <div
        className={`absolute top-0 right-0 h-full z-20 transition-transform duration-300 ease-in-out ${
          railOpen ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ width: "min(640px, 60vw)" }}
      >
        <RightRail result={result} cells={cells} onClose={() => setRailOpen(false)} />
      </div>
    </div>
  );
}
