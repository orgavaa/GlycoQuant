/**
 * LoaderView — pre-result onboarding. Dark, minimal.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAnalysisJob } from "@/hooks/useAnalysisJob";
import {
  demoPreviewUrl,
  fetchDemoList,
  uploadPreview,
  type DemoCondition,
} from "@/lib/api";

export function LoaderView() {
  const job = useAnalysisJob();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<
    { kind: "demo"; dataset: DemoCondition } | { kind: "upload"; file: File } | null
  >(null);
  const [cellDiameter, setCellDiameter] = useState(80);
  const [pixelSizeUm, setPixelSizeUm] = useState(0.656);
  const [includeDeep, setIncludeDeep] = useState(false);

  const isRunning = job.isRunning || job.submit.isPending;

  const demoQuery = useQuery({
    queryKey: ["demo-list"],
    queryFn: fetchDemoList,
  });

  const uploadPreviewMut = useMutation({ mutationFn: uploadPreview });
  useEffect(() => {
    if (pending?.kind !== "upload") return;
    uploadPreviewMut.reset();
    uploadPreviewMut.mutate(pending.file);
  }, [pending]);
  useEffect(() => {
    const url = uploadPreviewMut.data;
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [uploadPreviewMut.data]);

  const previewSrc = useMemo(() => {
    if (!pending) return null;
    if (pending.kind === "demo") return demoPreviewUrl(pending.dataset.name);
    return uploadPreviewMut.data ?? null;
  }, [pending, uploadPreviewMut.data]);

  const handleRun = () => {
    if (!pending) return;
    job.submit.mutate({
      ...(pending.kind === "demo"
        ? { demoCondition: pending.dataset.name }
        : { upload: pending.file }),
      cellDiameter,
      includeDeepFeatures: includeDeep,
      pixelSizeUm,
    });
  };

  const conditions = demoQuery.data?.conditions ?? [];

  return (
    <div className="h-full flex">
      {/* Left: preview */}
      <div className="flex-1 bg-black flex items-center justify-center">
        {previewSrc ? (
          <img src={previewSrc} alt="Preview" className="max-w-full max-h-full object-contain opacity-80" />
        ) : (
          <div className="text-[#444] text-[10px] uppercase tracking-[0.2em]">Load an image to begin</div>
        )}
      </div>

      {/* Right: controls */}
      <div className="w-[360px] shrink-0 bg-[#111] border-l border-[#333] p-6 overflow-y-auto space-y-6">
        <div>
          <div className="label mb-1">Image analysis</div>
          <h2 className="text-lg font-bold leading-snug">
            Quantify how glycocalyx conformation relates to mechanotransduction.
          </h2>
          <p className="text-[11px] text-[#888] leading-relaxed mt-3">
            Upload a multi-channel fluorescence image and the pipeline
            segments every cell, extracts glycocalyx spatial features,
            measures size-corrected YAP, classifies focal adhesion maturation,
            and maps the coupling between surface coat and mechanical signalling.
          </p>
        </div>

        {/* Dataset selector */}
        <div>
          <div className="label mb-1.5">Reference dataset</div>
          <select
            onChange={(e) => {
              const found = conditions.find((c) => c.name === e.target.value);
              if (found) {
                setPending({ kind: "demo", dataset: found });
                if (found.pixel_size_um) setPixelSizeUm(found.pixel_size_um);
                job.reset();
              }
            }}
            disabled={isRunning}
            defaultValue=""
            className="w-full bg-[#1a1a1a] border border-[#333] px-3 py-2 text-[11px] text-[#eee] focus:outline-none focus:border-[#343dff]"
          >
            <option value="" disabled>
              {demoQuery.isLoading ? "Loading..." : `Select from ${conditions.length} fields`}
            </option>
            {conditions.map((c) => (
              <option key={c.name} value={c.name}>
                {c.display_name || c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-[#333]" />
          <span className="text-[9px] text-[#666] uppercase tracking-[0.1em]">or</span>
          <div className="h-px flex-1 bg-[#333]" />
        </div>

        {/* Upload */}
        <div>
          <input ref={fileRef} type="file" accept=".tif,.tiff,.png" className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) { setPending({ kind: "upload", file: f }); job.reset(); }
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={isRunning}
            className="w-full py-2 text-[10px] uppercase tracking-[0.08em] border border-[#333] text-[#888] hover:text-[#ccc] hover:border-[#555] transition-colors disabled:opacity-30"
          >
            Select TIFF or PNG
          </button>
        </div>

        {/* Params + run */}
        {pending && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="label mb-1">Cell diameter (px)</div>
                <input type="number" value={cellDiameter} min={10} max={300} step={5}
                  onChange={(e) => setCellDiameter(Number(e.target.value))}
                  disabled={isRunning}
                  className="w-full bg-[#1a1a1a] border border-[#333] px-2 py-1.5 text-[11px] text-[#eee] focus:outline-none focus:border-[#343dff]"
                />
              </div>
              <div>
                <div className="label mb-1">Pixel size (µm)</div>
                <input type="number" value={pixelSizeUm} min={0.05} max={2} step={0.005}
                  onChange={(e) => setPixelSizeUm(Number(e.target.value))}
                  disabled={isRunning}
                  className="w-full bg-[#1a1a1a] border border-[#333] px-2 py-1.5 text-[11px] text-[#eee] focus:outline-none focus:border-[#343dff]"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={includeDeep} onChange={(e) => setIncludeDeep(e.target.checked)}
                disabled={isRunning}
                className="w-3 h-3 bg-transparent border-[#555] text-[#343dff] focus:ring-0"
              />
              <span className="text-[10px] text-[#888]">Cell-DINO deep embeddings</span>
            </label>

            <button
              type="button"
              onClick={handleRun}
              disabled={isRunning}
              className="w-full py-2.5 bg-[#343dff] text-white text-[10px] uppercase tracking-[0.1em] font-bold hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              {isRunning ? "Running..." : "Start pipeline"}
            </button>
          </div>
        )}

        {/* Progress */}
        {job.progress && isRunning && (
          <div className="space-y-2">
            <div className="flex justify-between text-[9px] text-[#888] uppercase tracking-[0.08em]">
              <span>{job.progress.phase}</span>
              <span className="mono">{job.progress.pct}%</span>
            </div>
            <div className="h-0.5 bg-[#333] overflow-hidden">
              <div className="h-full bg-[#343dff] transition-all" style={{ width: `${job.progress.pct}%` }} />
            </div>
            <div className="text-[10px] text-[#666]">{job.progress.message}</div>
          </div>
        )}

        {job.submit.isError && (
          <div className="text-[10px] text-red-400">
            {(job.submit.error as Error)?.message ?? "Pipeline failed"}
          </div>
        )}
      </div>
    </div>
  );
}
