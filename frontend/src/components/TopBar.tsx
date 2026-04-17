import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Flame } from "lucide-react";
import { exportUrl, fetchHealth, warmupModal } from "@/lib/api";
import { useJobStore } from "@/lib/jobStore";

export type ViewId = "analysis" | "ranking" | "methods";

interface TopBarProps {
  activeView: ViewId;
  onChangeView: (v: ViewId) => void;
}

type WarmupState = "idle" | "running" | "ready" | "error";

const TAB_TOOLTIPS: Record<ViewId, string> = {
  analysis:
    "Single-image analysis: segment cells, extract per-cell features, " +
    "render the WGA↔mechanotransduction correlation heatmap.",
  ranking:
    "Perturbation prioritization: 22 glycocalyx genes ranked against the " +
    "15-gene mechanotransduction signature using STRING + Geneformer.",
  methods:
    "Per-feature documentation: what each scalar measures, what channel " +
    "it requires, and the primary literature it stands on.",
};

export function TopBar({ activeView, onChangeView }: TopBarProps) {
  const latestJobId = useJobStore((s) => s.latestJobId);
  const canExport = !!latestJobId;
  const [warmupState, setWarmupState] = useState<WarmupState>("idle");
  const [warmupDetail, setWarmupDetail] = useState<string>("");

  // Backend liveness — polled every 30s. Three states drive the dot:
  //  - green (ok)       → backend reachable, status=ok
  //  - amber (loading)  → first fetch in flight, no decision yet
  //  - red (error)      → request failed (network, 500, CORS, …)
  // The query is cheap (HEAD-equivalent) and intentionally has a tight
  // 5s timeout in fetchHealth so a hanging backend looks red within 5s.
  const healthQuery = useQuery({
    queryKey: ["backend-health"],
    queryFn: fetchHealth,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    retry: 0,
    staleTime: 25_000,
  });

  const healthState: "ok" | "loading" | "error" = healthQuery.isSuccess
    ? "ok"
    : healthQuery.isError
      ? "error"
      : "loading";
  const healthDotTint =
    healthState === "ok"
      ? "bg-emerald-500"
      : healthState === "error"
        ? "bg-red-500"
        : "bg-amber-400 animate-pulse";
  const healthTooltip =
    healthState === "ok"
      ? `Backend OK · ${healthQuery.data?.device_detail ?? healthQuery.data?.device ?? "device unknown"}`
      : healthState === "error"
        ? "Backend unreachable. Check the API URL and CORS configuration."
        : "Probing backend liveness…";

  const handleExport = () => {
    if (!latestJobId) return;
    window.location.assign(exportUrl(latestJobId));
  };

  const handleWarmup = async () => {
    if (warmupState === "running") return;
    setWarmupState("running");
    setWarmupDetail("Provoking GPU container cold-start (30-60s)…");
    try {
      const r = await warmupModal();
      setWarmupState("ready");
      setWarmupDetail(
        `Modal ready · ${r.modal.device} · ${r.modal.elapsed_ms}ms heartbeat`,
      );
    } catch (exc) {
      setWarmupState("error");
      const msg = exc instanceof Error ? exc.message : String(exc);
      setWarmupDetail(msg);
    }
  };

  const warmupTint =
    warmupState === "ready"
      ? "text-emerald-700 border-emerald-300 hover:bg-emerald-50"
      : warmupState === "error"
        ? "text-red-700 border-red-300 hover:bg-red-50"
        : warmupState === "running"
          ? "text-orange-600 border-orange-200 animate-pulse"
          : "text-gray-700 border-gray-300 hover:bg-gray-50";

  return (
    <nav className="h-14 bg-white border-b border-gray-200 flex items-center px-6 flex-shrink-0 z-50">
      <span className="font-bold text-[16px] text-gray-900 tracking-[-0.3px]">GlycoQuant</span>
      <span
        className={`ml-2 h-1.5 w-1.5 rounded-full flex-shrink-0 ${healthDotTint}`}
        title={healthTooltip}
        aria-label={`Backend ${healthState}`}
      />
      <div className="flex gap-8 ml-12">
        <NavTab label="Analysis" active={activeView === "analysis"} onClick={() => onChangeView("analysis")} tooltip={TAB_TOOLTIPS.analysis} />
        <NavTab label="Ranking" active={activeView === "ranking"} onClick={() => onChangeView("ranking")} tooltip={TAB_TOOLTIPS.ranking} />
        <NavTab label="Methods" active={activeView === "methods"} onClick={() => onChangeView("methods")} tooltip={TAB_TOOLTIPS.methods} />
      </div>
      <div className="flex-1" />
      <button
        onClick={handleWarmup}
        disabled={warmupState === "running"}
        title={
          warmupDetail ||
          "Pre-warm the Modal GPU container so the first analysis call lands on a warm container instead of paying a 30-60s cold-start. Call once before a live demo."
        }
        className={`flex items-center gap-1.5 text-xs font-medium border rounded-md px-3 py-1.5 mr-2 transition-colors ${warmupTint}`}
      >
        <Flame size={14} strokeWidth={1.5} />
        {warmupState === "running"
          ? "Warming GPU…"
          : warmupState === "ready"
            ? "GPU warm"
            : warmupState === "error"
              ? "Warm-up failed"
              : "Warm up GPU"}
      </button>
      <button
        onClick={handleExport}
        disabled={!canExport}
        title={
          canExport
            ? "Download per-cell features, results summary, and provenance bundle as a zip"
            : "Run an analysis first — the export bundle needs a completed job"
        }
        className={`flex items-center gap-1.5 text-xs font-medium border rounded-md px-3 py-1.5 transition-colors ${
          canExport
            ? "text-gray-700 border-gray-300 hover:bg-gray-50"
            : "text-gray-400 border-gray-200 cursor-not-allowed"
        }`}
      >
        <Download size={14} strokeWidth={1.5} />
        Export
      </button>
    </nav>
  );
}

function NavTab({
  label,
  active,
  onClick,
  tooltip,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  tooltip?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={tooltip}
      className={`bg-transparent border-none font-medium text-[13px] cursor-pointer py-[17px] border-b-2 transition-colors ${
        active
          ? "text-gray-900 border-b-blue-600"
          : "text-gray-400 border-b-transparent hover:text-gray-600"
      }`}
    >
      {label}
    </button>
  );
}
