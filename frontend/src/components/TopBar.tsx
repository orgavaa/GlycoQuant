import { useState, type ComponentType } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  Download,
  Flame,
  Network,
  SlidersHorizontal,
  type LucideProps,
} from "lucide-react";
import { exportUrl, fetchHealth, warmupModal } from "@/lib/api";
import { useJobStore } from "@/lib/jobStore";
import { contextBadge } from "@/lib/scientificGuards";

export type ViewId = "analysis" | "ranking" | "methods";

interface TopBarProps {
  activeView: ViewId;
  onChangeView: (v: ViewId) => void;
}

type WarmupState = "idle" | "running" | "ready" | "error";

const NAV_ITEMS: ReadonlyArray<{
  id: ViewId;
  label: string;
  Icon: ComponentType<LucideProps>;
  tooltip: string;
}> = [
  {
    id: "analysis",
    label: "Analysis",
    Icon: SlidersHorizontal,
    tooltip: "Configure fields, inspect masks, and review per-cell features.",
  },
  {
    id: "ranking",
    label: "Ranking",
    Icon: Network,
    tooltip: "Prioritize glycocalyx genes using pathway priors and optional Geneformer evidence.",
  },
  {
    id: "methods",
    label: "Methods",
    Icon: BookOpen,
    tooltip: "Feature definitions, channel requirements, and validation notes.",
  },
];

export function TopBar({ activeView, onChangeView }: TopBarProps) {
  const latestJobId = useJobStore((s) => s.latestJobId);
  const latestDatasetContext = useJobStore((s) => s.latestDatasetContext);
  const canExport = !!latestJobId;
  const [warmupState, setWarmupState] = useState<WarmupState>("idle");
  const [warmupDetail, setWarmupDetail] = useState("");

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
        ? "bg-rose-500"
        : "bg-amber-400 animate-pulse";
  const healthLabel =
    healthState === "ok" ? "Online" : healthState === "error" ? "Offline" : "Checking";
  const healthTint =
    healthState === "ok"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : healthState === "error"
        ? "border-rose-200 bg-rose-50 text-rose-800"
        : "border-amber-200 bg-amber-50 text-amber-800";
  const healthTooltip =
    healthState === "ok"
      ? `Backend online / ${healthQuery.data?.device_detail ?? healthQuery.data?.device ?? "device unknown"}`
      : healthState === "error"
        ? "Backend unreachable. Check API URL and CORS."
        : "Checking backend liveness...";

  const handleExport = () => {
    if (!latestJobId) return;
    window.location.assign(exportUrl(latestJobId));
  };

  const handleWarmup = async () => {
    if (warmupState === "running") return;
    setWarmupState("running");
    setWarmupDetail("Preparing the GPU worker...");
    try {
      const r = await warmupModal();
      setWarmupState("ready");
      setWarmupDetail(
        `Modal ready / ${r.modal.device} / ${r.modal.elapsed_ms}ms heartbeat`,
      );
    } catch (exc) {
      setWarmupState("error");
      setWarmupDetail(exc instanceof Error ? exc.message : String(exc));
    }
  };

  const warmupTint =
    warmupState === "ready"
      ? "border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50"
      : warmupState === "error"
        ? "border-rose-200 bg-white text-rose-700 hover:bg-rose-50"
        : warmupState === "running"
          ? "border-amber-200 bg-white text-amber-700"
          : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50";

  return (
    <nav className="z-50 flex h-16 flex-shrink-0 items-center border-b border-gray-200 bg-white/95 px-4 backdrop-blur">
      <div className="flex min-w-[184px] items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white shadow-sm">
          <img
            src="/glyco.png"
            alt=""
            className="h-7 w-7 object-contain"
            draggable={false}
          />
        </span>
        <span className="text-[17px] font-semibold text-gray-950">GlycoQuant</span>
      </div>

      <div className="ml-5 inline-flex h-10 items-center rounded-lg bg-gray-100 p-1">
        {NAV_ITEMS.map((item) => (
          <NavTab
            key={item.id}
            label={item.label}
            Icon={item.Icon}
            active={activeView === item.id}
            onClick={() => onChangeView(item.id)}
            tooltip={item.tooltip}
          />
        ))}
      </div>

      <div className="flex-1" />

      {latestDatasetContext && (
        <div
          className={`mr-2 hidden h-8 items-center rounded-md border px-2.5 text-[11px] font-medium sm:flex ${
            contextBadge(latestDatasetContext).tone === "amber"
              ? "border-amber-200 bg-amber-50 text-amber-800"
              : contextBadge(latestDatasetContext).tone === "emerald"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-gray-200 bg-gray-50 text-gray-700"
          }`}
          title={latestDatasetContext.warnings[0] ?? latestDatasetContext.datasetType}
        >
          {contextBadge(latestDatasetContext).label}
        </div>
      )}

      <div
        className={`mr-2 hidden h-8 items-center gap-2 rounded-md border px-2.5 text-[11px] font-medium sm:flex ${healthTint}`}
        title={healthTooltip}
        aria-label={healthLabel}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${healthDotTint}`} />
        <span>{healthLabel}</span>
      </div>

      <button
        onClick={handleWarmup}
        disabled={warmupState === "running"}
        title={warmupDetail || "Pre-warm the Modal GPU worker before a live run."}
        className={`mr-2 flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-medium transition-colors disabled:cursor-wait ${warmupTint}`}
      >
        <Flame size={13} strokeWidth={1.7} />
        <span className="hidden md:inline">
          {warmupState === "running"
            ? "Warming"
            : warmupState === "ready"
              ? "GPU ready"
              : warmupState === "error"
                ? "GPU failed"
                : "Warm GPU"}
        </span>
      </button>

      <button
        onClick={handleExport}
        disabled={!canExport}
        title={
          canExport
            ? "Download per-cell features, summary, and provenance bundle"
            : "Run an analysis before exporting"
        }
        className={`flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-medium transition-colors ${
          canExport
            ? "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50"
            : "cursor-not-allowed border-gray-200 bg-white text-gray-400"
        }`}
      >
        <Download size={13} strokeWidth={1.7} />
        <span className="hidden md:inline">Export</span>
      </button>
    </nav>
  );
}

function NavTab({
  label,
  Icon,
  active,
  onClick,
  tooltip,
}: {
  label: string;
  Icon: ComponentType<LucideProps>;
  active: boolean;
  onClick: () => void;
  tooltip?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={tooltip}
      className={`flex h-8 items-center gap-1.5 rounded-md px-3 text-[12px] font-medium transition-colors ${
        active
          ? "bg-white text-gray-950 shadow-sm ring-1 ring-gray-200"
          : "text-gray-500 hover:bg-white/60 hover:text-gray-800"
      }`}
    >
      <Icon size={14} strokeWidth={1.7} />
      <span>{label}</span>
    </button>
  );
}
