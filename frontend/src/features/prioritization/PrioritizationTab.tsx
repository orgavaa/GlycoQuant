/**
 * Tab 2 — Perturbation Prioritization.
 * White background, clean professional UI with Lucide icons.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Zap, Info, ChevronLeft, FlaskConical } from "lucide-react";
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

  const latestJobResult = useJobStore((s) => s.latestJobResult);
  const latestDatasetLabel = useJobStore((s) => s.latestDatasetLabel);

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

  const dynamicPriors: PriorsResponse | undefined = canGoDynamic
    ? contextualMutation.data
    : undefined;
  const priors = dynamicPriors ?? staticQuery.data;
  const isLoading =
    staticQuery.isLoading ||
    (canGoDynamic && contextualMutation.isPending && !contextualMutation.data);
  const isError = staticQuery.isError && !dynamicPriors;

  const staticRankByGene = useMemo(() => {
    if (!dynamicPriors) return null;
    const staticData = staticQuery.data;
    if (!staticData) return null;
    const out: Record<string, number | null> = {};
    for (const g of staticData.genes) {
      out[g.gene] = g.pathway_rank ?? null;
    }
    return out;
  }, [dynamicPriors, staticQuery.data]);

  const firstGeneWithRank = useMemo(
    () => priors?.genes.find((g) => g.pathway_rank !== null)?.gene ?? null,
    [priors],
  );
  const activeGene = selectedGene ?? firstGeneWithRank;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3 text-gray-400">
          <div className="w-5 h-5 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
          <span className="text-sm">Loading ranking data...</span>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-2">
          <Info className="w-5 h-5 text-red-500" />
          <span className="text-sm font-semibold text-gray-900">
            Failed to load priors
          </span>
        </div>
        <p className="text-sm text-gray-600">
          Make sure the backend is running and{" "}
          <code className="bg-red-100 px-1.5 py-0.5 rounded text-xs font-mono">data/priors/pathway_ranks.json</code>{" "}
          exists.
        </p>
      </div>
    );
  }

  if (!priors) return null;

  const top3 = priors.genes.slice(0, 3);
  const isDynamic = !!dynamicPriors;

  const topWeights =
    isDynamic && priors.mechano_weights
      ? Object.entries(priors.mechano_weights)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 3)
      : [];

  return (
    <div className="space-y-10">
      {/* Mode banner */}
      {isDynamic ? (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-3">
            <Zap className="w-5 h-5 text-blue-600" />
            <span className="text-sm font-semibold text-gray-900">
              Ranking contextualised by your analysis
            </span>
            {latestDatasetLabel && (
              <span className="text-xs font-medium px-2.5 py-1 bg-white border border-blue-200 rounded-full text-blue-700 font-mono">
                {latestDatasetLabel}
              </span>
            )}
            {latestJobResult && (
              <span className="text-xs font-medium px-2.5 py-1 bg-white border border-blue-200 rounded-full text-blue-700 font-mono tabular-nums">
                {latestJobResult.cell_count} cells
              </span>
            )}
          </div>
          <p className="text-sm text-gray-600 leading-relaxed max-w-3xl">
            The pathway prior has been re-aggregated via a weighted median
            of the per-target inverse shortest-paths, where the weights
            come from z-scored deviations of your observed per-cell features
            against a reference cohort.
          </p>
          {topWeights.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mt-4">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Most weighted:
              </span>
              {topWeights.map(([gene, weight]) => (
                <span
                  key={gene}
                  className="text-xs font-mono font-semibold px-2 py-1 bg-white border border-gray-200 rounded text-gray-800 tabular-nums"
                >
                  {gene} &middot; {weight.toFixed(2)}
                </span>
              ))}
            </div>
          )}
          <div className="pt-4">
            <button
              type="button"
              onClick={() => setForceStatic(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Show static ranking
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-3">
            <Info className="w-5 h-5 text-gray-400" />
            <span className="text-sm font-semibold text-gray-900">
              How this ranking is produced
            </span>
          </div>
          <p className="text-sm text-gray-600 leading-relaxed max-w-3xl">
            This tab loads a pre-computed pathway ranking of twenty-two
            glycocalyx-relevant genes against a fixed 15-gene
            mechanotransduction signature. The ranking combines curated pathway proximity
            from STRING v12 with transcriptomic co-regulation from
            Geneformer (Theodoris 2023, ~10&#x2074; M cells).
          </p>
          {latestJobResult !== null && forceStatic && (
            <div className="pt-4">
              <button
                type="button"
                onClick={() => setForceStatic(false)}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Zap className="w-3.5 h-3.5" />
                Contextualise with my analysis
              </button>
            </div>
          )}
          {latestJobResult === null && (
            <p className="mt-4 text-xs text-gray-400">
              Run an image analysis in the Overview tab to see a contextualised ranking.
            </p>
          )}
        </div>
      )}

      {/* Geneformer bootstrap */}
      {!priors.geneformer_available && priors.can_generate_geneformer && (
        <GeneformerRunCard
          onComplete={() =>
            queryClient.invalidateQueries({ queryKey: ["priors"] })
          }
        />
      )}
      {!priors.geneformer_available && !priors.can_generate_geneformer && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-2">
            <Info className="w-5 h-5 text-amber-500" />
            <span className="text-sm font-semibold text-gray-900">
              Running in pathway-only mode
            </span>
          </div>
          <p className="text-sm text-gray-600">
            The transcriptomic prior is not yet committed, and this
            deployment cannot generate it (no Modal GPU provider).
          </p>
        </div>
      )}

      {/* Hero: top 3 glycocalyx genes */}
      <section>
        <div className="mb-6">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Top candidates
          </span>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-gray-900">
            Highest pathway proximity to the mechanotransduction signature
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {top3.map((g, i) => (
            <div
              key={g.gene}
              className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Rank {g.pathway_rank}
                </span>
                <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  i === 0 ? "bg-blue-100 text-blue-700" :
                  i === 1 ? "bg-gray-100 text-gray-600" :
                  "bg-gray-50 text-gray-500"
                }`}>
                  {i + 1}
                </span>
              </div>
              <div className="text-3xl font-semibold tracking-tight text-gray-900 tabular-nums">
                {g.gene}
              </div>
              {g.pathway_score !== null && (
                <div className="text-sm text-gray-500 mt-2 font-mono tabular-nums">
                  score {g.pathway_score.toFixed(3)}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Ranking table */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <div>
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Ranked perturbations
            </span>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-gray-900">
              Twenty-two glycocalyx genes, sorted by pathway rank
            </h2>
          </div>
          <span className="text-xs text-gray-400 hidden lg:block">
            Click any row to drill into its per-target evidence
          </span>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <RankingTable
            genes={priors.genes}
            geneformerAvailable={priors.geneformer_available}
            selectedGene={activeGene}
            onSelectGene={setSelectedGene}
            staticRankByGene={staticRankByGene}
          />
        </div>
      </section>

      {/* Per-gene drill-down */}
      <section className="space-y-4">
        <div>
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Per-gene drill-down
          </span>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-gray-900">
            Shortest-path evidence for the selected gene
          </h2>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          {activeGene ? (
            <DrillDownPanel
              gene={activeGene}
              mechanoSignature={priors.mechano_signature}
              onGeneChange={setSelectedGene}
              availableGenes={priors.genes.map((g) => g.gene)}
            />
          ) : (
            <p className="text-sm text-gray-400">
              No genes available.
            </p>
          )}
        </div>
      </section>

      {/* Metabolic inhibitors */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <FlaskConical className="w-4 h-4 text-gray-400" />
          <div>
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Metabolic inhibitors
            </span>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-gray-900">
              Where each drug sits in the ranked panel
            </h2>
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <MetabolicInhibitorTable
            inhibitors={priors.metabolic_inhibitors}
          />
        </div>
      </section>
    </div>
  );
}
