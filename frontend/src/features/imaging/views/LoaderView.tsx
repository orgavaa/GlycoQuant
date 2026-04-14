import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Upload, Settings, Layers, Play } from "lucide-react";
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
          <div className="w-full h-full flex items-center justify-center pr-[380px] px-8">
            <div className="text-center max-w-xl">
              <h1 className="text-white text-[32px] font-bold tracking-tight mb-4">GlycoQuant</h1>
              <p className="text-gray-400 text-[14px] leading-relaxed">
                Single-cell glycocalyx&ndash;mechanotransduction coupling from standard fluorescence microscopy.
              </p>
              <p className="text-gray-500 text-[12px] leading-relaxed mt-3">
                Segments every cell with Cellpose-SAM, extracts 26 interpretable biophysical features
                spanning glycocalyx organisation, YAP localisation, focal-adhesion maturation, and actin
                coherence, then maps the per-cell coupling between surface coat and mechanical signalling.
              </p>
              <div className="text-gray-600 text-[10px] tracking-[0.1em] uppercase mt-6">
                Select a dataset to begin
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Right: science-first control rail */}
      <div className="absolute top-0 right-0 h-full w-[380px] flex-shrink-0 bg-white/95 backdrop-blur-xl border-l border-gray-200 shadow-2xl overflow-y-auto z-10">
        <div className="p-6 space-y-5">

          {/* 1. Scientific purpose — what this run measures */}
          <section>
            <h2 className="text-[16px] font-semibold text-gray-900 mb-2">Single-cell analysis</h2>
            <div className="space-y-1.5">
              {[
                "Glycocalyx spatial organisation",
                "YAP nuclear localisation (size-corrected)",
                "Focal adhesion maturation classification",
                "Actin cytoskeletal coherence",
                "Glyco \u2194 mechano coupling strength",
              ].map(item => (
                <div key={item} className="flex items-start gap-2 text-[11px] text-gray-500">
                  <div className="w-1 h-1 rounded-full bg-blue-400 mt-1.5 flex-shrink-0" />
                  {item}
                </div>
              ))}
            </div>
          </section>

          <div className="border-t border-gray-100" />

          {/* 2. Dataset choice */}
          <section>
            <div className="flex items-center gap-1.5 mb-2 leading-none">
              <Layers size={12} strokeWidth={1.5} className="text-gray-400 flex-shrink-0" />
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-[1px]">
                Dataset
              </span>
            </div>
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
              className="w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-[12px] text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
          </section>

          {/* 3. Upload */}
          <section>
            <div className="flex items-center gap-3 mb-2">
              <div className="h-px flex-1 bg-gray-100" />
              <span className="text-[10px] text-gray-300 uppercase tracking-[0.08em]">or upload</span>
              <div className="h-px flex-1 bg-gray-100" />
            </div>
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
              className="w-full flex items-center justify-center gap-2 py-2 text-[11px] font-medium border border-gray-200 border-dashed rounded-md text-gray-500 hover:bg-gray-50 transition-colors disabled:opacity-40"
            >
              <Upload size={14} strokeWidth={1.5} />
              Select TIFF or PNG
            </button>
          </section>

          {/* 4-7: Configuration + run (only when dataset selected) */}
          {pending && (
            <>
              <div className="border-t border-gray-100" />

              {/* 4. Acquisition parameters */}
              <section>
                <div className="flex items-center gap-1.5 mb-2 leading-none">
                  <Settings size={12} strokeWidth={1.5} className="text-gray-400 flex-shrink-0" />
                  <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-[1px]">
                    Acquisition
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-gray-400 mb-1 block">Cell diameter (px)</label>
                    <input type="number" value={cellDiameter} min={10} max={300} step={5}
                      onChange={(e) => setCellDiameter(Number(e.target.value))}
                      disabled={isRunning}
                      className="w-full bg-white border border-gray-200 rounded-md px-2.5 py-1.5 text-[12px] text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 mb-1 block">Pixel size (&micro;m)</label>
                    <input type="number" value={pixelSizeUm} min={0.05} max={2} step={0.005}
                      onChange={(e) => setPixelSizeUm(Number(e.target.value))}
                      disabled={isRunning}
                      className="w-full bg-white border border-gray-200 rounded-md px-2.5 py-1.5 text-[12px] text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </section>

              {/* 5. Channel assignment */}
              <section>
                <ChannelAssignmentPanel
                  slotSources={pending.kind === "demo" ? pending.dataset.slot_sources : null}
                  nChannels={5}
                  value={channelAssignments}
                  onChange={setChannelAssignments}
                  disabled={isRunning}
                />
              </section>

              {/* 6. Deep embeddings */}
              <section>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={includeDeep} onChange={(e) => setIncludeDeep(e.target.checked)}
                    disabled={isRunning}
                    className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-[11px] text-gray-600">Cell-DINO deep embeddings</span>
                  <span className="text-[9px] text-gray-300 ml-auto">optional</span>
                </label>
              </section>

              <div className="border-t border-gray-100" />

              {/* 7. Run button + output summary */}
              <section>
                <button
                  type="button"
                  onClick={handleRun}
                  disabled={isRunning}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white text-[12px] font-medium rounded-md hover:bg-blue-700 disabled:opacity-40 transition-colors"
                >
                  <Play size={14} strokeWidth={1.5} />
                  {isRunning ? "Running pipeline..." : "Start analysis"}
                </button>
                <div className="text-[10px] text-gray-400 mt-2 leading-relaxed">
                  Outputs: per-cell feature table, glyco&harr;mechano correlation heatmap,
                  score distribution, interactive cell inspection, and channel composites.
                </div>
              </section>
            </>
          )}

          {/* Progress */}
          {isRunning && (
            <PipelineProgress
              progress={job.progress}
              submittedAt={job.submittedAt}
              includesDeep={job.includesDeep}
              isGpu={true}
            />
          )}

          {(job.submit.isError || job.isFailed) && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-[11px] text-red-700">
              {job.isFailed
                ? (job.status?.error ?? "Pipeline failed on the server.")
                : ((job.submit.error as Error)?.message ?? "Pipeline failed")}
            </div>
          )}

          {job.result?.warnings && job.result.warnings.length > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-md">
              {job.result.warnings.map((w, i) => (
                <div key={i} className="text-[10px] text-amber-700">{w}</div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
