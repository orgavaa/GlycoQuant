import { Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function ExperimentTab() {
  return (
    <Card>
      <CardContent className="py-10">
        <div className="flex flex-col items-start gap-3 max-w-2xl">
          <Sparkles className="h-5 w-5 text-[hsl(var(--brand))]" />
          <div>
            <div className="section-label">Coming in a future release</div>
            <h2 className="mt-1 text-xl font-semibold text-foreground">
              Experiment Designer
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Gaussian-process active learning for next-experiment recommendation
              over tested perturbations. Given existing results from Tab 1, the
              GP posterior will identify the untested perturbation that either
              maximizes information gain (exploration) or predicted phenotypic
              effect (exploitation). Cold-start uses the pathway prior from
              Tab 2 as a deterministic ordering.
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              See the roadmap in the README for the full PhD research directions.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
