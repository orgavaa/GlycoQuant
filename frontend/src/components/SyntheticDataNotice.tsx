import { ExternalLink, Microscope } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DemoCondition } from "@/lib/api";

/**
 * Inline notice that describes the scientific provenance of the
 * currently-displayed bundled dataset.
 *
 * The bundled demos are real Human Protein Atlas immunofluorescence
 * images, but they do **not** follow the Labouesse 5-channel protocol
 * exactly (HPA ships DAPI + antibody + microtubules + ER, not
 * DAPI + WGA-lectin + YAP + paxillin + phalloidin). This component
 * makes that reality transparent so no reviewer is confused about
 * what they are looking at.
 */
interface DataProvenanceNoticeProps {
  dataset: DemoCondition;
  variant?: "banner" | "inline";
  className?: string;
}

export function DataProvenanceNotice({
  dataset,
  variant = "banner",
  className,
}: DataProvenanceNoticeProps) {
  if (variant === "inline") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-[0.7rem] font-medium uppercase tracking-wider text-muted-foreground",
          className,
        )}
      >
        <Microscope className="h-3 w-3" />
        {dataset.source}
      </span>
    );
  }

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-md border border-border bg-muted/60 px-4 py-3",
        className,
      )}
    >
      <Microscope className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="flex-1 text-[0.78rem] leading-snug text-muted-foreground">
        <div className="mb-1">
          <span className="font-semibold text-foreground">
            {dataset.display_name || dataset.attribution}
          </span>
          {dataset.license && (
            <span className="ml-2 text-[0.7rem] uppercase tracking-wider">
              {dataset.license}
            </span>
          )}
        </div>
        <p>
          Real fluorescence microscopy from the{" "}
          <span className="font-medium text-foreground">{dataset.source}</span>
          . {dataset.description}
        </p>
        <p className="mt-1.5 text-[0.72rem]">
          <span className="font-semibold text-foreground">
            Channel-layout caveat:
          </span>{" "}
          HPA ships four channels (DAPI, antibody target, microtubules, ER).
          We stitch them into the five-slot GlycoQuant TIFF so the pipeline
          runs end-to-end, but only the DAPI and antibody slots carry
          biologically meaningful features on these images. Features
          computed on the YAP, paxillin, and actin slots reflect HPA
          reference stains, not the Labouesse-protocol targets. Upload a
          real five-channel TIFF to analyse a Labouesse-protocol image.
        </p>
        {dataset.attribution_url && (
          <a
            href={dataset.attribution_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1.5 inline-flex items-center gap-1 text-[0.72rem] font-medium text-foreground hover:underline"
          >
            Source on proteinatlas.org
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </div>
  );
}
