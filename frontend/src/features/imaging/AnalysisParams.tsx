import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface AnalysisParamsProps {
  cellDiameter: number;
  includeDeepFeatures: boolean;
  onDiameterChange: (v: number) => void;
  onDeepFeaturesChange: (v: boolean) => void;
  disabled: boolean;
}

export function AnalysisParams({
  cellDiameter,
  includeDeepFeatures,
  onDiameterChange,
  onDeepFeaturesChange,
  disabled,
}: AnalysisParamsProps) {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="cell-diameter" className="section-label">
          Expected cell diameter (px)
        </Label>
        <Input
          id="cell-diameter"
          type="number"
          min={10}
          max={300}
          step={5}
          value={cellDiameter}
          onChange={(e) => onDiameterChange(Number(e.target.value))}
          disabled={disabled}
        />
        <p className="text-[0.72rem] leading-snug text-muted-foreground">
          Prior on segmentation scale. A value near the true mean cell
          diameter improves Cellpose stability on small or dense fields.
        </p>
      </div>

      <div className="flex items-start gap-2.5">
        <Checkbox
          id="deep-features"
          checked={includeDeepFeatures}
          onCheckedChange={(v) => onDeepFeaturesChange(v === true)}
          disabled={disabled}
          className="mt-0.5"
        />
        <div className="flex flex-col gap-0.5">
          <Label htmlFor="deep-features" className="cursor-pointer text-xs">
            Compute DINOv2 embeddings
          </Label>
          <p className="text-[0.7rem] leading-snug text-muted-foreground">
            Adds a 768-dimensional learned descriptor per cell and a
            UMAP projection. Substantially slower on CPU.
          </p>
        </div>
      </div>
    </div>
  );
}
