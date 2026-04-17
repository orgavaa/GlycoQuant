import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Upload,
  Settings,
  Layers,
  Play,
  ImageIcon,
} from "lucide-react";
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
import { useJobStore } from "@/lib/jobStore";

/** Pick three "featured" demo conditions for the empty-state tiles.
 *
 * Preference ladder, in this order:
 *   1. Labouesse-protocol exemplars (control / siSDC1 / heparinase)
 *      from the bundled synthetic fixtures — these were generated to
 *      demonstrate the platform on a known biology spectrum.
 *   2. HPA datasets (HPA_*) — real microscopy with relevant proteins.
 *   3. Whatever else is available, in order.
 *
 * Always returns up to 3 conditions; an empty list is safe.
 */
function pickFeaturedDemos(conditions: readonly DemoCondition[]): DemoCondition[] {
  if (conditions.length === 0) return [];
  const priorityNames = [
    "control",
    "siSDC1",
    "heparinase",
    "HPA_SDC1_U2OS",
    "HPA_CD44_U251MG",
    "HPA_YAP1_U2OS",
  ];
  const featured: DemoCondition[] = [];
  const used = new Set<string>();
  for (const name of priorityNames) {
    const found = conditions.find((c) => c.name === name);
    if (found && !used.has(found.name)) {
      featured.push(found);
      used.add(found.name);
      if (featured.length === 3) return featured;
    }
  }
  // Fill remaining slots with whatever's available
  for (const c of conditions) {
    if (!used.has(c.name)) {
      featured.push(c);
      used.add(c.name);
      if (featured.length === 3) return featured;
    }
  }
  return featured;
}

/** Common confocal acquisition pixel sizes in µm/px.
 *
 * Pre-calculated from the standard objective × camera-pixel-pitch
 * combinations. The user MUST verify against their own microscope's
 * metadata — these are typical, not authoritative. Used as a
 * convenience picker so a Labouesse PI demo doesn't accidentally
 * leave the BBBC022 default 0.656 in place.
 */
const PIXEL_SIZE_PRESETS: ReadonlyArray<{ id: string; label: string; um: number }> = [
  { id: "leica-100x", label: "Leica 100× (0.063 µm)", um: 0.063 },
  { id: "zeiss-63x-airy", label: "Zeiss 63× Airyscan (0.084 µm)", um: 0.084 },
  { id: "leica-63x", label: "Leica 63× (0.103 µm)", um: 0.103 },
  { id: "zeiss-63x", label: "Zeiss 63× (0.137 µm)", um: 0.137 },
  { id: "zeiss-40x", label: "Zeiss 40× (0.163 µm)", um: 0.163 },
  { id: "zeiss-20x", label: "Zeiss 20× (0.227 µm)", um: 0.227 },
  { id: "leica-20x", label: "Leica 20× (0.325 µm)", um: 0.325 },
  { id: "leica-20x-2x", label: "Leica 20× 2× zoom (0.163 µm)", um: 0.163 },
  { id: "bbbc022", label: "BBBC022 (0.656 µm)", um: 0.656 },
];

function pixelSizePresetMatch(value: number): string {
  // Tolerance of 1% so floating-point drift from manual edits doesn't
  // unstick the dropdown — but a deliberate manual entry shows "custom".
  for (const p of PIXEL_SIZE_PRESETS) {
    if (Math.abs(p.um - value) / Math.max(p.um, 1e-9) < 0.01) return p.id;
  }
  return "custom";
}

