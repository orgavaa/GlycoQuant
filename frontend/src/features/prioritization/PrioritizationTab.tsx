import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Info, Zap, ChevronLeft, FlaskConical, Network, Table2, BarChart3, Layers } from "lucide-react";
import { CompassSection, CompassPill } from "@/components/CompassSection";
import { PlotlyFigure } from "@/components/PlotlyFigure";
import {
  fetchContextualPriors,
  fetchPriors,
  type PriorsResponse,
} from "@/lib/api";
import { useJobStore } from "@/lib/jobStore";
import { DrillDownPanel } from "./DrillDownPanel";
import { GeneformerRunCard } from "./GeneformerRunCard";
import { MetabolicInhibitorTable } from "./MetabolicInhibitorTable";
import { RankingTable } from "./RankingTable";

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

  const contextualMutation = useMutation({
    mutationFn: fetchContextualPriors,
  });

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
    if (!dynamicPriors) return null;
    const staticData = staticQuery.data;
    if (!staticData) return null;
    const out: Record<string, number | null> = {};
    for (const g of staticData.genes) out[g.gene] = g.pathway_rank ?? null;
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
          <div className="w-5 h-5 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
          <span className="text-[13px]">Loading ranking data...</span>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <span className="text-[13px] font-semibold text-gray-900">Failed to load priors</span>
        <p className="text-[13px] text-gray-600 mt-1">
          Make sure the backend is running and <code className="bg-red-100 px-1.5 py-0.5 rounded text-[11px]">data/priors/pathway_ranks.json</code> exists.
        </p>
      </div>
    );
  }

  if (!priors) return null;

  const top3 = priors.genes.slice(0, 3);
  const isDynamic = !!dynamicPriors;

  const topWeights = isDynamic && priors.mechano_weights
    ? Object.entries(priors.mechano_weights).sort(([, a], [, b]) => b - a).slice(0, 3)
    : [];

  return (
    <div>
      {/* Page title */}
      <div className="mb-5">
        <h1 className="text-[20px] font-semibold text-gray-900 tracking-tight">Perturbation Prioritization</h1>
        <p className="text-[12px] text-gray-500 mt-1">
          Twenty-two glycocalyx genes ranked against a 15-gene mechanotransduction signature.
        </p>
      </div>

      {/* Mode banner — compact COMPASS style */}
      {isDynamic ? (
        <div className="bg-blue-50 border border-blue-200 rounded-md px-4 py-3 mb-3">
          <div className="flex items-center gap-2 mb-1">
            <Zap size={14} strokeWidth={1.5} className="text-blue-600" />
            <span className="text-[13px] font-semibold text-gray-900">Image-aware ranking active</span>
            {latestDatasetLabel && <CompassPill variant="blue">{latestDatasetLabel}</CompassPill>}
            {latestJobResult && <CompassPill variant="blue">{latestJobResult.cell_count} cells</CompassPill>}
          </div>
          <p className="text-[11px] text-gray-600 leading-relaxed">
            Pathway prior re-aggregated using z-scored deviations of your observed per-cell features.
          </p>
          {topWeights.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Most weighted:</span>
              {topWeights.map(([gene, weight]) => (
                <span key={gene} className="text-[10px] font-medium px-1.5 py-0.5 bg-white border border-blue-200 rounded text-blue-700" style={{ fontFeatureSettings: "'tnum'" }}>
                  {gene} {weight.toFixed(2)}
                </span>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => setForceStatic(true)}
            className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-800"
          >
            <ChevronLeft size={12} strokeWidth={1.5} />
            Show static ranking
          </button>
        </div>
      ) : (
        <CompassSection
          title="How this ranking is produced"
          icon={<Info size={14} strokeWidth={1.5} />}
          collapsible
          defaultOpen={false}
        >
          <p className="text-[12px] text-gray-600 leading-relaxed">
            Pre-computed pathway ranking of twenty-two glycocalyx-relevant genes against a fixed
            15-gene mechanotransduction signature. Combines STRING v12 pathway proximity with
            transcriptomic co-regulation from Geneformer (Theodoris 2023).
          </p>
          {latestJobResult !== null && forceStatic && (
            <button
              type="button"
              onClick={() => setForceStatic(false)}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
            >
              <Zap size={12} strokeWidth={1.5} />
              Contextualise with my analysis
            </button>
          )}
          {latestJobResult === null && (
            <p className="mt-2 text-[10px] text-gray-400">Run an image analysis to enable contextualised ranking.</p>
          )}
        </CompassSection>
      )}

      {/* Geneformer bootstrap */}
      {!priors.geneformer_available && priors.can_generate_geneformer && (
        <div className="mb-3">
          <GeneformerRunCard onComplete={() => queryClient.invalidateQueries({ queryKey: ["priors"] })} />
        </div>
      )}
      {!priors.geneformer_available && !priors.can_generate_geneformer && (
        <div className="bg-amber-50 border border-amber-200 rounded-md px-4 py-3 mb-3">
          <span className="text-[12px] font-semibold text-gray-900">Pathway-only mode</span>
          <p className="text-[11px] text-gray-600 mt-0.5">
            Transcriptomic prior not yet committed and no Modal GPU provider available.
          </p>
        </div>
      )}

      {/* Top 3 candidates */}
      <CompassSection
        title="Top candidates"
        icon={<Layers size={14} strokeWidth={1.5} />}
        rightLabel={isDynamic ? "image-aware reweighted" : "STRING v12 baseline"}
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {top3.map((g, i) => {
            const badges: string[] = [];
            if (g.pathway_score !== null && g.pathway_score > 0.8) badges.push("High proximity");
            if (g.pathway_score !== null && g.pathway_score > 0.5) badges.push("Reachable targets");
            if (isDynamic) badges.push("Phenotype-weighted");
            if (["CD44", "SDC1", "SDC2", "SDC4"].includes(g.gene)) badges.push("Surface proteoglycan");
            if (["GFPT1", "OGT", "MGAT5"].includes(g.gene)) badges.push("Metabolic target");

            const isFirst = i === 0;
            return (
              <button
                key={g.gene}
                onClick={() => setSelectedGene(g.gene)}
                className={`text-left p-3 rounded-md border transition-colors ${
                  isFirst
                    ? "border-blue-300 bg-blue-50/50"
                    : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                    Rank {g.pathway_rank}
                  </span>
                  {isDynamic && <CompassPill variant="blue">reweighted</CompassPill>}
                </div>
                <div className="text-[20px] font-semibold text-gray-900" style={{ fontFeatureSettings: "'tnum'" }}>
                  {g.gene}
                </div>
                {g.pathway_score !== null && (
                  <div className="text-[11px] text-gray-500 mt-0.5" style={{ fontFeatureSettings: "'tnum'" }}>
                    score {g.pathway_score.toFixed(3)}
                  </div>
                )}
                <div className="mt-2 flex flex-wrap gap-1">
                  {badges.slice(0, 2).map(b => (
                    <CompassPill key={b}>{b}</CompassPill>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </CompassSection>

      {/* Panel summary dot plot */}
      {priors.panel_summary_figure_json && (
        <CompassSection
          title="Panel overview"
          icon={<BarChart3 size={14} strokeWidth={1.5} />}
          rightLabel="22 genes"
          description="Dot size proportional to reachable mechano targets. Color by gene family."
          collapsible
        >
          <PlotlyFigure figureJson={priors.panel_summary_figure_json} />
        </CompassSection>
      )}

      {/* Ranking table */}
      <CompassSection
        title="Ranked perturbations"
        icon={<Table2 size={14} strokeWidth={1.5} />}
        rightLabel="click row to drill in"
      >
        <div className="-mx-4 -mb-4">
          <RankingTable
            genes={priors.genes}
            geneformerAvailable={priors.geneformer_available}
            selectedGene={activeGene}
            onSelectGene={setSelectedGene}
            staticRankByGene={staticRankByGene}
          />
        </div>
      </CompassSection>

      {/* Drill-down */}
      <CompassSection
        title="Per-gene drill-down"
        icon={<Network size={14} strokeWidth={1.5} />}
        rightLabel={activeGene ?? undefined}
      >
        {activeGene ? (
          <DrillDownPanel
            gene={activeGene}
            mechanoSignature={priors.mechano_signature}
            onGeneChange={setSelectedGene}
            availableGenes={priors.genes.map(g => g.gene)}
          />
        ) : (
          <p className="text-[12px] text-gray-400">No genes available.</p>
        )}
      </CompassSection>

      {/* Metabolic inhibitors */}
      <CompassSection
        title="Metabolic inhibitors"
        icon={<FlaskConical size={14} strokeWidth={1.5} />}
        rightLabel={`${priors.metabolic_inhibitors.length} compounds`}
        collapsible
      >
        <div className="-mx-4 -mb-4">
          <MetabolicInhibitorTable inhibitors={priors.metabolic_inhibitors} />
        </div>
      </CompassSection>
    </div>
  );
}
