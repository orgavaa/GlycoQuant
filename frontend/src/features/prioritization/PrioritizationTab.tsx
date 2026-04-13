import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Info, Zap, ChevronLeft, Sparkles, FlaskConical, Network, Table2, BarChart3 } from "lucide-react";
import { Card } from "@/components/Card";
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

  const topWeights = isDynamic && priors.mechano_weights
    ? Object.entries(priors.mechano_weights).sort(([, a], [, b]) => b - a).slice(0, 3)
    : [];

  return (
    <div className="space-y-8">
      {/* Mode banner */}
      {isDynamic ? (
        <Card className="!bg-blue-50 !border-blue-200">
          <div className="flex items-center gap-3 mb-3">
            <Zap size={16} strokeWidth={1.5} className="text-blue-600" />
            <span className="text-[13px] font-semibold text-gray-900">Ranking contextualised by your analysis</span>
            {latestDatasetLabel && (
              <span className="text-[11px] font-medium px-2.5 py-1 bg-white border border-blue-200 rounded-full text-blue-700">{latestDatasetLabel}</span>
            )}
            {latestJobResult && (
              <span className="text-[11px] font-medium px-2.5 py-1 bg-white border border-blue-200 rounded-full text-blue-700" style={{ fontFeatureSettings: "'tnum'" }}>
                {latestJobResult.cell_count} cells
              </span>
            )}
          </div>
          <p className="text-[13px] text-gray-600 leading-relaxed max-w-3xl">
            The pathway prior has been re-aggregated via a weighted median of the per-target inverse shortest-paths,
            where the weights come from z-scored deviations of your observed per-cell features against a reference cohort.
          </p>
          {topWeights.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mt-4">
              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Most weighted:</span>
              {topWeights.map(([gene, weight]) => (
                <span key={gene} className="text-[11px] font-semibold px-2 py-1 bg-white border border-gray-200 rounded text-gray-800" style={{ fontFeatureSettings: "'tnum'" }}>
                  {gene} &middot; {weight.toFixed(2)}
                </span>
              ))}
            </div>
          )}
          <div className="pt-4">
            <button type="button" onClick={() => setForceStatic(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-[11px] font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">
              <ChevronLeft size={14} strokeWidth={1.5} /> Show static ranking
            </button>
          </div>
        </Card>
      ) : (
        <Card className="!bg-gray-50">
          <div className="flex items-center gap-3 mb-3">
            <Info size={16} strokeWidth={1.5} className="text-gray-400" />
            <span className="text-[13px] font-semibold text-gray-900">How this ranking is produced</span>
          </div>
          <p className="text-[13px] text-gray-600 leading-relaxed max-w-3xl">
            This tab loads a pre-computed pathway ranking of twenty-two glycocalyx-relevant genes
            against a fixed 15-gene mechanotransduction signature. The ranking combines curated pathway
            proximity from STRING v12 with transcriptomic co-regulation from Geneformer (Theodoris 2023).
          </p>
          {latestJobResult !== null && forceStatic && (
            <div className="pt-4">
              <button type="button" onClick={() => setForceStatic(false)}
                className="inline-flex items-center gap-2 px-4 py-2 text-[11px] font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors">
                <Zap size={14} strokeWidth={1.5} /> Contextualise with my analysis
              </button>
            </div>
          )}
          {latestJobResult === null && (
            <p className="mt-4 text-[11px] text-gray-400">
              Run an image analysis in the Analysis tab to see a contextualised ranking.
            </p>
          )}
        </Card>
      )}

      {/* Geneformer bootstrap */}
      {!priors.geneformer_available && priors.can_generate_geneformer && (
        <GeneformerRunCard onComplete={() => queryClient.invalidateQueries({ queryKey: ["priors"] })} />
      )}
      {!priors.geneformer_available && !priors.can_generate_geneformer && (
        <Card className="!bg-amber-50 !border-amber-200">
          <span className="text-[13px] font-semibold text-gray-900">Running in pathway-only mode</span>
          <p className="text-[13px] text-gray-600 mt-1">
            The transcriptomic prior is not yet committed, and this deployment cannot generate it (no Modal GPU provider).
          </p>
        </Card>
      )}

      {/* Panel summary dot plot */}
      {priors.panel_summary_figure_json && (
        <section>
          <div className="mb-4">
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Panel overview</span>
            <h2 className="mt-1 text-[18px] font-semibold tracking-tight text-gray-900">
              22 glycocalyx genes ranked by pathway proximity
            </h2>
            <p className="mt-1 text-[12px] text-gray-500">
              Dot size proportional to reachable mechano targets. Color by gene family.
            </p>
          </div>
          <Card>
            <PlotlyFigure figureJson={priors.panel_summary_figure_json} />
          </Card>
        </section>
      )}

      {/* Hero: top 3 with evidence micro-badges */}
      <section>
        <div className="mb-6">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Top candidates</span>
          <h2 className="mt-1 text-[18px] font-semibold tracking-tight text-gray-900">
            Highest pathway proximity to the mechanotransduction signature
          </h2>
          <p className="mt-1 text-[12px] text-gray-500">
            {isDynamic ? "Ranked using image-aware reweighting against your observed phenotype." : "Ranked by precomputed STRING v12 pathway proximity."}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {top3.map((g, i) => {
            // Evidence micro-badges
            const badges: string[] = [];
            if (g.pathway_score !== null && g.pathway_score > 0.8) badges.push("High pathway proximity");
            if (g.pathway_score !== null && g.pathway_score > 0.5) badges.push("Reachable mechano targets");
            if (isDynamic) badges.push("Phenotype-weighted");
            if (["CD44", "SDC1", "SDC2", "SDC4"].includes(g.gene)) badges.push("Surface proteoglycan");
            if (["GFPT1", "OGT", "MGAT5"].includes(g.gene)) badges.push("Metabolic target");

            return (
              <Card key={g.gene} className="hover:shadow-md transition-shadow cursor-pointer" noPadding={false}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Rank {g.pathway_rank}</span>
                    {isDynamic && <span className="text-[8px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-medium">reweighted</span>}
                  </div>
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold ${
                    i === 0 ? "bg-blue-100 text-blue-700" : i === 1 ? "bg-gray-100 text-gray-600" : "bg-gray-50 text-gray-500"
                  }`}>{i + 1}</span>
                </div>
                <div className="text-[24px] font-semibold tracking-tight text-gray-900" style={{ fontFeatureSettings: "'tnum'" }}>{g.gene}</div>
                {g.pathway_score !== null && (
                  <div className="text-[12px] text-gray-500 mt-1" style={{ fontFeatureSettings: "'tnum'" }}>score {g.pathway_score.toFixed(3)}</div>
                )}
                {/* Evidence micro-badges */}
                <div className="mt-3 flex flex-wrap gap-1">
                  {badges.slice(0, 3).map(b => (
                    <span key={b} className="text-[9px] px-1.5 py-0.5 rounded bg-gray-50 text-gray-500 border border-gray-100">{b}</span>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Ranking table */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <div>
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Ranked perturbations</span>
            <h2 className="mt-1 text-[18px] font-semibold tracking-tight text-gray-900">
              Twenty-two glycocalyx genes, sorted by pathway rank
            </h2>
          </div>
          <span className="text-[11px] text-gray-400 hidden lg:block">Click any row to drill into its per-target evidence</span>
        </div>
        <Card noPadding>
          <RankingTable
            genes={priors.genes}
            geneformerAvailable={priors.geneformer_available}
            selectedGene={activeGene}
            onSelectGene={setSelectedGene}
            staticRankByGene={staticRankByGene}
          />
        </Card>
      </section>

      {/* Drill-down */}
      <section className="space-y-4">
        <div>
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Per-gene drill-down</span>
          <h2 className="mt-1 text-[18px] font-semibold tracking-tight text-gray-900">
            Shortest-path evidence for the selected gene
          </h2>
        </div>
        <Card>
          {activeGene ? (
            <DrillDownPanel gene={activeGene} mechanoSignature={priors.mechano_signature} onGeneChange={setSelectedGene} availableGenes={priors.genes.map(g => g.gene)} />
          ) : (
            <p className="text-[13px] text-gray-400">No genes available.</p>
          )}
        </Card>
      </section>

      {/* Metabolic inhibitors */}
      <section className="space-y-4">
        <div>
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Metabolic inhibitors</span>
          <h2 className="mt-1 text-[18px] font-semibold tracking-tight text-gray-900">
            Where each drug sits in the ranked panel
          </h2>
        </div>
        <Card noPadding>
          <MetabolicInhibitorTable inhibitors={priors.metabolic_inhibitors} />
        </Card>
      </section>
    </div>
  );
}
