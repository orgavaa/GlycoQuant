import { useMutation, useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  Check,
  Cpu,
  Database,
  Filter,
  ImageIcon,
  Layers,
  Play,
  Search,
  Settings,
  SlidersHorizontal,
  Upload,
  X,
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

type PendingSource =
  | { kind: "demo"; dataset: DemoCondition }
  | { kind: "upload"; file: File };

type FieldCardItem =
  | { kind: "demo"; id: string; dataset: DemoCondition }
  | { kind: "upload"; id: "upload"; file: File; previewUrl: string | null };

type CollectionScope = "all" | "featured";
type SourceFilter = "all" | "bundled" | "real" | "substitute";
type ChannelFilter =
  | "all"
  | "dapi"
  | "glycocalyx"
  | "yap"
  | "paxillin"
  | "actin"
  | "heparan_sulfate"
  | "substitute";
type SortMode = "name" | "source" | "cell_line" | "pixel_size";

const CHANNEL_FILTERS: ReadonlyArray<{ id: ChannelFilter; label: string }> = [
  { id: "all", label: "All channels" },
  { id: "dapi", label: "Nuclear stain" },
  { id: "glycocalyx", label: "WGA lectin" },
  { id: "yap", label: "YAP/TAZ" },
  { id: "paxillin", label: "Paxillin" },
  { id: "actin", label: "Actin" },
  { id: "heparan_sulfate", label: "anti-HS" },
  { id: "substitute", label: "Substitute channel" },
];

const SOURCE_FILTERS: ReadonlyArray<{ id: SourceFilter; label: string }> = [
  { id: "all", label: "All sources" },
  { id: "bundled", label: "Bundled" },
  { id: "real", label: "Real microscopy" },
  { id: "substitute", label: "Synthetic/substitute" },
];

const CHANNEL_LABELS: Record<string, string> = {
  dapi: "DAPI",
  glycocalyx: "WGA",
  yap: "YAP/TAZ",
  paxillin: "Paxillin",
  actin: "Actin",
  heparan_sulfate: "anti-HS",
};

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

  for (const c of conditions) {
    if (!used.has(c.name)) {
      featured.push(c);
      used.add(c.name);
      if (featured.length === 3) return featured;
    }
  }
  return featured;
}

const PIXEL_SIZE_PRESETS: ReadonlyArray<{ id: string; label: string; um: number }> = [
  { id: "leica-100x", label: "Leica 100x (0.063 um)", um: 0.063 },
  { id: "zeiss-63x-airy", label: "Zeiss 63x Airyscan (0.084 um)", um: 0.084 },
  { id: "leica-63x", label: "Leica 63x (0.103 um)", um: 0.103 },
  { id: "zeiss-63x", label: "Zeiss 63x (0.137 um)", um: 0.137 },
  { id: "zeiss-40x", label: "Zeiss 40x (0.163 um)", um: 0.163 },
  { id: "zeiss-20x", label: "Zeiss 20x (0.227 um)", um: 0.227 },
  { id: "leica-20x", label: "Leica 20x (0.325 um)", um: 0.325 },
  { id: "leica-20x-2x", label: "Leica 20x 2x zoom (0.163 um)", um: 0.163 },
  { id: "bbbc022", label: "BBBC022 (0.656 um)", um: 0.656 },
];

function pixelSizePresetMatch(value: number): string {
  for (const p of PIXEL_SIZE_PRESETS) {
    if (Math.abs(p.um - value) / Math.max(p.um, 1e-9) < 0.01) return p.id;
  }
  return "custom";
}

function hasSubstituteChannel(dataset: DemoCondition): boolean {
  return Object.values(dataset.slot_sources ?? {}).some(
    (source) => !source.matches_labouesse_protocol,
  );
}

function fieldLabel(item: FieldCardItem): string {
  if (item.kind === "upload") return item.file.name;
  return item.dataset.display_name || item.dataset.name;
}

function fieldSource(item: FieldCardItem): string {
  if (item.kind === "upload") return "Upload";
  return item.dataset.source || "Bundled";
}

function fieldCellLine(item: FieldCardItem): string {
  if (item.kind === "upload") return "User file";
  return item.dataset.cell_line || "Cell line not specified";
}

