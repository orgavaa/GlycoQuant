/**
 * Condition Compare — the experimental screen.
 *
 * Multi-condition support is not in Phase 1 scope (Tab 1 currently
 * processes one image at a time). This view is the IA placeholder
 * for that future capability so the brief's four-view structure is
 * present from day one. Per UI_SCIENCE_GUIDELINES §11, we deliberately
 * do *not* fake the data — we explain what's missing and what would
 * unlock it.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function CompareView() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-[0.95rem]">
            Condition Compare — coming next
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Compare control vs perturbation populations from the same image
            cohort.
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 text-sm text-foreground">
            <p>
              Tab 1 currently analyses one image at a time. Cross-condition
              comparison requires running the pipeline on a paired control and
              perturbation image, then aligning the per-cell feature
              distributions for an effect-size readout.
            </p>
            <div className="rounded-md border border-border bg-muted/40 p-4">
              <p className="text-[0.72rem] uppercase tracking-wide text-muted-foreground">
                Planned content
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs">
                <li>
                  KPI strip: Δ mechano score, Δ glyco↔mechano top |r|,
                  Cohen&apos;s d on each block
                </li>
                <li>Pairwise violins / dot plots for the curated mechano panel</li>
                <li>Representative-cell strip per condition</li>
                <li>Cluster / state comparison overlay on the canvas</li>
              </ul>
            </div>
            <p className="text-xs text-muted-foreground">
              Bring two image runs into a shared cohort by enabling the
              multi-batch loader (Phase 2). Until then, use Methods &amp; QC to
              audit each run individually and the Tab 2 prioritization view for
              perturbation prediction.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
