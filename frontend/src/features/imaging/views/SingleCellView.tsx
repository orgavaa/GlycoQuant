/**
 * Single Cell — the inspection screen.
 *
 * One selected cell, evidence tabs for each compartment, and a
 * plain-English state line at the top per UI_SCIENCE_GUIDELINES §6.
 *
 * The selected cell ID lives in jobStore.selectedCellId so the
 * Overview canvas, this view, and Methods & QC stay in lock-step.
 */
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useJobStore } from "@/lib/jobStore";
import { fmt } from "@/lib/utils";
import type { JobResult } from "@/lib/api";

interface SingleCellViewProps {
  result: JobResult;
}

interface CellRow {
  cell_id: number;
  [key: string]: number | undefined;
}

export function SingleCellView({ result }: SingleCellViewProps) {
  const selectedCellId = useJobStore((s) => s.selectedCellId);
  const setSelectedCellId = useJobStore((s) => s.setSelectedCellId);

  const rows: CellRow[] = useMemo(() => {
    try {
      return JSON.parse(result.features_df_json) as CellRow[];
    } catch {
      return [];
    }
  }, [result.features_df_json]);

  const cellIds = useMemo(
    () => rows.map((r) => Number(r.cell_id)).sort((a, b) => a - b),
    [rows],
  );

  // Default selection — pick the first cell if nothing chosen yet.
  const effectiveCellId =
    selectedCellId ?? (cellIds.length > 0 ? cellIds[0] : null);

  const cell = useMemo(
    () =>
      effectiveCellId == null
        ? null
        : rows.find((r) => Number(r.cell_id) === effectiveCellId) ?? null,
    [rows, effectiveCellId],
  );

  // Z-score the per-cell value vs population so the state card can
  // surface "top deviations" instead of raw numbers.
  const zScores = useMemo(() => {
    if (!cell) return new Map<string, number>();
    const map = new Map<string, number>();
    for (const key of Object.keys(cell)) {
      if (key === "cell_id") continue;
      if (key.startsWith("deep_")) continue;
      const values = rows
        .map((r) => r[key])
        .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
      if (values.length < 2) continue;
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance =
        values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
      const std = Math.sqrt(variance);
      const v = cell[key];
      if (typeof v !== "number" || !Number.isFinite(v) || std === 0) continue;
      map.set(key, (v - mean) / std);
    }
    return map;
  }, [cell, rows]);

  const stateSummary = useMemo(() => {
    if (!cell) return "No cell selected.";
    const phrases: string[] = [];
    const glyco_het = cell.glycocalyx_heterogeneity;
    if (typeof glyco_het === "number") {
      phrases.push(
        glyco_het > 0.4
          ? "high glycocalyx heterogeneity"
          : glyco_het < 0.2
            ? "uniform glycocalyx"
            : "moderate glycocalyx heterogeneity",
      );
    }
    const yap = cell.yap_nc_ratio_size_corrected;
    if (typeof yap === "number") {
      phrases.push(
        yap > 1.5
          ? "high corrected YAP"
          : yap < 0.8
            ? "low corrected YAP"
            : "moderate corrected YAP",
      );
    }
    const actin = cell.actin_stress_fiber_coherence;
    if (typeof actin === "number") {
      phrases.push(
        actin > 0.4
          ? "aligned actin"
          : actin < 0.2
            ? "disorganised actin"
            : "moderately aligned actin",
      );
    }
    const fa_mature = cell.fa_mature_fraction;
    if (typeof fa_mature === "number") {
      phrases.push(
        fa_mature > 0.5
          ? "mature focal adhesions"
          : fa_mature < 0.2
            ? "predominantly nascent adhesions"
            : "mixed focal-adhesion population",
      );
    }
    return phrases.join(", ") + ".";
  }, [cell]);

  const topDeviations = useMemo(() => {
    if (!cell) return [] as Array<{ key: string; z: number; value: number }>;
    const glycoKeys = Object.keys(cell).filter((k) =>
      k.startsWith("glycocalyx_"),
    );
    return glycoKeys
      .map((k) => ({
        key: k,
        z: zScores.get(k) ?? Number.NaN,
        value: cell[k] as number,
      }))
      .filter((d) => Number.isFinite(d.z))
      .sort((a, b) => Math.abs(b.z) - Math.abs(a.z))
      .slice(0, 3);
  }, [cell, zScores]);

  const mechanoPercentile = useMemo(() => {
    if (!cell || typeof cell.mechano_score !== "number") return null;
    const finite = rows
      .map((r) => r.mechano_score)
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v))
      .sort((a, b) => a - b);
    if (finite.length === 0) return null;
    const rank = finite.findIndex((v) => v >= (cell.mechano_score as number));
    return Math.round((rank / finite.length) * 100);
  }, [cell, rows]);

  if (cellIds.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          No cells in this analysis to inspect.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* Left: cell-id picker (placeholder for the canvas crop until
          per-cell PNG crops are wired through the backend). */}
      <Card className="lg:col-span-5">
        <CardHeader className="pb-3">
          <CardTitle className="text-[0.95rem]">Cell selector</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Pick a cell ID. The chosen cell stays selected across the Overview
            canvas and Methods &amp; QC.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={effectiveCellId ?? ""}
              min={cellIds[0]}
              max={cellIds[cellIds.length - 1]}
              onChange={(e) => {
                const next = Number(e.target.value);
                if (Number.isFinite(next)) setSelectedCellId(next);
              }}
              className="w-24"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (effectiveCellId == null) return;
                const idx = cellIds.indexOf(effectiveCellId);
                const prev = cellIds[Math.max(0, idx - 1)];
                setSelectedCellId(prev);
              }}
            >
              ←
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (effectiveCellId == null) return;
                const idx = cellIds.indexOf(effectiveCellId);
                const next = cellIds[Math.min(cellIds.length - 1, idx + 1)];
                setSelectedCellId(next);
              }}
            >
              →
            </Button>
            <span className="ml-2 text-xs text-muted-foreground">
              {cellIds.length} cells available
            </span>
          </div>
          <p className="text-[0.72rem] text-muted-foreground">
            Per-cell channel crops are not yet streamed to the frontend; this
            view drives the canvas highlight on Overview and the per-cell
            evidence panels on the right. Image crops are scheduled for the
            Phase 2 inspection upgrade.
          </p>
        </CardContent>
      </Card>

      {/* Right: state card + evidence tabs */}
      <div className="space-y-6 lg:col-span-7">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-baseline justify-between">
              <CardTitle className="text-[0.95rem]">
                Cell state · #{effectiveCellId}
              </CardTitle>
              {typeof cell?.mechano_score === "number" && (
                <span className="font-mono text-[1.05rem] font-semibold text-foreground">
                  score {fmt(cell.mechano_score, 2)}
                  {mechanoPercentile != null && (
                    <span className="ml-2 text-[0.72rem] font-normal text-muted-foreground">
                      ({mechanoPercentile}th percentile)
                    </span>
                  )}
                </span>
              )}
            </div>
            <p className="mt-2 text-sm text-foreground">{stateSummary}</p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <MetricBlock
                label="YAP N/C (corr.)"
                value={fmt(cell?.yap_nc_ratio_size_corrected, 2)}
              />
              <MetricBlock
                label="Actin coherence"
                value={fmt(cell?.actin_stress_fiber_coherence, 3)}
              />
              <MetricBlock
                label="FA mature fraction"
                value={fmt(cell?.fa_mature_fraction, 2)}
              />
              <MetricBlock
                label="Glycocalyx ratio"
                value={fmt(cell?.glycocalyx_pericellular_ratio, 2)}
              />
              <MetricBlock
                label="Cell area"
                value={fmt(cell?.cell_area, 0)}
                unit="px"
              />
              <MetricBlock
                label="FA count"
                value={fmt(cell?.fa_count, 0)}
              />
            </div>
            {topDeviations.length > 0 && (
              <div className="mt-4 rounded-md border border-border bg-muted/40 p-3">
                <p className="text-[0.72rem] uppercase tracking-wide text-muted-foreground">
                  Top glycocalyx deviations vs population
                </p>
                <ul className="mt-2 space-y-1 text-xs">
                  {topDeviations.map((d) => (
                    <li
                      key={d.key}
                      className="flex items-center justify-between gap-3"
                    >
                      <span className="font-mono text-foreground">{d.key}</span>
                      <span className="text-foreground">
                        {fmt(d.value, 3)}
                        <span className="ml-2 text-muted-foreground">
                          z = {d.z >= 0 ? "+" : ""}
                          {d.z.toFixed(2)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <Tabs defaultValue="glyco">
              <TabsList>
                <TabsTrigger value="glyco">Glycocalyx</TabsTrigger>
                <TabsTrigger value="yap">YAP</TabsTrigger>
                <TabsTrigger value="actin">Actin</TabsTrigger>
                <TabsTrigger value="fa">Adhesions</TabsTrigger>
                <TabsTrigger value="raw">Raw values</TabsTrigger>
              </TabsList>
              <TabsContent value="glyco" className="mt-4">
                <FeatureGroupTable cell={cell} prefix="glycocalyx_" />
              </TabsContent>
              <TabsContent value="yap" className="mt-4">
                <FeatureGroupTable cell={cell} prefix="yap_" />
              </TabsContent>
              <TabsContent value="actin" className="mt-4">
                <FeatureGroupTable cell={cell} prefix="actin_" />
              </TabsContent>
              <TabsContent value="fa" className="mt-4">
                <FeatureGroupTable cell={cell} prefix="fa_" />
              </TabsContent>
              <TabsContent value="raw" className="mt-4">
                <FeatureGroupTable cell={cell} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricBlock({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div className="rounded-md border border-border bg-muted/40 p-3">
      <p className="text-[0.7rem] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-mono text-[1rem] font-semibold text-foreground">
        {value}
        {unit && (
          <span className="ml-1 text-[0.72rem] font-normal text-muted-foreground">
            {unit}
          </span>
        )}
      </p>
    </div>
  );
}

function FeatureGroupTable({
  cell,
  prefix,
}: {
  cell: CellRow | null;
  prefix?: string;
}) {
  if (!cell) {
    return (
      <p className="text-xs text-muted-foreground">No cell selected.</p>
    );
  }
  const entries = Object.entries(cell)
    .filter(([k]) => k !== "cell_id" && !k.startsWith("deep_"))
    .filter(([k]) => (prefix ? k.startsWith(prefix) : true))
    .sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No features available for this group.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
      {entries.map(([k, v]) => (
        <div
          key={k}
          className="flex items-center justify-between rounded border border-border bg-muted/40 px-3 py-1.5"
        >
          <span className="font-mono text-foreground">{k}</span>
          <span className="font-mono text-foreground">
            {typeof v === "number" && Number.isFinite(v) ? v.toFixed(3) : "—"}
          </span>
        </div>
      ))}
    </div>
  );
}