function fieldPixelSize(item: FieldCardItem): number | null {
  if (item.kind === "upload") return null;
  return item.dataset.pixel_size_um ?? null;
}

function assayBadges(dataset: DemoCondition): string[] {
  const labels: string[] = [];
  for (const key of Object.keys(CHANNEL_LABELS)) {
    const source = dataset.slot_sources?.[key];
    if (source?.matches_labouesse_protocol) labels.push(CHANNEL_LABELS[key]);
  }
  if (hasSubstituteChannel(dataset)) labels.push("substitute channel");
  return labels;
}

function uploadAssayBadges(assignments: Record<string, string>): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const role of Object.values(assignments)) {
    const label = CHANNEL_LABELS[role];
    if (label && !seen.has(label)) {
      seen.add(label);
      labels.push(label);
    }
  }
  return labels;
}

function searchText(item: FieldCardItem, assignments: Record<string, string>): string {
  if (item.kind === "upload") {
    return [item.file.name, "upload", ...uploadAssayBadges(assignments)]
      .join(" ")
      .toLowerCase();
  }
  const channelText = Object.values(item.dataset.slot_sources ?? {})
    .map((source) => `${source.biological_identity} ${source.note ?? ""}`)
    .join(" ");
  return [
    item.dataset.name,
    item.dataset.display_name,
    item.dataset.source,
    item.dataset.gene,
    item.dataset.cell_line,
    item.dataset.attribution,
    channelText,
  ]
    .join(" ")
    .toLowerCase();
}

function matchesSourceFilter(item: FieldCardItem, filter: SourceFilter): boolean {
  if (filter === "all") return true;
  if (item.kind === "upload") return false;
  if (filter === "bundled") return true;
  if (filter === "real") return item.dataset.is_real_microscopy;
  return !item.dataset.is_real_microscopy || hasSubstituteChannel(item.dataset);
}

function matchesChannelFilter(
  item: FieldCardItem,
  filter: ChannelFilter,
  assignments: Record<string, string>,
): boolean {
  if (filter === "all") return true;
  if (item.kind === "upload") {
    if (filter === "substitute") return false;
    return Object.values(assignments).includes(filter);
  }
  if (filter === "substitute") return hasSubstituteChannel(item.dataset);
  return Boolean(item.dataset.slot_sources?.[filter]?.matches_labouesse_protocol);
}

function compareFields(sortMode: SortMode, a: FieldCardItem, b: FieldCardItem): number {
  if (sortMode === "source") {
    return fieldSource(a).localeCompare(fieldSource(b)) || fieldLabel(a).localeCompare(fieldLabel(b));
  }
  if (sortMode === "cell_line") {
    return fieldCellLine(a).localeCompare(fieldCellLine(b)) || fieldLabel(a).localeCompare(fieldLabel(b));
  }
  if (sortMode === "pixel_size") {
    const av = fieldPixelSize(a) ?? Number.POSITIVE_INFINITY;
    const bv = fieldPixelSize(b) ?? Number.POSITIVE_INFINITY;
    return av - bv || fieldLabel(a).localeCompare(fieldLabel(b));
  }
  return fieldLabel(a).localeCompare(fieldLabel(b));
}

