import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Info, Loader2, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { MetricCard } from "@/components/MetricCard";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

/**
 * Tab 2 — Perturbation Prioritization.
 *
 * Three loading paths, picked in order:
 *
 * 1. **Dynamic** — a completed Tab 1 ``JobResult`` lives in the
 *    Zustand store and the user has not explicitly toggled back to
 *    the static view. We call ``POST /priors/contextual`` with the
 *    per-cell feature table and render a banner naming the top
 *    mechano-gene weights that drove the re-ranking.
 * 2. **Static** — no Tab 1 result is available (or the user toggled
 *    it off). We call ``GET /priors`` as before.
 * 3. **Geneformer bootstrap** — when the backend reports
 *    ``can_generate_geneformer=true`` and the transcriptomic prior is
 *    still missing, we render a card with a button that spawns the
 *    Modal in-silico perturbation run via ``POST /priors/geneformer/generate``.
 */
export function PrioritizationTab() {
  const queryClient = useQueryClient();
  const [selectedGene, setSelectedGene] = useState<string | null>(null);
  const [forceStatic, setForceStatic] = useState(false);

  const latestJobResult = useJobStore((s) => s.latestJobResult);
  const latestDatasetLabel = useJobStore((s) => s.latestDatasetLabel);

  // ------------------------------------------------------------ static query
  const staticQuery = useQuery({
    queryKey: ["priors"],
    queryFn: fetchPriors,
  });

  // ------------------------------------------------------------ dynamic path
  const canGoDynamic = !forceStatic && latestJobResult !== null;

  const contextualMutation = useMutation({
    mutationFn: fetchContextualPriors,
  });

  // Re-fire the contextual request whenever a fresh Tab 1 result arrives
  useEffect(() => {
    if (!canGoDynamic || !latestJobResult) return;
    contextualMutation.mutate({
      features_df_json: latestJobResult.features_df_json,
      cell_count: latestJobResult.cell_count,
      dataset_label: latestDatasetLabel,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canGoDynamic, latestJobResult?.image_hash, latestDatasetLabel]);

  // Pick which response to render
  const dynamicPriors: PriorsResponse | undefined = canGoDynamic
    ? contextualMutation.data
    : undefined;
  const priors = dynamicPriors ?? staticQuery.data;
  const isLoading =
    staticQuery.isLoading ||
    (canGoDynamic && contextualMutation.isPending && !contextualMutation.data);
  const isError = staticQuery.isError && !dynamicPriors;

  // Map of static path-rank by gene — only used to render the Δ column
  // when we're in dynamic mode. Pulled from the cached static query.
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

  // Pick a default drill-down gene
  const firstGeneWithRank = useMemo(
    () => priors?.genes.find((g) => g.pathway_rank !== null)?.gene ?? null,
    [priors],
  );
  const activeGene = selectedGene ?? firstGeneWithRank;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertTriangle />
        <AlertTitle>Failed to load priors</AlertTitle>
        <AlertDescription>
          Make sure the backend is running and{" "}
          <span className="font-mono">data/priors/pathway_ranks.json</span>{" "}
          exists. Regenerate with{" "}
          <span className="font-mono">
            python scripts/generate_pathway_priors.py
          </span>
          .
        </AlertDescription>
      </Alert>
    );
  }

  if (!priors) return null;

  const top3 = priors.genes.slice(0, 3);
  const isDynamic = !!dynamicPriors;

  // Top 3 mechano weights for the banner pills (only in dynamic mode)
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
        <Alert variant="info">
          <Sparkles />
          <AlertTitle className="flex items-center gap-2">
            Ranking contextualised by your Tab 1 analysis
            {latestDatasetLabel && (
              <Badge variant="outline" className="font-normal">
                {latestDatasetLabel}
              </Badge>
            )}
            {latestJobResult && (
              <Badge variant="outline" className="font-normal">
                {latestJobResult.cell_count} cells
              </Badge>
            )}
          </AlertTitle>
          <AlertDescription>
            <p className="mb-2">
              The pathway prior has been re-aggregated via a weighted
              median of the per-target inverse shortest-paths, where
              the weights come from z-scored deviations of your
              observed per-cell features against a reference cohort.
              Genes that sit topologically close to the mechano axes
              that are actually engaged in your image rise to the top.
            </p>
            {topWeights.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-[0.72rem] text-muted-foreground">
                  Mechano genes most weighted:
                </span>
                {topWeights.map(([gene, weight]) => (
                  <Badge key={gene} variant="secondary">
                    {gene} · {weight.toFixed(2)}
                  </Badge>
                ))}
              </div>
            )}
            {priors.used_fallback_reference && (
              <p className="mt-2 text-[0.72rem] text-muted-foreground">
                Using hardcoded biological nulls as the reference — a
                bundled cohort will replace these once{" "}
                <span className="font-mono">
                  data/reference/mechano_reference.json
                </span>{" "}
                is generated.
              </p>
            )}
            <div className="pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setForceStatic(true)}
              >
                Show static ranking
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : (
        <Alert variant="info">
          <Info />
          <AlertTitle>How this ranking is produced</AlertTitle>
          <AlertDescription>
            This tab loads a pre-computed pathway ranking of twenty-two
            glycocalyx-relevant genes against a fixed 15-gene
            mechanotransduction signature, so nothing needs to run at
            view time. The ranking combines curated pathway proximity
            from STRING v12 with transcriptomic co-regulation from
            Geneformer (Theodoris 2023, ~104 M cells). Disagreement
            between the two priors is the most scientifically
            informative signal on this page.
            {latestJobResult !== null && forceStatic && (
              <div className="pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setForceStatic(false)}
                >
                  Contextualise with my Tab 1 result
                </Button>
              </div>
            )}
            {latestJobResult === null && (
              <p className="mt-2 text-[0.72rem] text-muted-foreground">
                Run an image analysis in Tab 1 to see a ranking
                contextualised by your own image.
              </p>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Geneformer bootstrap: shown when the pathway-only mode is
          active AND the backend says it can run Modal */}
      {!priors.geneformer_available && priors.can_generate_geneformer && (
        <GeneformerRunCard
          onComplete={() =>
            queryClient.invalidateQueries({ queryKey: ["priors"] })
          }
        />
      )}
      {/* Fallback warning when we can't offer Axis B either */}
      {!priors.geneformer_available && !priors.can_generate_geneformer && (
        <Alert variant="warning">
          <AlertTriangle />
          <AlertTitle>Running in pathway-only mode</AlertTitle>
          <AlertDescription>
            The transcriptomic prior is not yet committed, and this
            deployment cannot generate it (no Modal GPU provider).
            Generate it by running{" "}
            <span className="rounded bg-muted px-1 py-0.5 text-[0.72rem]">
              bash scripts/deploy_modal.sh
            </span>{" "}
            and setting{" "}
            <span className="rounded bg-muted px-1 py-0.5 text-[0.72rem]">
              GLYCOQUANT_GPU_PROVIDER=modal
            </span>{" "}
            on the backend.
          </AlertDescription>
        </Alert>
      )}

      {/* Hero: top 3 glycocalyx genes by pathway rank */}
      <section>
        <div className="mb-3">
          <div className="section-label">Top candidates</div>
          <h2 className="mt-1 text-[1.05rem] font-semibold leading-tight text-foreground">
            Highest pathway proximity to the mechanotransduction signature
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {top3.map((g) => (
            <MetricCard
              key={g.gene}
              label={`Rank ${g.pathway_rank} in ${isDynamic ? "dynamic" : "STRING"} prior`}
              value={g.gene}
              unit={
                g.pathway_score !== null
                  ? `score ${g.pathway_score.toFixed(3)}`
                  : ""
              }
            />
          ))}
        </div>
      </section>

      {/* Ranking table */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="section-label">Ranked perturbations</div>
            <h2 className="mt-1 text-[1.05rem] font-semibold leading-tight text-foreground">
              Twenty-two glycocalyx genes, sorted by pathway rank
            </h2>
          </div>
          <span className="text-[0.72rem] text-muted-foreground">
            Click any row to drill into its per-target evidence
          </span>
        </div>
        <Card>
          <CardContent className="pt-6">
            <RankingTable
              genes={priors.genes}
              geneformerAvailable={priors.geneformer_available}
              selectedGene={activeGene}
              onSelectGene={setSelectedGene}
              staticRankByGene={staticRankByGene}
            />
          </CardContent>
        </Card>
      </section>

      {/* Per-gene drill-down */}
      <section className="space-y-4">
        <div>
          <div className="section-label">Per-gene drill-down</div>
          <h2 className="mt-1 text-[1.05rem] font-semibold leading-tight text-foreground">
            Shortest-path evidence for the selected gene
          </h2>
        </div>
        <Card>
          <CardContent className="pt-6">
            {activeGene ? (
              <DrillDownPanel
                gene={activeGene}
                mechanoSignature={priors.mechano_signature}
                onGeneChange={setSelectedGene}
                availableGenes={priors.genes.map((g) => g.gene)}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                No genes available.
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Metabolic inhibitors panel */}
      <section className="space-y-4">
        <div>
          <div className="section-label">Metabolic inhibitors</div>
          <h2 className="mt-1 text-[1.05rem] font-semibold leading-tight text-foreground">
            Where each drug sits in the ranked panel via its primary target
          </h2>
        </div>
        <Card>
          <CardContent className="pt-6">
            <MetabolicInhibitorTable
              inhibitors={priors.metabolic_inhibitors}
            />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
