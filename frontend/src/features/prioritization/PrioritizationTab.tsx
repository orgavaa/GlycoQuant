import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  FlaskConical,
  Info,
  Layers,
  Minus,
  Network,
  Table2,
  Zap,
} from "lucide-react";
import { Card } from "@/components/Card";
import {
  fetchContextualPriors,
  fetchPriors,
  type PriorStatusBlock,
  type PriorsResponse,
} from "@/lib/api";
import { useJobStore } from "@/lib/jobStore";
import { DrillDownPanel } from "./DrillDownPanel";
import { GeneformerRunCard } from "./GeneformerRunCard";
import { RankingTable } from "./RankingTable";

interface SectionHeaderProps {
  icon: React.ReactNode;
  title: string;
  rightLabel?: string;
}

function SectionHeader({ icon, title, rightLabel }: SectionHeaderProps) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-gray-500 flex-shrink-0">{icon}</span>
      <h3 className="text-[14px] font-semibold text-gray-900">{title}</h3>
      {rightLabel && <span className="ml-auto text-[11px] text-gray-400">{rightLabel}</span>}
    </div>
  );
}

export function PrioritizationTab() {
  const queryClient = useQueryClient();
  const [selectedGene, setSelectedGene] = useState<string | null>(null);
  const [forceStatic, setForceStatic] = useState(false);

  const latestJobResult = useJobStore(s => s.latestJobResult);
  const latestDatasetLabel = useJobStore(s => s.latestDatasetLabel);

  const staticQuery = useQuery({
    queryKey: ["priors"],
    queryFn: fetchPriors,
  });

  const canGoDynamic = !forceStatic && latestJobResult !== null;
  const contextualMutation = useMutation({ mutationFn: fetchContextualPriors });

  useEffect(() => {
    if (!canGoDynamic || !latestJobResult) return;
    contextualMutation.mutate({
      features_df_json: latestJobResult.features_df_json,
      cell_count: latestJobResult.cell_count,
      dataset_label: latestDatasetLabel,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canGoDynamic, latestJobResult?.image_hash, latestDatasetLabel]);

  const dynamicPriors: PriorsResponse | undefined = canGoDynamic ? contextualMutation.data : undefined;
  const priors = dynamicPriors ?? staticQuery.data;
  const isLoading = staticQuery.isLoading || (canGoDynamic && contextualMutation.isPending && !contextualMutation.data);
  const isError = staticQuery.isError && !dynamicPriors;

  const staticRankByGene = useMemo(() => {
    if (!dynamicPriors || !staticQuery.data) return null;
    const out: Record<string, number | null> = {};
    for (const g of staticQuery.data.genes) out[g.gene] = g.pathway_rank ?? null;
    return out;
  }, [dynamicPriors, staticQuery.data]);

  const firstGeneWithRank = useMemo(
    () => priors?.genes.find(g => g.pathway_rank !== null)?.gene ?? null,
    [priors],
  );
  const activeGene = selectedGene ?? firstGeneWithRank;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3 text-gray-400">
          <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-950 rounded-full animate-spin" />
          <span className="text-[13px]">Loading ranking data...</span>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="!bg-red-50 !border-red-200">
        <span className="text-[13px] font-semibold text-gray-900">Failed to load priors</span>
        <p className="text-[13px] text-gray-600 mt-1">
          Make sure the backend is running and <code className="bg-red-100 px-1.5 py-0.5 rounded text-[11px]">data/priors/pathway_ranks.json</code> exists.
        </p>
      </Card>
    );
  }

  if (!priors) return null;

  const top3 = priors.genes.slice(0, 3);
  const isDynamic = !!dynamicPriors;
  const priorMode = priors.geneformer_available
    ? "STRING + transcriptomic sensitivity prior"
    : "STRING functional-association prior";
  const evidenceMode = isDynamic ? `Image-context reweighting + ${priorMode}` : priorMode;
  const signatureLayers = priors.signature_layers ?? [];
  const targetMetadata = priors.target_metadata ?? {};
  const geneClassLegend = priors.gene_class_legend ?? [];
  const pathwayProvenance = stringProvenanceChips(priors.pathway_metadata);

  const topWeights = isDynamic && priors.mechano_weights
    ? Object.entries(priors.mechano_weights).sort(([, a], [, b]) => b - a).slice(0, 3)
    : [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[22px] font-semibold text-gray-900 tracking-tight">Perturbation prior ranking</h1>
        <p className="text-[13px] text-gray-500 mt-1">
          Twenty-two glycan and pericellular-matrix genes ranked against a fixed 15-gene adhesion-actomyosin-YAP/TAZ mechanosensitive signature.
        </p>
      </div>

      {isDynamic ? (
        <Card className="!bg-white">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <Zap size={14} strokeWidth={1.5} className="text-gray-700" />
            <span className="text-[13px] font-semibold text-gray-900">Image-context reweighting active</span>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-gray-50 border border-gray-200 text-gray-700">
              {evidenceMode}
            </span>
            {latestDatasetLabel && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-white border border-gray-200 text-gray-700">
                {latestDatasetLabel}
              </span>
            )}
            {latestJobResult && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-white border border-gray-200 text-gray-700" style={{ fontFeatureSettings: "'tnum'" }}>
                {latestJobResult.cell_count} cells
              </span>
            )}
          </div>
          <p className="text-[11px] text-gray-600 leading-relaxed max-w-3xl">
            STRING proximity is reweighted by field-relative imaging deviations. Image-context reweighting is field-relative unless a validated reference/control cohort is provided.
          </p>
          {pathwayProvenance.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Prior provenance</span>
              {pathwayProvenance.map(chip => (
                <span
                  key={chip}
                  className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-white border border-gray-200 text-gray-700"
                  style={{ fontFeatureSettings: "'tnum'" }}
                >
                  {chip}
                </span>
              ))}
            </div>
          )}
          <p className="mt-2 text-[11px] text-gray-600 leading-relaxed max-w-3xl">
            Network proximity may favor highly connected genes. Degree-matched null correction is not active in this build.
          </p>
          {topWeights.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mt-3">
              <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Most weighted:</span>
              {topWeights.map(([gene, weight]) => {
                const signedZ = priors.mechano_signed_z?.[gene] ?? 0;
                const direction: "up" | "down" | "neutral" =
                  Math.abs(signedZ) < 0.1 ? "neutral" : signedZ > 0 ? "up" : "down";
                const DirIcon = direction === "up" ? ArrowUp : direction === "down" ? ArrowDown : Minus;
                const dirColor = direction === "up" ? "text-red-600" : direction === "down" ? "text-blue-600" : "text-gray-400";
                return (
                  <span
                    key={gene}
                    className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 bg-white border border-gray-200 rounded text-gray-800"
                    style={{ fontFeatureSettings: "'tnum'" }}
                  >
                    {gene}
                    <DirIcon size={10} strokeWidth={2} className={dirColor} />
                    {weight.toFixed(2)}
                  </span>
                );
              })}
            </div>
          )}
          <button
            type="button"
            onClick={() => setForceStatic(true)}
            className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium text-gray-700 hover:text-gray-950"
          >
            <ChevronLeft size={12} strokeWidth={1.5} />
            Show STRING functional-association prior only
          </button>
        </Card>
      ) : (
        <Card className="!bg-gray-50">
          <div className="flex items-center gap-2 mb-2">
            <Info size={14} strokeWidth={1.5} className="text-gray-400" />
            <span className="text-[13px] font-semibold text-gray-900">{priorMode}</span>
          </div>
          <p className="text-[12px] text-gray-600 leading-relaxed max-w-3xl">
            STRING-based undirected functional-association prior for glycan/pericellular-matrix perturbation genes.
            Scores prioritize hypotheses for matched wet-lab testing; they do not infer causal signalling direction.
            {priors.geneformer_available
              ? " Geneformer-derived transcriptomic sensitivity is a model-derived hypothesis prior, not experimental perturbation evidence."
              : " No Geneformer transcriptomic prior is currently active."}
          </p>
          {pathwayProvenance.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Prior provenance</span>
              {pathwayProvenance.map(chip => (
                <span
                  key={chip}
                  className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-white border border-gray-200 text-gray-700"
                  style={{ fontFeatureSettings: "'tnum'" }}
                >
                  {chip}
                </span>
              ))}
            </div>
          )}
          <p className="mt-3 text-[11px] text-gray-600 leading-relaxed max-w-3xl border-l-2 border-gray-200 pl-3">
            Network proximity may favor highly connected genes. Degree-matched null correction is not active in this build.
          </p>
          <p className="mt-2 text-[11px] text-gray-500 leading-relaxed max-w-3xl">
            Image-context reweighting is field-relative unless a validated reference/control cohort is provided.
          </p>
          {latestJobResult !== null && forceStatic && (
            <button
              type="button"
              onClick={() => setForceStatic(false)}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-white bg-gray-950 rounded hover:bg-gray-800"
            >
              <Zap size={12} strokeWidth={1.5} />
              Apply image context
            </button>
          )}
          {latestJobResult === null && (
            <p className="mt-3 text-[10px] text-gray-400">Run image analysis to enable image-context reweighting.</p>
          )}
        </Card>
      )}

      <Card className="!bg-white">
        <SectionHeader icon={<Network size={14} strokeWidth={1.5} />} title="Signature and gene-class metadata" rightLabel="15 signature targets · 22 perturbation genes" />
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
          {signatureLayers.map(layer => (
            <div key={layer.label} className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-900">
                <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: layer.color }} />
                {layer.short_label}
              </div>
              <div className="mt-0.5 text-[9px] uppercase tracking-wider text-gray-400">{layer.label}</div>
              <div className="mt-1 text-[10px] leading-relaxed text-gray-600">
                {layer.genes.map(g => targetMetadata[g]?.alias ?? g).join(", ")}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-gray-500 leading-relaxed">
          CCN2/CTGF, CYR61/CCN1, and ANKRD1 are treated as YAP/TAZ-response genes, not upstream mechanosensors.
        </p>
        {geneClassLegend.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mr-1 self-center">Perturbation gene classes</span>
            {geneClassLegend.map(item => (
              <span
                key={item.label}
                className="inline-flex items-center gap-1.5 rounded border px-2 py-1 text-[10px] text-gray-700"
                style={{ borderColor: `${item.color}33`, backgroundColor: `${item.color}10` }}
                title={item.genes}
              >
                <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: item.color }} />
                {item.label}
              </span>
            ))}
          </div>
        )}
      </Card>

      {!priors.geneformer_available && priors.can_generate_geneformer && (
        <GeneformerRunCard
          onComplete={() => {
            queryClient.invalidateQueries({ queryKey: ["priors"] });
            if (canGoDynamic && latestJobResult) {
              contextualMutation.mutate({
                features_df_json: latestJobResult.features_df_json,
                cell_count: latestJobResult.cell_count,
                dataset_label: latestDatasetLabel,
              });
            }
          }}
        />
      )}
      {!priors.geneformer_available && !priors.can_generate_geneformer && (
        <Card className="!bg-gray-50">
          <span className="text-[12px] font-semibold text-gray-900">STRING functional-association prior only</span>
          <p className="text-[11px] text-gray-600 mt-0.5">
            Transcriptomic prior not yet committed and no Modal GPU provider available.
          </p>
        </Card>
      )}

      {priors.pathway_status && priors.pathway_status.status !== "ready" && (
        <PriorStatusBanner label="STRING functional-association prior" status={priors.pathway_status} />
      )}
      {/* Only surface stale-but-loaded Geneformer priors; "invalid" is hidden
          because the fallback "STRING functional-association prior only" card
          already communicates the situation without exposing a stack trace. */}
      {priors.geneformer_status && priors.geneformer_status.status === "stale" && (
        <PriorStatusBanner label="Geneformer prior" status={priors.geneformer_status} />
      )}

      <Card>
        <SectionHeader icon={<Layers size={14} strokeWidth={1.5} />} title="Top candidates" rightLabel={isDynamic ? "image-context reweighted" : priorMode} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {top3.map((g, i) => {
            const classColor = geneClassColor(g.gene_class, geneClassLegend);
            const reachable = g.reachable_signature_targets ?? null;
            return (
              <button
                key={g.gene}
                onClick={() => setSelectedGene(g.gene)}
                className={`relative text-left p-3 pl-4 rounded-md border transition-colors overflow-hidden ${i === 0 ? "border-gray-950 bg-gray-50" : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"}`}
              >
                <span
                  aria-hidden="true"
                  className="absolute left-0 top-0 bottom-0 w-1"
                  style={{ backgroundColor: classColor ?? "#e5e7eb" }}
                />
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Rank {g.pathway_rank}</span>
                  {isDynamic && <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">reweighted</span>}
                </div>
                <div className="text-[20px] font-semibold text-gray-900" style={{ fontFeatureSettings: "'tnum'" }}>{g.gene}</div>
                {g.pathway_score !== null && (
                  <div className="text-[11px] text-gray-500 mt-0.5" style={{ fontFeatureSettings: "'tnum'" }}>STRING proximity {g.pathway_score.toFixed(3)}</div>
                )}
                {isDynamic && g.pathway_signed_score !== null && g.pathway_signed_score !== undefined && (
                  <div className="text-[10px] mt-0.5 inline-flex items-center gap-0.5" style={{ fontFeatureSettings: "'tnum'" }}>
                    {g.pathway_signed_score > 0 ? (
                      <ArrowUp size={9} strokeWidth={2} className="text-red-600" />
                    ) : g.pathway_signed_score < 0 ? (
                      <ArrowDown size={9} strokeWidth={2} className="text-blue-600" />
                    ) : (
                      <Minus size={9} strokeWidth={2} className="text-gray-400" />
                    )}
                    <span className={g.pathway_signed_score > 0 ? "text-red-700" : g.pathway_signed_score < 0 ? "text-blue-700" : "text-gray-500"}>
                      signed {g.pathway_signed_score >= 0 ? "+" : ""}{g.pathway_signed_score.toFixed(2)}
                    </span>
                  </div>
                )}
                <div className="mt-2 flex flex-wrap gap-1">
                  {g.gene_class && (
                    <span
                      className="text-[9px] px-1.5 py-0.5 rounded font-medium border"
                      style={{ color: classColor ?? "#6b7280", borderColor: classColor ? `${classColor}33` : "#e5e7eb", backgroundColor: classColor ? `${classColor}14` : "#f9fafb" }}
                    >
                      {g.gene_class}
                    </span>
                  )}
                  {reachable !== null && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-700" style={{ fontFeatureSettings: "'tnum'" }}>
                      {reachable}/15 reachable
                    </span>
                  )}
                  {g.pathway_score !== null && g.pathway_score > 0.8 && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">High proximity</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      <Card noPadding>
        <div className="px-5 py-4 border-b border-gray-100">
          <SectionHeader icon={<Table2 size={14} strokeWidth={1.5} />} title="Ranked perturbations" rightLabel="click row to drill in" />
        </div>
        <RankingTable
          genes={priors.genes}
          geneformerAvailable={priors.geneformer_available}
          selectedGene={activeGene}
          onSelectGene={setSelectedGene}
          staticRankByGene={staticRankByGene}
        />
      </Card>

      <Card>
        <SectionHeader icon={<Network size={14} strokeWidth={1.5} />} title="Per-gene drill-down" rightLabel={activeGene ?? undefined} />
        {activeGene ? (
          <DrillDownPanel
            gene={activeGene}
            mechanoSignature={priors.mechano_signature}
            targetMetadata={priors.target_metadata ?? {}}
            onGeneChange={setSelectedGene}
            availableGenes={priors.genes.map(g => g.gene)}
            selectedGeneClass={priors.genes.find(g => g.gene === activeGene)?.gene_class ?? null}
          />
        ) : (
          <p className="text-[12px] text-gray-400">No genes available.</p>
        )}
      </Card>

      <Card className="!bg-gray-50">
        <SectionHeader icon={<FlaskConical size={14} strokeWidth={1.5} />} title="Interpretation boundary" />
        <p className="text-[11px] text-gray-700 leading-relaxed">
          Undirected STRING functional association. Path layout, edge order, and shortest paths do not imply causal signalling, temporal order, or cell-type-specific mechanism.
        </p>
      </Card>
    </div>
  );
}

function stringProvenanceChips(metadata: Record<string, unknown>): string[] {
  if (!metadata || typeof metadata !== "object") return [];
  const chips: string[] = [];
  const source = typeof metadata.source === "string" ? metadata.source : null;
  if (source) chips.push(source);
  const threshold = metadata.string_confidence_threshold ?? metadata.confidence_threshold;
  if (typeof threshold === "number") chips.push(`confidence ≥ ${threshold.toFixed(2)}`);
  if (typeof metadata.species === "number" && metadata.species === 9606) chips.push("H. sapiens");
  if (typeof metadata.n_graph_nodes === "number" && typeof metadata.n_graph_edges === "number") {
    chips.push(`${metadata.n_graph_nodes} nodes / ${metadata.n_graph_edges} edges retained`);
  }
  if (typeof metadata.curated_edges_overlaid === "number" && metadata.curated_edges_overlaid > 0) {
    chips.push(`${metadata.curated_edges_overlaid} curated edges overlaid`);
  }
  if (typeof metadata.aggregation === "string" && metadata.aggregation === "median_inverse_shortest_path") {
    chips.push("median inverse shortest path");
  }
  return chips;
}

function geneClassColor(
  geneClass: string | null | undefined,
  legend: Array<{ label: string; color: string }>,
): string | null {
  if (!geneClass) return null;
  const entry = legend.find(item => item.label === geneClass);
  return entry?.color ?? null;
}

function PriorStatusBanner({
  label,
  status,
}: {
  label: string;
  status: PriorStatusBlock;
}) {
  const tint =
    status.status === "invalid"
      ? "bg-red-50 border-red-200 text-red-900"
      : status.status === "stale"
        ? "bg-orange-50 border-orange-200 text-orange-900"
        : "bg-amber-50 border-amber-200 text-amber-900";
  const dotTint =
    status.status === "invalid"
      ? "bg-red-500"
      : status.status === "stale"
        ? "bg-orange-500"
        : "bg-amber-500";
  return (
    <Card className={`!border ${tint}`}>
      <div className="flex items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full ${dotTint}`} />
        <span className="text-[12px] font-semibold">
          {label} status: {status.status}
        </span>
        {status.n_genes > 0 && <span className="text-[10px] font-medium opacity-70">({status.n_genes} genes)</span>}
        {typeof status.age_days === "number" && (
          <span className="text-[10px] font-medium opacity-70" style={{ fontFeatureSettings: "'tnum'" }}>
            generated {status.age_days.toFixed(0)} d ago
          </span>
        )}
      </div>
      <p className="text-[11px] opacity-80 mt-1 leading-relaxed">{status.detail}</p>
    </Card>
  );
}