export function LoaderView() {
  const job = useAnalysisJob();
  const setLatestRawPreviewUrl = useJobStore((s) => s.setLatestRawPreviewUrl);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingSource | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [cellDiameter, setCellDiameter] = useState(80);
  const [pixelSizeUm, setPixelSizeUm] = useState(0.656);
  const [includeDeep, setIncludeDeep] = useState(false);
  const [batchId, setBatchId] = useState("");
  const [channelAssignments, setChannelAssignments] = useState<Record<string, string>>(
    defaultPositionalAssignments(),
  );
  const [collectionScope, setCollectionScope] = useState<CollectionScope>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("name");
  const [searchQuery, setSearchQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(true);

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

  const previewSrc = useMemo(() => {
    if (!pending) return null;
    if (pending.kind === "demo") return demoPreviewUrl(pending.dataset.name);
    return uploadPreviewMut.data ?? null;
  }, [pending, uploadPreviewMut.data]);

  useEffect(() => {
    setLatestRawPreviewUrl(previewSrc);
  }, [previewSrc, setLatestRawPreviewUrl]);

  const conditions = demoQuery.data?.conditions ?? [];
  const featured = useMemo(() => pickFeaturedDemos(conditions), [conditions]);
  const featuredIds = useMemo(() => new Set(featured.map((d) => d.name)), [featured]);

  const cards = useMemo<FieldCardItem[]>(() => {
    const demoCards: FieldCardItem[] = conditions.map((dataset) => ({
      kind: "demo",
      id: dataset.name,
      dataset,
    }));
    if (!uploadedFile) return demoCards;
    return [
      {
        kind: "upload",
        id: "upload",
        file: uploadedFile,
        previewUrl: uploadPreviewMut.data ?? null,
      },
      ...demoCards,
    ];
  }, [conditions, uploadedFile, uploadPreviewMut.data]);

  const filteredCards = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return cards
      .filter((item) => collectionScope === "all" || item.kind === "upload" || featuredIds.has(item.dataset.name))
      .filter((item) => matchesSourceFilter(item, sourceFilter))
      .filter((item) => matchesChannelFilter(item, channelFilter, channelAssignments))
      .filter((item) => !q || searchText(item, channelAssignments).includes(q))
      .sort((a, b) => compareFields(sortMode, a, b));
  }, [
    cards,
    collectionScope,
    featuredIds,
    sourceFilter,
    channelFilter,
    channelAssignments,
    searchQuery,
    sortMode,
  ]);

  const selectDemo = (dataset: DemoCondition) => {
    setPending({ kind: "demo", dataset });
    if (dataset.pixel_size_um) setPixelSizeUm(dataset.pixel_size_um);
    setChannelAssignments(defaultAssignmentsFromManifest(dataset.slot_sources));
    job.reset();
  };

  const selectUpload = (file: File) => {
    setUploadedFile(file);
    setPending({ kind: "upload", file });
    setChannelAssignments(defaultPositionalAssignments());
    job.reset();
  };

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

  const selectedLabel =
    pending?.kind === "demo"
      ? pending.dataset.display_name || pending.dataset.name
      : pending?.file.name ?? "No field selected";

  return (
    <div className="h-full overflow-y-auto bg-gray-50 xl:overflow-hidden">
      <div className="flex min-h-full flex-col xl:h-full xl:flex-row">
        {filtersOpen && (
          <aside className="border-b border-gray-200 bg-white xl:h-full xl:w-[292px] xl:flex-shrink-0 xl:overflow-y-auto xl:border-b-0 xl:border-r">
            <div className="px-4 py-4">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gray-100 text-gray-700">
                  <Database size={16} strokeWidth={1.8} />
                </div>
                <div className="min-w-0">
                  <div className="text-[15px] font-semibold text-gray-900">Dataset</div>
                  <div className="text-[11px] text-gray-500">{conditions.length} demo fields</div>
                </div>
              </div>

              <label className="mb-4 block">
                <span className="mb-1 block text-[10px] font-semibold uppercase text-gray-400">
                  Collection
                </span>
                <select
                  value={collectionScope}
                  onChange={(e) => setCollectionScope(e.target.value as CollectionScope)}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-[12px] text-gray-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="all">All available fields</option>
                  <option value="featured">Featured fields</option>
                </select>
              </label>

              <input
                ref={fileRef}
                type="file"
                accept=".tif,.tiff,.png"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) selectUpload(f);
                }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={isRunning}
                className="mb-5 flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-gray-300 bg-gray-50 px-3 py-2 text-[12px] font-medium text-gray-700 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Upload size={14} strokeWidth={1.7} />
                Select TIFF or PNG
              </button>

              <FilterGroup title="Source">
                {SOURCE_FILTERS.map((option) => (
                  <FilterOption
                    key={option.id}
                    label={option.label}
                    active={sourceFilter === option.id}
                    onClick={() => setSourceFilter(option.id)}
                  />
                ))}
              </FilterGroup>

              <FilterGroup title="Channel">
                {CHANNEL_FILTERS.map((option) => (
                  <FilterOption
                    key={option.id}
                    label={option.label}
                    active={channelFilter === option.id}
                    onClick={() => setChannelFilter(option.id)}
                  />
                ))}
              </FilterGroup>
            </div>
          </aside>
        )}

        <main className="flex min-h-[560px] flex-1 flex-col xl:h-full xl:min-h-0">
          <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 bg-white px-5 py-3">
            <div className="flex min-w-[160px] items-center gap-2">
              <span className="text-[13px] font-semibold text-gray-900">Fields</span>
              <span className="text-[11px] text-gray-500">
                {filteredCards.length} / {cards.length}
              </span>
            </div>

            <div className="relative min-w-[260px] flex-1">
              <Search
                size={15}
                strokeWidth={1.7}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search fields, source, cell line, channel..."
                className="w-full rounded-md border border-gray-300 bg-white py-2 pl-9 pr-8 text-[12px] text-gray-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                  title="Clear search"
                >
                  <X size={13} strokeWidth={1.7} />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 py-2 text-[12px] text-gray-700">
                <ArrowUp size={14} strokeWidth={1.7} className="text-gray-500" />
                <select
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as SortMode)}
                  className="bg-transparent text-[12px] outline-none"
                  title="Sort fields"
                >
                  <option value="name">Name</option>
                  <option value="source">Source</option>
                  <option value="cell_line">Cell line</option>
                  <option value="pixel_size">Pixel size</option>
                </select>
              </label>
              <button
                type="button"
                onClick={() => setFiltersOpen((v) => !v)}
                className={`flex h-9 w-9 items-center justify-center rounded-md border transition ${
                  filtersOpen
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                }`}
                title={filtersOpen ? "Hide filters" : "Show filters"}
              >
                <Filter size={15} strokeWidth={1.7} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-5">
            {demoQuery.isLoading ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
                {Array.from({ length: 9 }, (_, i) => (
                  <div key={i} className="h-[220px] rounded-lg border border-gray-200 bg-white shadow-sm">
                    <div className="h-28 rounded-t-lg bg-gray-100" />
                    <div className="space-y-2 p-4">
                      <div className="h-3 w-2/3 rounded bg-gray-100" />
                      <div className="h-3 w-1/2 rounded bg-gray-100" />
                      <div className="h-6 w-full rounded bg-gray-100" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredCards.length === 0 ? (
              <div className="flex h-full min-h-[360px] items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white text-[12px] text-gray-500">
                No fields match the current filters.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
                {filteredCards.map((item) => (
                  <FieldCard
                    key={item.id}
                    item={item}
                    selected={
                      pending?.kind === item.kind &&
                      (item.kind === "upload" ||
                        (pending.kind === "demo" && pending.dataset.name === item.dataset.name))
                    }
                    channelAssignments={channelAssignments}
                    onSelect={() => {
                      if (item.kind === "demo") selectDemo(item.dataset);
                      else setPending({ kind: "upload", file: item.file });
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </main>

        <aside className="border-t border-gray-200 bg-white xl:h-full xl:w-[430px] xl:flex-shrink-0 xl:overflow-y-auto xl:border-l xl:border-t-0">
          <div className="border-b border-gray-200 px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase text-gray-400">
                  Field
                </div>
                <h1 className="mt-1 truncate text-[18px] font-semibold text-gray-950">
                  {selectedLabel}
                </h1>
              </div>
              <SlidersHorizontal size={17} strokeWidth={1.7} className="mt-1 flex-shrink-0 text-gray-400" />
            </div>
          </div>

          <div className="space-y-5 px-5 py-5">
            <PreviewBlock pending={pending} previewSrc={previewSrc} loading={pending?.kind === "upload" && uploadPreviewMut.isPending} />

            <MetadataBlock pending={pending} pixelSizeUm={pixelSizeUm} channelAssignments={channelAssignments} />

            <SectionHeader icon={<Settings size={13} strokeWidth={1.6} />} label="Acquisition" />
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-[10px] font-medium text-gray-500">
                  Cell diameter, px
                </span>
                <input
                  type="number"
                  value={cellDiameter}
                  min={10}
                  max={300}
                  step={5}
                  onChange={(e) => setCellDiameter(Number(e.target.value))}
                  disabled={isRunning}
                  className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-[12px] text-gray-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] font-medium text-gray-500">
                  Pixel size, um
                </span>
                <input
                  type="number"
                  value={pixelSizeUm}
                  min={0.05}
                  max={2}
                  step={0.005}
                  onChange={(e) => setPixelSizeUm(Number(e.target.value))}
                  disabled={isRunning}
                  className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-[12px] text-gray-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </label>
            </div>
            <select
              value={pixelSizePresetMatch(pixelSizeUm)}
              onChange={(e) => {
                const preset = PIXEL_SIZE_PRESETS.find((p) => p.id === e.target.value);
                if (preset) setPixelSizeUm(preset.um);
              }}
              disabled={isRunning}
              title="Pixel size preset. Verify against image metadata before analysis."
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-[12px] text-gray-800 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              <option value="custom">Custom pixel size</option>
              {PIXEL_SIZE_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>

            <div className="border-t border-gray-100 pt-5">
              <SectionHeader icon={<Layers size={13} strokeWidth={1.6} />} label="Channel roles" />
              <div className="mt-3">
                <ChannelAssignmentPanel
                  slotSources={pending?.kind === "demo" ? pending.dataset.slot_sources : null}
                  nChannels={6}
                  value={channelAssignments}
                  onChange={setChannelAssignments}
                  disabled={isRunning}
                />
              </div>
            </div>

            <div className="border-t border-gray-100 pt-5">
              <SectionHeader icon={<Cpu size={13} strokeWidth={1.6} />} label="Analysis run" />
              <div className="mt-3 space-y-3">
                <label className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-[12px] text-gray-700">
                  <input
                    type="checkbox"
                    checked={includeDeep}
                    onChange={(e) => setIncludeDeep(e.target.checked)}
                    disabled={isRunning}
                    className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>Cell-DINO embeddings</span>
                  <span className="ml-auto text-[10px] uppercase text-gray-400">optional</span>
                </label>

                <label className="block">
                  <span className="mb-1 block text-[10px] font-medium uppercase text-gray-400">
                    Batch ID
                  </span>
                  <input
                    type="text"
                    value={batchId}
                    onChange={(e) => setBatchId(e.target.value)}
                    disabled={isRunning}
                    placeholder="2026-04-16_run_A"
                    className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-[12px] text-gray-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </label>

                <button
                  type="button"
                  onClick={handleRun}
                  disabled={!pending || isRunning}
                  className="flex w-full items-center justify-center gap-2 rounded-md bg-gray-950 px-4 py-2.5 text-[12px] font-semibold text-white shadow-sm transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300"
                >
                  <Play size={14} strokeWidth={1.7} />
                  {isRunning ? "Running analysis" : "Run analysis"}
                </button>
              </div>
            </div>

            {isRunning && (
              <PipelineProgress
                progress={job.progress}
                submittedAt={job.submittedAt}
                includesDeep={job.includesDeep}
                isGpu={true}
              />
            )}

            {(job.submit.isError || job.isFailed) && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-[11px] text-red-700">
                {job.isFailed
                  ? (job.status?.error ?? "Pipeline failed on the server.")
                  : ((job.submit.error as Error)?.message ?? "Pipeline failed")}
              </div>
            )}

            {job.result?.warnings && job.result.warnings.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                {job.result.warnings.map((w, i) => (
                  <div key={i} className="text-[10px] text-amber-800">
                    {w}
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-gray-100 py-4">
      <div className="mb-2 text-[10px] font-semibold uppercase text-gray-400">{title}</div>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function FilterOption({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-[12px] transition ${
        active ? "bg-gray-100 text-gray-950" : "text-gray-600 hover:bg-gray-50 hover:text-gray-950"
      }`}
    >
      <span className="truncate">{label}</span>
      {active && <Check size={13} strokeWidth={1.8} className="flex-shrink-0 text-gray-700" />}
    </button>
  );
}

function FieldCard({
  item,
  selected,
  channelAssignments,
  onSelect,
}: {
  item: FieldCardItem;
  selected: boolean;
  channelAssignments: Record<string, string>;
  onSelect: () => void;
}) {
  const [imgErrored, setImgErrored] = useState(false);
  const previewUrl = item.kind === "demo" ? demoPreviewUrl(item.dataset.name) : item.previewUrl;
  const badges = item.kind === "demo" ? assayBadges(item.dataset) : uploadAssayBadges(channelAssignments);
  const pixelSize = fieldPixelSize(item);
  const sourceState =
    item.kind === "upload"
      ? "Upload"
      : item.dataset.is_real_microscopy && !hasSubstituteChannel(item.dataset)
        ? "Real microscopy"
        : "Synthetic/substitute";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group overflow-hidden rounded-lg border bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
        selected ? "border-gray-950 ring-1 ring-gray-950" : "border-gray-200"
      }`}
    >
      <div className="relative aspect-[16/9] overflow-hidden bg-gray-100">
        {previewUrl && !imgErrored ? (
          <img
            src={previewUrl}
            alt={fieldLabel(item)}
            loading="lazy"
            className="h-full w-full object-cover"
            onError={() => setImgErrored(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-gray-400">
            <ImageIcon size={24} strokeWidth={1.5} />
          </div>
        )}
        {selected && (
          <div className="absolute right-2 top-2 rounded-md bg-gray-950 px-2 py-1 text-[10px] font-medium text-white">
            Selected
          </div>
        )}
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-semibold text-gray-950">{fieldLabel(item)}</h3>
            <div className="mt-1 truncate text-[11px] text-gray-500">
              {fieldCellLine(item)} / {fieldSource(item)}
            </div>
          </div>
          <span className="flex-shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">
            {sourceState}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {badges.slice(0, 6).map((badge) => (
            <AssayBadge key={badge} label={badge} />
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3 text-[11px] text-gray-500">
          <span>Pixel size</span>
          <span className="font-medium text-gray-800" style={{ fontFeatureSettings: "'tnum'" }}>
            {pixelSize != null ? `${pixelSize} um/px` : "set before run"}
          </span>
        </div>
      </div>
    </button>
  );
}

function PreviewBlock({
  pending,
  previewSrc,
  loading,
}: {
  pending: PendingSource | null;
  previewSrc: string | null;
  loading: boolean;
}) {
  return (
    <div>
      <div className="mb-2 text-[10px] font-semibold uppercase text-gray-400">
        Image preview
      </div>
      <div className="aspect-[4/3] overflow-hidden rounded-lg border border-gray-200 bg-gray-100">
        {previewSrc ? (
          <img
            src={previewSrc}
            alt={pending?.kind === "demo" ? pending.dataset.display_name || pending.dataset.name : pending?.file.name ?? "Preview"}
            className="h-full w-full object-contain bg-black"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-gray-400">
            <ImageIcon size={24} strokeWidth={1.5} />
            <span className="text-[11px]">{loading ? "Preparing preview" : "No field selected"}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function MetadataBlock({
  pending,
  pixelSizeUm,
  channelAssignments,
}: {
  pending: PendingSource | null;
  pixelSizeUm: number;
  channelAssignments: Record<string, string>;
}) {
  if (!pending) {
    return (
      <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-[11px] text-gray-500">
        Select a field to review source metadata and run parameters.
      </div>
    );
  }

  const rows =
    pending.kind === "demo"
      ? [
          ["Cell line", pending.dataset.cell_line || "not specified"],
          ["Source", pending.dataset.source || "bundled"],
          ["Perturbation", pending.dataset.gene || "not specified"],
          ["Pixel size", pending.dataset.pixel_size_um ? `${pending.dataset.pixel_size_um} um/px` : `${pixelSizeUm} um/px`],
          ["Channel status", hasSubstituteChannel(pending.dataset) ? "substitute channel present" : "protocol-matched"],
        ]
      : [
          ["Type", "uploaded image"],
          ["File", pending.file.name],
          ["Size", `${(pending.file.size / 1024 / 1024).toFixed(2)} MB`],
          ["Pixel size", `${pixelSizeUm} um/px`],
          ["Channel status", "user assigned"],
        ];

  const badges =
    pending.kind === "demo" ? assayBadges(pending.dataset) : uploadAssayBadges(channelAssignments);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[104px,1fr] gap-x-3 gap-y-1.5 text-[11px]">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <div className="text-gray-400">{label}</div>
            <div className="min-w-0 truncate font-medium text-gray-800" title={value}>
              {value}
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {badges.map((badge) => (
          <AssayBadge key={badge} label={badge} />
        ))}
      </div>
    </div>
  );
}

function SectionHeader({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-gray-400">{icon}</span>
      <span className="text-[11px] font-semibold uppercase text-gray-400">{label}</span>
    </div>
  );
}

function AssayBadge({ label }: { label: string }) {
  return (
    <span className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
      {label}
    </span>
  );
}
