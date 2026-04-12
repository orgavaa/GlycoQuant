/**
 * Tab 2 — Perturbation Prioritization.
 *
 * Restyled with the Stitch "Quantitative Aesthetic" visual language:
 * ghost-border cards, Surface token hierarchy, Space Grotesk headlines,
 * Material Symbols icons, 10px uppercase labels. All data logic is
 * preserved from the original implementation.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
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
        <span className="material-symbols-outlined text-[32px] text-primary animate-spin">
          progress_activity
        </span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bg-error-container/20 ghost-border p-6">
        <div className="flex items-center gap-3 mb-2">
          <span className="material-symbols-outlined text-error-stitch">warning</span>
          <span className="text-sm font-headline font-semibold text-on-surface">
            Failed to load priors
          </span>
        </div>
        <p className="text-xs text-on-surface-variant">
          Make sure the backend is running and{" "}
          <span className="font-mono">data/priors/pathway_ranks.json</span>{" "}
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
        <div className="bg-primary-container/30 ghost-border p-6">
          <div className="flex items-center gap-3 mb-3">
            <span className="material-symbols-outlined text-primary">auto_awesome</span>
            <span className="text-sm font-headline font-semibold text-on-surface">
              Ranking contextualised by your Tab 1 analysis
            </span>
            {latestDatasetLabel && (
              <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 ghost-border bg-surface-container-lowest text-on-surface-variant">
                {latestDatasetLabel}
              </span>
            )}
            {latestJobResult && (
              <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 ghost-border bg-surface-container-lowest text-on-surface-variant tabular-nums">
                {latestJobResult.cell_count} cells
              </span>
            )}
          </div>
          <p className="text-xs text-on-surface-variant leading-relaxed max-w-3xl">
            The pathway prior has been re-aggregated via a weighted median
            of the per-target inverse shortest-paths, where the weights
            come from z-scored deviations of your observed per-cell features
            against a reference cohort.
          </p>
          {topWeights.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <span className="text-[10px] text-on-surface-variant uppercase tracking-widest">
                Mechano genes most weighted:
              </span>
              {topWeights.map(([gene, weight]) => (
                <span
                  key={gene}
                  className="text-[10px] font-mono font-bold px-1.5 py-0.5 ghost-border bg-surface-container-lowest tabular-nums"
                >
                  {gene} · {weight.toFixed(2)}
                </span>
              ))}
            </div>
          )}
          <div className="pt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setForceStatic(true)}
              className="text-[10px] uppercase tracking-widest ghost-border"
            >
              Show static ranking
            </Button>
          </div>
        </div>
      ) : (
        <div className="bg-surface-container-lowest ghost-border p-6">
          <div className="flex items-center gap-3 mb-3">
            <span className="material-symbols-outlined text-primary">info</span>
            <span className="text-sm font-headline font-semibold text-on-surface">
              How this ranking is produced
            </span>
          </div>
          <p className="text-xs text-on-surface-variant leading-relaxed max-w-3xl">
            This tab loads a pre-computed pathway ranking of twenty-two
            glycocalyx-relevant genes against a fixed 15-gene
            mechanotransduction signature, so nothing needs to run at
            view time. The ranking combines curated pathway proximity
            from STRING v12 with transcriptomic co-regulation from
            Geneformer (Theodoris 2023, ~10⁴ M cells). Disagreement
            between the two priors is the most scientifically
            informative signal on this page.
          </p>
          {latestJobResult !== null && forceStatic && (
            <div className="pt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setForceStatic(false)}
                className="text-[10px] uppercase tracking-widest ghost-border"
              >
                Contextualise with my Tab 1 result
              </Button>
            </div>
          )}
          {latestJobResult === null && (
            <p className="mt-3 text-[10px] text-on-surface-variant uppercase tracking-widest">
              Run an image analysis in Tab 1 to see a ranking
              contextualised by your own image.
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
        <div className="ghost-border bg-amber-500/5 p-6">
          <div className="flex items-center gap-3 mb-2">
            <span className="material-symbols-outlined text-amber-600">warning</span>
            <span className="text-sm font-headline font-semibold text-on-surface">
              Running in pathway-only mode
            </span>
          </div>
          <p className="text-xs text-on-surface-variant leading-relaxed">
            The transcriptomic prior is not yet committed, and this
            deployment cannot generate it (no Modal GPU provider).
          </p>
        </div>
      )}

      {/* Hero: top 3 glycocalyx genes */}
      <section>
        <div className="mb-4">
          <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
            Top candidates
          </span>
          <h2 className="mt-1 text-xl font-headline font-semibold tracking-tight text-on-surface">
            Highest pathway proximity to the mechanotransduction signature
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {top3.map((g) => (
            <div key={g.gene} className="bg-surface-container-lowest p-6 ghost-border">
              <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
                Rank {g.pathway_rank} in {isDynamic ? "dynamic" : "STRING"} prior
              </span>
              <div className="text-3xl font-headline font-medium tracking-tighter text-on-surface mt-2 tabular-nums">
                {g.gene}
              </div>
              {g.pathway_score !== null && (
                <div className="text-xs text-on-surface-variant mt-1 tabular-nums font-mono">
                  score {g.pathway_score.toFixed(3)}
                </div>
              )}
              <div className="w-full h-[1px] bg-outline-variant/20 mt-4" />
            </div>
          ))}
        </div>
      </section>

      {/* Ranking table */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <div>
            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
              Ranked perturbations
            </span>
            <h2 className="mt-1 text-xl font-headline font-semibold tracking-tight text-on-surface">
              Twenty-two glycocalyx genes, sorted by pathway rank
            </h2>
          </div>
          <span className="text-[10px] text-on-surface-variant uppercase tracking-widest">
            Click any row to drill into its per-target evidence
          </span>
        </div>
        <div className="bg-surface-container-lowest ghost-border p-6">
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
          <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
            Per-gene drill-down
          </span>
          <h2 className="mt-1 text-xl font-headline font-semibold tracking-tight text-on-surface">
            Shortest-path evidence for the selected gene
          </h2>
        </div>
        <div className="bg-surface-container-lowest ghost-border p-6">
          {activeGene ? (
            <DrillDownPanel
              gene={activeGene}
              mechanoSignature={priors.mechano_signature}
              onGeneChange={setSelectedGene}
              availableGenes={priors.genes.map((g) => g.gene)}
            />
          ) : (
            <p className="text-xs text-on-surface-variant">
              No genes available.
            </p>
          )}
        </div>
      </section>

      {/* Metabolic inhibitors */}
      <section className="space-y-4">
        <div>
          <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
            Metabolic inhibitors
          </span>
          <h2 className="mt-1 text-xl font-headline font-semibold tracking-tight text-on-surface">
            Where each drug sits in the ranked panel via its primary target
          </h2>
        </div>
        <div className="bg-surface-container-lowest ghost-border p-6">
          <MetabolicInhibitorTable
            inhibitors={priors.metabolic_inhibitors}
          />
        </div>
      </section>
    </div>
  );
}
