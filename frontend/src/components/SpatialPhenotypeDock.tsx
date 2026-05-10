import { useMemo, useState, type ReactNode } from "react";
import { ChartScatter, ListTree, MapPinned, PanelBottomClose, PanelBottomOpen, Table2 } from "lucide-react";
import type { JobResult } from "@/lib/api";
import { extractPolygons, type CellFeatures, type CellPolygon } from "@/lib/canvas/extract";
import type { QcReport } from "@/lib/scientificGuards";
import { fmt, fmtSigned } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  result: JobResult;
  cells: CellFeatures[];
  qcReport: QcReport;
  selectedFeature: string;
  onSelectFeature: (feature: string) => void;
}

type DockTab = "spatial" | "distribution" | "groups";

interface SpatialFeatureRow {
  feature: string;
  moran: number;
  n: number;
  mean: number;
  sd: number;
}

const FEATURE_ALLOWLIST = [
  "mechano_score",
  "glycocalyx_pericellular_ratio",
  "glycocalyx_coverage",
  "glycocalyx_heterogeneity",
  "glycocalyx_radial_decay_rate",
  "actin_stress_fiber_coherence",
  "actin_cortical_ratio",
  "cell_area",
  "cell_solidity",
  "nuclear_area",
  "nuclear_solidity",
  "nuclear_to_cell_area_ratio",
  "yap_nc_ratio_size_corrected",
  "fa_density_per_um2",
  "fa_mature_fraction",
];

function displayFeatureName(name: string): string {
  return name
    .replace(/^mechano_score$/, "Mechanophenotype prototype score")
    .replace(/^glycocalyx_pericellular_ratio$/, "WGA proxy pericellular ratio")
    .replace(/^glycocalyx_/, "WGA proxy ")
    .replace(/^actin_stress_fiber_/, "actin ")
    .replace(/^actin_/, "actin ")
    .replace(/^yap_/, "YAP module ")
    .replace(/^fa_/, "FA module ")
    .replace(/^nuclear_/, "nuclear ")
    .replace(/^cell_/, "cell ")
    .replace(/_/g, " ");
}

function polygonsFromResult(result: JobResult): CellPolygon[] {
  if (result.cell_overlay?.polygons?.length) {
    return result.cell_overlay.polygons.map((p) => {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      let cx = 0;
      let cy = 0;
      for (const [x, y] of p.vertices) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        cx += x;
        cy += y;
      }
      const n = Math.max(1, p.vertices.length);
      return {
        cellId: p.cell_id,
        vertices: p.vertices,
        bbox: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
        centroid: [cx / n, cy / n] as [number, number],
      };
    });
  }
  return extractPolygons(result.segmentation_figure_json);
}

function numericFeatureKeys(cells: CellFeatures[]): string[] {
  const seen = new Set<string>();
  for (const cell of cells) {
    for (const [key, value] of Object.entries(cell)) {
      if (key === "cell_id" || key.startsWith("deep_")) continue;
      if (typeof value === "number" && Number.isFinite(value)) seen.add(key);
    }
  }
  const allowed = FEATURE_ALLOWLIST.filter((key) => seen.has(key));
  const extras = [...seen]
    .filter((key) => !FEATURE_ALLOWLIST.includes(key))
    .filter((key) => /(coherence|ratio|coverage|solidity|area|moran|entropy|score|density)/.test(key))
    .sort()
    .slice(0, 18);
  return [...allowed, ...extras];
}

function buildKnnEdges(points: Map<number, [number, number]>, k = 6): Array<[number, number]> {
  const ids = [...points.keys()];
  const edges: Array<[number, number]> = [];
  for (const id of ids) {
    const p = points.get(id);
    if (!p) continue;
    const nearest = ids
      .filter((other) => other !== id)
      .map((other) => {
        const q = points.get(other)!;
        return { other, d2: (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 };
      })
      .sort((a, b) => a.d2 - b.d2)
      .slice(0, k);
    for (const n of nearest) edges.push([id, n.other]);
  }
  return edges;
}

function computeMoran(values: Map<number, number>, edges: Array<[number, number]>): SpatialFeatureRow | null {
  const vals = [...values.values()];
  if (vals.length < 8 || edges.length === 0) return null;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, vals.length - 1));
  const denom = vals.reduce((a, b) => a + (b - mean) ** 2, 0);
  if (denom <= 1e-12 || sd <= 1e-12) return null;
  let numerator = 0;
  let weight = 0;
  for (const [a, b] of edges) {
    const av = values.get(a);
    const bv = values.get(b);
    if (av == null || bv == null) continue;
    numerator += (av - mean) * (bv - mean);
    weight += 1;
  }
  if (weight === 0) return null;
  return { feature: "", moran: (vals.length / weight) * (numerator / denom), n: vals.length, mean, sd };
}

