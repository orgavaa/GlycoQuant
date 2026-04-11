import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Info, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { MetricCard } from "@/components/MetricCard";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { fetchPriors } from "@/lib/api";
import { DrillDownPanel } from "./DrillDownPanel";
import { MetabolicInhibitorTable } from "./MetabolicInhibitorTable";
import { RankingTable } from "./RankingTable";

export function PrioritizationTab() {
  const priorsQuery = useQuery({
    queryKey: ["priors"],
    queryFn: fetchPriors,
  });

  const [selectedGene, setSelectedGene] = useState<string | null>(null);

  const priors = priorsQuery.data;

  // Initialize default selected gene once priors load
  const firstGeneWithRank = useMemo(
    () =>
      priors?.genes.find((g) => g.pathway_rank !== null)?.gene ?? null,
    [priors],
  );
  const activeGene = selectedGene ?? firstGeneWithRank;

  if (priorsQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (priorsQuery.isError) {
    return (
      <Alert variant="destructive">
        <AlertTriangle />
        <AlertTitle>Failed to load priors</AlertTitle>
        <AlertDescription>
          Make sure the backend is running and{" "}
          <span className="font-mono">data/priors/pathway_ranks.json</span> exists.
          Regenerate with{" "}
          <span className="font-mono">python scripts/generate_pathway_priors.py</span>.
        </AlertDescription>
      </Alert>
    );
  }

  if (!priors) return null;

  const top3 = priors.genes.slice(0, 3);

  return (
    <div className="space-y-10">
      {/* Pathway-only warning */}
      {!priors.geneformer_available && (
        <Alert variant="warning">
          <AlertTriangle />
          <AlertTitle>Running in pathway-only mode</AlertTitle>
          <AlertDescription>
            The transcriptomic prior is not yet committed. Generate it by
            running{" "}
            <span className="rounded bg-muted px-1 py-0.5 text-[0.72rem]">
              scripts/generate_geneformer_priors.py
            </span>{" "}
            on a Colab GPU runtime to unlock the dual-prior divergence
            column.
          </AlertDescription>
        </Alert>
      )}

      {/* How this tab works */}
      <Alert variant="info">
        <Info />
        <AlertTitle>How this ranking is produced</AlertTitle>
        <AlertDescription>
          This tab is independent of the image analysis in Tab 1. It loads
          a pre-computed ranking of twenty-two glycocalyx-relevant genes
          against a fixed mechanotransduction signature, so nothing needs
          to run at view time — the page is ready as soon as you open it.
          The ranking combines curated pathway proximity from STRING v12
          with transcriptomic co-regulation from Geneformer (pretrained on
          roughly 104 M single cells). Disagreement between the two priors
          is the most scientifically informative signal on this page.
          Outputs are intended to prioritise wet-lab experiments, not to
          substitute for them.
        </AlertDescription>
      </Alert>

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
              label={`Rank ${g.pathway_rank} in STRING`}
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