export function LoaderView() {
  const job = useAnalysisJob();
  const setLatestRawPreviewUrl = useJobStore(s => s.setLatestRawPreviewUrl);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<
    { kind: "demo"; dataset: DemoCondition } | { kind: "upload"; file: File } | null
  >(null);
  const [cellDiameter, setCellDiameter] = useState(80);
  const [pixelSizeUm, setPixelSizeUm] = useState(0.656);
  const [includeDeep, setIncludeDeep] = useState(false);
  const [batchId, setBatchId] = useState("");
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

  // Note: previously we revoked the upload blob URL on unmount. The URL now outlives
  // this component because AnalysisView re-displays it in "Raw image" mode. It is
  // revoked together with clearLatestJobResult() when the user submits a new analysis.

  const previewSrc = useMemo(() => {
    if (!pending) return null;
    if (pending.kind === "demo") return demoPreviewUrl(pending.dataset.name);
    return uploadPreviewMut.data ?? null;
  }, [pending, uploadPreviewMut.data]);

  // Push the raw preview URL into the global store whenever it changes, so the
  // Analysis view's Raw toggle can render the untouched source composite.
  useEffect(() => {
    setLatestRawPreviewUrl(previewSrc);
  }, [previewSrc, setLatestRawPreviewUrl]);

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
      batchId: batchId.trim() || undefined,
    });
  };

  const conditions = demoQuery.data?.conditions ?? [];
  const featured = useMemo(() => pickFeaturedDemos(conditions), [conditions]);

  // Single source of truth for "user picked a demo" — used by both the
  // dropdown and the centre-screen featured tiles so the side-effects
  // stay in lockstep (sets pending + pixel size + channel assignments
  // + resets the running job).
  const selectDemo = (dataset: DemoCondition) => {
    setPending({ kind: "demo", dataset });
    if (dataset.pixel_size_um) setPixelSizeUm(dataset.pixel_size_um);
    setChannelAssignments(defaultAssignmentsFromManifest(dataset.slot_sources));
    job.reset();
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      {/* Full-bleed preview image */}
      <div className="absolute inset-0">
        {previewSrc ? (
          <img src={previewSrc} alt="Preview" className="w-full h-full object-cover" />
        ) : (
          <EmptyState featured={featured} onPickDemo={selectDemo} />
        )}
      </div>

      {/* Right: science-first control rail */}
      <div className="absolute top-0 right-0 h-full w-[380px] flex-shrink-0 bg-white/95 backdrop-blur-xl border-l border-gray-200 shadow-2xl overflow-y-auto z-10">
        <div className="p-6 space-y-5">

          {/* Brand + scientific purpose */}
          <section>
            <h2 className="text-[18px] font-bold text-gray-900 tracking-tight mb-1.5">GlycoQuant</h2>
            <p className="text-[11px] text-gray-600 leading-relaxed mb-2">
              Image-analysis platform for glycocalyx&ndash;mechanotransduction coupling, with per-cell readouts on standard fluorescence microscopy.
            </p>
            <p className="text-[11px] text-gray-500 leading-relaxed">
              Segments every cell with Cellpose-SAM, extracts 26 interpretable biophysical features
              (glycocalyx organisation, YAP nuclear localisation, focal-adhesion maturation, actin
              coherence, morphology), and quantifies the per-cell coupling between surface coat and
              mechanical signalling.
            </p>
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
                if (found) selectDemo(found);
              }}
              disabled={isRunning}
              defaultValue=""
              className="w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-[12px] text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="" disabled>
                {demoQuery.isLoading ? "Loading..." : `Select from ${conditions.length} datasets`}
              </option>
              {/* Featured datasets pinned at the top so the PI doesn't
                  scroll past 30 BBBC022 wells to find a Labouesse-relevant
                  exemplar. The "All datasets" optgroup carries everything,
                  including the featured ones again for completeness. */}
              {featured.length > 0 && (
                <optgroup label="\u2605 Featured">
                  {featured.map(c => (
                    <option key={`feat-${c.name}`} value={c.name}>
                      {c.display_name || c.name}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label={`All datasets (${conditions.length})`}>
                {conditions.map(c => (
                  <option key={c.name} value={c.name}>
                    {c.display_name || c.name}
                  </option>
                ))}
              </optgroup>
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
                    <div className="flex gap-1.5">
                      <input type="number" value={pixelSizeUm} min={0.05} max={2} step={0.005}
                        onChange={(e) => setPixelSizeUm(Number(e.target.value))}
                        disabled={isRunning}
                        className="w-full bg-white border border-gray-200 rounded-md px-2.5 py-1.5 text-[12px] text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <select
                        value={pixelSizePresetMatch(pixelSizeUm)}
                        onChange={(e) => {
                          const preset = PIXEL_SIZE_PRESETS.find(p => p.id === e.target.value);
                          if (preset) setPixelSizeUm(preset.um);
                        }}
                        disabled={isRunning}
                        title="Acquisition presets — picks the typical pixel size for common confocal optics. Always verify against your microscope's metadata."
                        className="bg-white border border-gray-200 rounded-md px-1.5 py-1.5 text-[10px] text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="custom">Preset…</option>
                        {PIXEL_SIZE_PRESETS.map(p => (
                          <option key={p.id} value={p.id}>{p.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="text-[9px] text-gray-400 mt-1 leading-tight">
                      Critical: every µm-native feature (FA size bins, ring width,
                      cortical ring, top-hat radius) is wrong if this is wrong. Set
                      it before each upload — the default 0.656 fits BBBC022 only.
                    </div>
                  </div>
                </div>
              </section>

              {/* 5. Channel assignment — supports up to 6 channels (5
                   canonical Labouesse panel + optional anti-HS antibody) */}
              <section>
                <ChannelAssignmentPanel
                  slotSources={pending.kind === "demo" ? pending.dataset.slot_sources : null}
                  nChannels={6}
                  value={channelAssignments}
                  onChange={setChannelAssignments}
                  disabled={isRunning}
                />
              </section>

              {/* 6. Batch identifier — optional. Multiple uploads
                   sharing the same batch_id can later be ComBat-corrected
                   together via the cross-session correction module. */}
              <section>
                <div className="flex items-center gap-1.5 leading-none mb-2">
                  <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-[1px]">
                    Batch ID (optional)
                  </span>
                </div>
                <input
                  type="text"
                  value={batchId}
                  onChange={(e) => setBatchId(e.target.value)}
                  disabled={isRunning}
                  placeholder="e.g. 2026-04-16_run_A"
                  className="w-full bg-white border border-gray-200 rounded-md px-2.5 py-1.5 text-[12px] text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <div className="text-[9px] text-gray-400 mt-1 leading-tight">
                  Group multiple uploads from the same imaging session for
                  cross-session ComBat correction (Johnson 2007). Leave
                  blank for single-image analyses.
                </div>
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


// ---------------------------------------------------------------------------
// Empty-state landing block (Tier 1 + Tier 2 polish)
// ---------------------------------------------------------------------------

/**
 * Faint dot-grid background. Pure black canvas reads as broken/loading
 * to a fresh user; a near-invisible texture plus a soft radial fade
 * communicates "this is the data viewport, currently empty" without
 * adding noise. Inline SVG to avoid a new asset.
 */
const CANVAS_PATTERN_DATA_URI =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32'>` +
      `<circle cx='1' cy='1' r='1' fill='%23ffffff' fill-opacity='0.06'/>` +
      `</svg>`,
  );

interface EmptyStateProps {
  featured: DemoCondition[];
  onPickDemo: (dataset: DemoCondition) => void;
}

/**
 * The pre-analysis landing screen. Three pieces of content, in order
 * of decreasing prominence:
 *
 *   1. The 3-step pipeline strip — a 30-second answer to "what does
 *      this thing do" so a PI dropping in cold has context.
 *   2. Three featured-demo tiles — click-to-load thumbnails. Removes
 *      the "what dataset" friction; PI sees actual microscopy
 *      previews instead of a wall of text.
 *   3. A subtle "or upload your own" affordance pointing at the rail.
 */
function EmptyState({ featured, onPickDemo }: EmptyStateProps) {
  return (
    <div
      className="w-full h-full flex items-center justify-center pr-[380px] px-8"
      style={{
        backgroundImage: `radial-gradient(circle at center, rgba(255,255,255,0.04) 0%, rgba(0,0,0,0) 60%), url("${CANVAS_PATTERN_DATA_URI}")`,
      }}
    >
      <div className="max-w-3xl w-full">
        <div className="text-center mb-8">
          <h1 className="text-white text-[32px] font-bold tracking-tight mb-3">
            GlycoQuant
          </h1>
          <p className="text-gray-400 text-[13px] leading-relaxed max-w-xl mx-auto">
            Image-analysis platform for glycocalyx&ndash;mechanotransduction
            coupling, with per-cell readouts on standard fluorescence microscopy.
          </p>
        </div>

        {/* Featured demo tiles — only render once the demo list has
            actually loaded so we don't flicker an empty grid. The 3-tile
            layout is intentional: more would scroll, fewer would feel
            sparse beneath the pipeline strip. */}
        {featured.length > 0 ? (
          <div className="mt-10">
            <div className="text-center text-gray-500 text-[10px] tracking-[0.12em] uppercase mb-4">
              Try a featured dataset
            </div>
            <div className="grid grid-cols-3 gap-3">
              {featured.map((c) => (
                <FeaturedDemoTile key={c.name} dataset={c} onPick={onPickDemo} />
              ))}
            </div>
            <div className="text-center text-gray-600 text-[10px] mt-4">
              or pick from the full list / upload your own &rarr;
            </div>
          </div>
        ) : (
          <div className="text-center text-gray-500 text-[10px] tracking-[0.12em] uppercase mt-10">
            Select a dataset on the right to begin
          </div>
        )}
      </div>
    </div>
  );
}

function FeaturedDemoTile({
  dataset,
  onPick,
}: {
  dataset: DemoCondition;
  onPick: (d: DemoCondition) => void;
}) {
  const [imgErrored, setImgErrored] = useState(false);
  const previewUrl = demoPreviewUrl(dataset.name);
  return (
    <button
      onClick={() => onPick(dataset)}
      className="group text-left rounded-lg overflow-hidden border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/20 transition-colors"
    >
      <div className="aspect-square bg-black/40 relative overflow-hidden">
        {imgErrored ? (
          <div className="w-full h-full flex items-center justify-center text-gray-600">
            <ImageIcon size={20} strokeWidth={1.5} />
          </div>
        ) : (
          <img
            src={previewUrl}
            alt={dataset.display_name || dataset.name}
            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
            onError={() => setImgErrored(true)}
          />
        )}
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/80 to-transparent" />
      </div>
      <div className="px-3 py-2">
        <div className="text-gray-100 text-[11px] font-semibold tracking-tight leading-tight truncate">
          {dataset.display_name || dataset.name}
        </div>
        <div className="text-gray-500 text-[9px] mt-0.5 truncate">
          {dataset.cell_line || dataset.gene || dataset.source || "demo"}
        </div>
      </div>
    </button>
  );
}