function selectedFeatureStats(cells: CellFeatures[], feature: string) {
  const rows = cells
    .map((cell) => ({ id: Number(cell.cell_id), value: cell[feature] }))
    .filter((row): row is { id: number; value: number } => typeof row.value === "number" && Number.isFinite(row.value));
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => a.value - b.value);
  const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))].value;
  const mean = sorted.reduce((a, b) => a + b.value, 0) / sorted.length;
  return {
    rows,
    low: sorted.slice(0, Math.min(5, sorted.length)),
    high: sorted.slice(Math.max(0, sorted.length - 5)).reverse(),
    q10: q(0.1),
    q50: q(0.5),
    q90: q(0.9),
    mean,
  };
}

export function SpatialPhenotypeDock({ open, onOpen, onClose, result, cells, qcReport, selectedFeature, onSelectFeature }: Props) {
  const [tab, setTab] = useState<DockTab>("spatial");

  const polygons = useMemo(() => polygonsFromResult(result), [result]);
  const centroidById = useMemo(() => {
    const out = new Map<number, [number, number]>();
    for (const p of polygons) out.set(p.cellId, p.centroid);
    return out;
  }, [polygons]);
  const edges = useMemo(() => buildKnnEdges(centroidById), [centroidById]);

  const spatialRows = useMemo(() => {
    const readyIds = qcReport.analysisReadyIds;
    const rows: SpatialFeatureRow[] = [];
    const features = numericFeatureKeys(cells);
    for (const feature of features) {
      const values = new Map<number, number>();
      for (const cell of cells) {
        const id = Number(cell.cell_id);
        const value = cell[feature];
        if (!readyIds.has(id) || !centroidById.has(id)) continue;
        if (typeof value === "number" && Number.isFinite(value)) values.set(id, value);
      }
      const moran = computeMoran(values, edges);
      if (moran) rows.push({ ...moran, feature });
    }
    return rows.sort((a, b) => Math.abs(b.moran) - Math.abs(a.moran)).slice(0, 18);
  }, [cells, centroidById, edges, qcReport.analysisReadyIds]);

  const selectedStats = useMemo(
    () => selectedFeatureStats(cells.filter((cell) => qcReport.analysisReadyIds.has(Number(cell.cell_id))), selectedFeature),
    [cells, qcReport.analysisReadyIds, selectedFeature],
  );

  const selectedSpatial = spatialRows.find((row) => row.feature === selectedFeature) ?? spatialRows[0] ?? null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="pointer-events-auto rounded-full border border-gray-200 bg-white px-4 py-2 text-[11px] font-semibold text-gray-950 shadow-[0_8px_24px_rgba(15,23,42,0.12)] transition hover:bg-gray-50 hover:shadow-[0_10px_28px_rgba(15,23,42,0.16)]"
      >
        <span className="inline-flex items-center gap-1.5">
          <PanelBottomOpen size={14} strokeWidth={1.8} />
          Spatial table
        </span>
      </button>
    );
  }

  return (
    <div className="pointer-events-auto isolate w-full overflow-hidden rounded-2xl border border-gray-200/80 bg-white text-gray-950 shadow-[0_24px_80px_rgba(15,23,42,0.18)] ring-1 ring-black/[0.02]">
      <div className="flex items-center gap-2.5 border-b border-gray-100 bg-white px-4 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-gray-800">
          <Table2 size={14} strokeWidth={1.8} />
        </div>
        <div className="min-w-0">
          <div className="text-[12px] font-semibold text-gray-950">Spatial phenotyping</div>
          <div className="truncate text-[10px] text-gray-600">
            Cell centroids as spots; feature maps are field-local and descriptive.
          </div>
        </div>
        <div className="ml-auto flex gap-1 rounded-full bg-gray-100/80 p-1 ring-1 ring-gray-200/70">
          <TabButton label="Spatial" icon={<MapPinned size={12} />} active={tab === "spatial"} onClick={() => setTab("spatial")} />
          <TabButton label="Distribution" icon={<ChartScatter size={12} />} active={tab === "distribution"} onClick={() => setTab("distribution")} />
          <TabButton label="Groups" icon={<ListTree size={12} />} active={tab === "groups"} onClick={() => setTab("groups")} />
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-full text-gray-600 transition hover:bg-gray-100 hover:text-gray-950"
          title="Collapse spatial table"
        >
          <PanelBottomClose size={15} strokeWidth={1.8} />
        </button>
      </div>

      {tab === "spatial" && (
        <div className="grid h-[230px] min-h-0 grid-cols-[minmax(0,1fr),210px] overflow-hidden bg-white">
          <div className="min-h-0 overflow-auto">
            <table className="w-full text-left text-[11px]">
              <thead className="sticky top-0 z-10 border-b border-gray-100 bg-white text-[10px] uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Feature</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Moran's I</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Cells</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Mean</th>
                  <th className="px-4 py-2.5 text-right font-semibold">SD</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {spatialRows.map((row) => (
                  <tr
                    key={row.feature}
                    onClick={() => onSelectFeature(row.feature)}
                    className={`cursor-pointer transition ${
                      selectedFeature === row.feature ? "bg-gray-100" : "bg-white hover:bg-gray-50"
                    }`}
                    title="Click to map this feature on the cell masks"
                  >
                    <td className="px-4 py-2 font-medium text-gray-950">{displayFeatureName(row.feature)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-900">{fmtSigned(row.moran)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-700">{row.n}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-700">{fmt(row.mean)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-700">{fmt(row.sd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <SummaryPanel row={selectedSpatial} selectedFeature={selectedFeature} />
        </div>
      )}

      {tab === "distribution" && (
        <div className="grid h-[230px] min-h-0 grid-cols-[minmax(0,1fr),minmax(0,1fr)] gap-0 overflow-hidden">
          <DistributionPanel stats={selectedStats} feature={selectedFeature} />
          <ExtremesPanel stats={selectedStats} />
        </div>
      )}

      {tab === "groups" && (
        <GroupPanel stats={selectedStats} feature={selectedFeature} onSelectFeature={onSelectFeature} rows={spatialRows} />
      )}
    </div>
  );
}

function TabButton({ label, icon, active, onClick }: { label: string; icon: ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[10px] font-medium transition ${
        active ? "bg-gray-950 text-white shadow-sm" : "text-gray-600 hover:bg-white hover:text-gray-950"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function SummaryPanel({ row, selectedFeature }: { row: SpatialFeatureRow | null; selectedFeature: string }) {
  return (
    <div className="min-h-0 overflow-y-auto border-l border-gray-100 bg-gray-50/40 p-4">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Mapped feature</div>
      <div className="mt-1 text-[13px] font-semibold leading-snug text-gray-950">
        {displayFeatureName(selectedFeature)}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <MiniMetric label="Moran's I" value={row ? fmtSigned(row.moran) : "n/a"} />
        <MiniMetric label="Cells" value={row ? String(row.n) : "n/a"} />
        <MiniMetric label="Mean" value={row ? fmt(row.mean) : "n/a"} />
        <MiniMetric label="SD" value={row ? fmt(row.sd) : "n/a"} />
      </div>
      <div className="mt-3 rounded-xl border border-amber-200/80 bg-amber-50 px-3 py-2.5 text-[10px] leading-relaxed text-amber-900">
        Moran's I is computed from k-nearest cell centroids within this field. It is a spatial structure descriptor, not a treatment effect.
      </div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-2.5 py-2 shadow-sm">
      <div className="text-[12px] font-semibold text-gray-950 tabular-nums">{value}</div>
      <div className="text-[9px] font-semibold uppercase tracking-wide text-gray-500">{label}</div>
    </div>
  );
}

function DistributionPanel({ stats, feature }: { stats: ReturnType<typeof selectedFeatureStats>; feature: string }) {
  return (
    <div className="border-r border-gray-100 bg-white p-4">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Feature distribution</div>
      <div className="mt-1 text-[13px] font-semibold text-gray-950">{displayFeatureName(feature)}</div>
      <div className="mt-4 grid grid-cols-4 gap-2">
        <MiniMetric label="n" value={stats ? String(stats.rows.length) : "n/a"} />
        <MiniMetric label="q10" value={stats ? fmt(stats.q10) : "n/a"} />
        <MiniMetric label="median" value={stats ? fmt(stats.q50) : "n/a"} />
        <MiniMetric label="q90" value={stats ? fmt(stats.q90) : "n/a"} />
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-gray-100">
        {stats && (
          <div className="h-full rounded-full bg-gray-950" style={{ width: "70%" }} />
        )}
      </div>
      <div className="mt-2 text-[10px] text-gray-600">
        Quantiles are computed after QC filtering. Use the table to map a different feature.
      </div>
    </div>
  );
}

function ExtremesPanel({ stats }: { stats: ReturnType<typeof selectedFeatureStats> }) {
  return (
    <div className="grid grid-cols-2 gap-0">
      <ExtremeList title="Lowest cells" rows={stats?.low ?? []} />
      <ExtremeList title="Highest cells" rows={stats?.high ?? []} />
    </div>
  );
}

function ExtremeList({ title, rows }: { title: string; rows: Array<{ id: number; value: number }> }) {
  return (
      <div className="border-r border-gray-100 bg-white p-4 last:border-r-0">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500">{title}</div>
      <div className="space-y-1.5">
        {rows.map((row) => (
          <div key={`${title}-${row.id}`} className="flex items-center justify-between rounded-full bg-gray-50 px-3 py-1.5 text-[11px] ring-1 ring-gray-100">
            <span className="font-medium text-gray-800">Cell {row.id}</span>
            <span className="tabular-nums text-gray-700">{fmt(row.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function GroupPanel({
  stats,
  feature,
  onSelectFeature,
  rows,
}: {
  stats: ReturnType<typeof selectedFeatureStats>;
  feature: string;
  onSelectFeature: (feature: string) => void;
  rows: SpatialFeatureRow[];
}) {
  const low = stats ? stats.rows.filter((row) => row.value <= stats.q10).length : 0;
  const mid = stats ? stats.rows.filter((row) => row.value > stats.q10 && row.value < stats.q90).length : 0;
  const high = stats ? stats.rows.filter((row) => row.value >= stats.q90).length : 0;
  return (
    <div className="grid h-[230px] min-h-0 grid-cols-[260px,minmax(0,1fr)] overflow-hidden">
      <div className="border-r border-gray-100 bg-white p-4">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Feature-stratified groups</div>
        <div className="mt-1 text-[13px] font-semibold text-gray-950">{displayFeatureName(feature)}</div>
        <div className="mt-3 space-y-2">
          <GroupRow label="Low decile" count={low} tone="bg-blue-500" />
          <GroupRow label="Middle range" count={mid} tone="bg-gray-400" />
          <GroupRow label="High decile" count={high} tone="bg-red-500" />
        </div>
        <div className="mt-3 text-[10px] leading-relaxed text-gray-600">
          These groups are thresholded from one selected feature. They are not unsupervised biological clusters.
        </div>
      </div>
      <div className="min-h-0 overflow-auto bg-white p-4">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500">Map another spatial feature</div>
        <div className="grid grid-cols-2 gap-2">
          {rows.slice(0, 10).map((row) => (
            <button
              key={row.feature}
              type="button"
              onClick={() => onSelectFeature(row.feature)}
              className={`rounded-xl border px-3 py-2.5 text-left transition ${
                row.feature === feature ? "border-gray-950 bg-gray-100 shadow-sm" : "border-gray-200 bg-white hover:bg-gray-50 hover:shadow-sm"
              }`}
            >
              <div className="truncate text-[11px] font-medium text-gray-900">{displayFeatureName(row.feature)}</div>
              <div className="mt-0.5 text-[10px] tabular-nums text-gray-500">Moran's I {fmtSigned(row.moran)}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function GroupRow({ label, count, tone }: { label: string; count: number; tone: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-3 py-2 text-[11px] shadow-sm">
      <span className="inline-flex items-center gap-2 font-medium text-gray-800">
        <span className={`h-2.5 w-2.5 rounded-full ${tone}`} />
        {label}
      </span>
      <span className="tabular-nums text-gray-500">{count}</span>
    </div>
  );
}
