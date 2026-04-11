import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Info, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { MetricCard } from "@/components/MetricCard";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <div className="space-y-6">
      {/* Pathway-only warning */}
      {!priors.geneformer_available && (
        <Alert variant="warning">
          <AlertTriangle />
          <AlertTitle>Pathway-only mode</AlertTitle>
          <AlertDescription>
            Geneformer prior not found at{" "}
            <span className="font-mono">data/priors/geneformer_ranks.json</span>.
            To enable the dual-prior divergence column, run{" "}
            <span className="font-mono">scripts/generate_geneformer_priors.py</span>{" "}
            on a Colab GPU runtime and commit the resulting JSON.
          </AlertDescription>
        </Alert>
      )}

      {/* Scientific disclaimer */}
      <Alert variant="info">
        <Info />
        <AlertTitle>Hypothesis ranking, not mechanistic prediction</AlertTitle>
        <AlertDescription>
          These rankings reflect transcriptomic co-regulation (Geneformer,
          ~104 M cells) and curated pathway proximity (STRING v12). They
          generate hypotheses for experimental validation. When the two priors
          disagree, the divergence is the most informative signal on this page.
        </AlertDescription>
      </Alert>

      {/* Hero: top 3 glycocalyx genes by pathway rank */}
      <div>
        <div className="section-label mb-2">Top candidates by pathway score</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {top3.map((g) => (
            <MetricCard
              key={g.gene}
              label={`Rank #${g.pathway_rank} · Pathway`}
              value={g.gene}
              unit={
                g.pathway_score !== null
                  ? `s=${g.pathway_score.toFixed(3)}`
                  : ""
              }
            />
          ))}
        </div>
      </div>

      {/* Ranking table */}
      <Card>
        <CardHeader className="flex-row items-baseline justify-between">
          <CardTitle className="text-sm">Ranked perturbations</CardTitle>
          <span className="font-mono text-[0.72rem] text-muted-foreground">
            {priors.genes.length} glycocalyx genes · sorted by pathway rank
          </span>
        </CardHeader>
        <CardContent>
          <RankingTable
            genes={priors.genes}
            geneformerAvailable={priors.geneformer_available}
            selectedGene={activeGene}
            onSelectGene={setSelectedGene}
          />
        </CardContent>
      </Card>

      {/* Per-gene drill-down */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Per-gene drill-down</CardTitle>
        </CardHeader>
        <CardContent>
          {activeGene ? (
            <DrillDownPanel
              gene={activeGene}
              mechanoSignature={priors.mechano_signature}
              onGeneChange={setSelectedGene}
              availableGenes={priors.genes.map((g) => g.gene)}
            />
          ) : (
            <p className="text-sm text-muted-foreground">No genes available.</p>
          )}
        </CardContent>
      </Card>

      {/* Metabolic inhibitors panel */}
      <Card>
        <CardHeader className="flex-row items-baseline justify-between">
          <CardTitle className="text-sm">Metabolic inhibitors</CardTitle>
          <span className="font-mono text-[0.72rem] text-muted-foreground">
            drug → primary target gene → position in ranked panel
          </span>
        </CardHeader>
        <CardContent>
          <MetabolicInhibitorTable inhibitors={priors.metabolic_inhibitors} />
        </CardContent>
      </Card>
    </div>
  );
}
