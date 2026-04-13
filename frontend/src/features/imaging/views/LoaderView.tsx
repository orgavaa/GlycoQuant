import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAnalysisJob } from "@/hooks/useAnalysisJob";
import { PipelineProgress } from "@/components/PipelineProgress";
import {
  ChannelAssignmentPanel,
  defaultAssignmentsFromManifest,
  defaultPositionalAssignments,
} from "@/components/ChannelAssignmentPanel";
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
  const [channelAssignments, setChannelAssignments] = useState<Record<string, string>>(
    defaultPositionalAssignments()
  );

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      channelAssignments,
    });
  };

  const conditions = demoQuery.data?.conditions ?? [];

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      {/* Full-bleed preview image */}
      <div className="absolute inset-0">
        {previewSrc ? (
          <img src={previewSrc} alt="Preview" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center pr-[380px]">
            <div className="text-center">
              <div className="text-gray-400 text-[13px] tracking-[0.1em] uppercase mb-2">
                Select a dataset to begin
              </div>
              <div className="text-gray-600 text-[11px]">
                Choose a reference dataset or upload your own TIFF
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Right: controls panel — overlaid on the image */}
      <div className="absolute top-0 right-0 h-full w-[380px] flex-shrink-0 bg-white/95 backdrop-blur-xl border-l border-gray-200 shadow-2xl overflow-y-auto p-6 z-10">
        <div className="mb-6">
          <h2 className="text-[18px] font-semibold text-gray-900 mb-2">Image analysis</h2>
          <p className="text-[12px] text-gray-500 leading-relaxed">
            Upload a multi-channel fluorescence image and the pipeline segments every cell,
            extracts glycocalyx spatial features, measures size-corrected YAP N/C ratio,
            classifies focal adhesion maturation, and maps the coupling between surface coat
            and mechanical signalling.
          </p>
        </div>

        {/* Dataset selector */}
        <div className="mb-5">
          <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-[1px] mb-1.5 block">
            Reference dataset
          </label>
          <select
            onChange={(e) => {
              const found = conditions.find(c => c.name === e.target.value);
              if (found) {
                setPending({ kind: "demo", dataset: found });
                if (found.pixel_size_um) setPixelSizeUm(found.pixel_size_um);
                setChannelAssignments(defaultAssignmentsFromManifest(found.slot_sources));
                job.reset();
              }
            }}
            disabled={isRunning}
            defaultValue=""
            className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-[13px] text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="" disabled>
              {demoQuery.isLoading ? "Loading..." : `Select from ${conditions.length} datasets`}
            </option>
            {conditions.map(c => (
              <option key={c.name} value={c.name}>
                {c.display_name || c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3 mb-5">
          <div className="h-px flex-1 bg-gray-200" />
          <span className="text-[10px] text-gray-400 uppercase tracking-[0.1em]">or</span>
          <div className="h-px flex-1 bg-gray-200" />
        </div>

        {/* Upload */}
        <div className="mb-5">
          <input ref={fileRef} type="file" accept=".tif,.tiff,.png" className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                setPending({ kind: "upload", file: f });
                setChannelAssignments(defaultPositionalAssignments());
                job.reset();
              }
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={isRunning}
            className="w-full py-2.5 text-[12px] font-medium border border-gray-300 rounded-md text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40"
          >
            Select TIFF or PNG
          </button>
        </div>

        {/* Parameters */}
        {pending && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-[1px] mb-1 block">
                  Cell diameter (px)
                </label>
                <input type="number" value={cellDiameter} min={10} max={300} step={5}
                  onChange={(e) => setCellDiameter(Number(e.target.value))}
                  disabled={isRunning}
                  className="w-full bg-white border border-gray-300 rounded-md px-2.5 py-1.5 text-[13px] text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-[1px] mb-1 block">
                  Pixel size (&micro;m)
                </label>
                <input type="number" value={pixelSizeUm} min={0.05} max={2} step={0.005}
                  onChange={(e) => setPixelSizeUm(Number(e.target.value))}
                  disabled={isRunning}
                  className="w-full bg-white border border-gray-300 rounded-md px-2.5 py-1.5 text-[13px] text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Channel assignment */}
            <ChannelAssignmentPanel
              slotSources={pending.kind === "demo" ? pending.dataset.slot_sources : null}
              nChannels={5}
              value={channelAssignments}
              onChange={setChannelAssignments}
              disabled={isRunning}
            />

            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={includeDeep} onChange={(e) => setIncludeDeep(e.target.checked)}
                disabled={isRunning}
                className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-[12px] text-gray-500">Cell-DINO deep embeddings</span>
            </label>

            <button
              type="button"
              onClick={handleRun}
              disabled={isRunning}
              className="w-full py-2.5 bg-blue-600 text-white text-[13px] font-medium rounded-md hover:bg-blue-700 disabled:opacity-40 transition-colors"
            >
              {isRunning ? "Running pipeline..." : "Start analysis"}
            </button>
          </div>
        )}

        {/* Progress */}
        {isRunning && (
          <PipelineProgress
            progress={job.progress}
            submittedAt={job.submittedAt}
            includesDeep={job.includesDeep}
            isGpu={job.progress?.message?.includes("remote GPU") || job.progress?.message?.includes("Modal") || true}
          />
        )}

        {(job.submit.isError || job.isFailed) && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-[12px] text-red-700">
            {job.isFailed
              ? (job.status?.error ?? "Pipeline failed on the server. Check Railway deploy logs.")
              : ((job.submit.error as Error)?.message ?? "Pipeline failed")}
          </div>
        )}

        {/* Warnings */}
        {job.result?.warnings && job.result.warnings.length > 0 && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
            {job.result.warnings.map((w, i) => (
              <div key={i} className="text-[11px] text-amber-700">{w}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
