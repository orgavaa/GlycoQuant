import { useEffect, useState } from "react";
import type { JobProgress } from "@/lib/api";

/**
 * Pipeline stages with estimated timing (seconds from submission).
 * Cold start adds ~60s; warm start skips the first two stages.
 */
const GPU_STAGES = [
  { at: 0,   pct: 5,   label: "Dispatching to GPU",         detail: "Routing the analysis job to the Modal L4 GPU cluster" },
  { at: 8,   pct: 10,  label: "Booting GPU container",      detail: "Allocating an NVIDIA L4 GPU and loading the container image" },
  { at: 20,  pct: 18,  label: "Loading Cellpose-SAM",       detail: "Initializing the Cellpose-SAM segmentation model on CUDA" },
  { at: 35,  pct: 25,  label: "Loading Cell-DINO ViT-L/16", detail: "Loading the 1.2 GB channel-adaptive vision transformer checkpoint" },
  { at: 55,  pct: 35,  label: "Segmenting cells",           detail: "Running Cellpose-SAM to detect cell and nuclear boundaries" },
  { at: 75,  pct: 50,  label: "Extracting features",        detail: "Computing WGA, YAP, FA, actin, and morphology features per cell" },
  { at: 95,  pct: 65,  label: "Computing deep embeddings",  detail: "Running Cell-DINO ViT-L/16 inference on per-cell crops (5120-dim per cell)" },
  { at: 120, pct: 78,  label: "Computing mechano score",    detail: "PCA over the curated 15-feature mechanotransduction panel" },
  { at: 135, pct: 85,  label: "Generating visualizations",  detail: "Building correlation heatmaps, score distributions, and channel PNGs" },
  { at: 155, pct: 92,  label: "Serializing results",        detail: "Packaging per-cell data, figures, and overlays for transfer" },
  { at: 170, pct: 96,  label: "Transferring from GPU",      detail: "Sending the result payload back to the API server" },
];

const CPU_STAGES = [
  { at: 0,   pct: 5,   label: "Starting pipeline",          detail: "Initializing the analysis pipeline on CPU" },
  { at: 5,   pct: 10,  label: "Loading Cellpose-SAM",       detail: "Initializing the segmentation model (first run downloads ~1.2 GB)" },
  { at: 30,  pct: 20,  label: "Segmenting cells",           detail: "Running Cellpose-SAM to detect cell boundaries — this is slower on CPU" },
  { at: 120, pct: 45,  label: "Extracting features",        detail: "Computing WGA, YAP, focal adhesion, actin, and morphology features per cell" },
  { at: 180, pct: 60,  label: "Computing deep embeddings",  detail: "Running Cell-DINO ViT-L/16 on CPU — this takes several minutes" },
  { at: 300, pct: 80,  label: "Generating visualizations",  detail: "Building charts and channel PNGs" },
  { at: 360, pct: 90,  label: "Finalizing",                 detail: "Packaging results" },
];

interface Props {
  progress: JobProgress | null;
  submittedAt: number | null;
  includesDeep: boolean;
  isGpu: boolean;
}

export function PipelineProgress({ progress, submittedAt, includesDeep, isGpu }: Props) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const elapsed = submittedAt ? Math.floor((now - submittedAt) / 1000) : 0;
  const stages = isGpu ? GPU_STAGES : CPU_STAGES;

  // Use backend progress if it's giving real updates, otherwise estimate from elapsed time
  const backendPct = progress?.pct ?? 0;
  const isRemoteGpu = isGpu && backendPct <= 20; // Stuck at "Running on remote GPU"

  let currentStage: typeof stages[0];
  let estimatedPct: number;

  if (isRemoteGpu) {
    // Estimate from elapsed time
    let stageIdx = 0;
    for (let i = stages.length - 1; i >= 0; i--) {
      if (elapsed >= stages[i].at) { stageIdx = i; break; }
    }
    currentStage = stages[stageIdx];

    // Smooth interpolation between stages
    const nextStage = stages[Math.min(stageIdx + 1, stages.length - 1)];
    const stageElapsed = elapsed - currentStage.at;
    const stageDuration = nextStage.at - currentStage.at || 1;
    const stageProgress = Math.min(1, stageElapsed / stageDuration);
    estimatedPct = currentStage.pct + (nextStage.pct - currentStage.pct) * stageProgress;

    // Skip deep embedding stage if not enabled
    if (!includesDeep && currentStage.label.includes("deep embedding")) {
      currentStage = stages[Math.min(stageIdx + 1, stages.length - 1)];
    }
  } else {
    // Use backend-reported progress
    estimatedPct = backendPct;
    currentStage = {
      at: 0,
      pct: backendPct,
      label: progress?.phase ?? "Processing",
      detail: progress?.message ?? "",
    };
  }

  // Cap at 97% until actually complete
  estimatedPct = Math.min(97, estimatedPct);

  const formatTime = (s: number) => {
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${(s % 60).toString().padStart(2, "0")}s`;
  };

  // Estimate remaining time
  const totalEstimate = isGpu ? (includesDeep ? 180 : 90) : (includesDeep ? 420 : 180);
  const remaining = Math.max(0, totalEstimate - elapsed);

  return (
    <div className="mt-5 space-y-3">
      {/* Progress bar */}
      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-600 rounded-full transition-all duration-1000 ease-linear"
          style={{ width: `${estimatedPct}%` }}
        />
      </div>

      {/* Current stage */}
      <div className="flex items-start gap-3">
        <div className="mt-0.5 w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium text-gray-900">{currentStage.label}</div>
          <div className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">{currentStage.detail}</div>
        </div>
      </div>

      {/* Time info */}
      <div className="flex items-center justify-between text-[11px] text-gray-400" style={{ fontFeatureSettings: "'tnum'" }}>
        <span>Elapsed: {formatTime(elapsed)}</span>
        <span>~{formatTime(remaining)} remaining</span>
      </div>
    </div>
  );
}
