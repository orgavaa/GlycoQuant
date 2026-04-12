import { Download } from "lucide-react";
import Plotly from "plotly.js-dist-min";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";

interface PlotlyFigureProps {
  /** Serialized Plotly figure JSON (from ``fig.to_json()`` in Python). */
  figureJson: string;
  className?: string;
  /** Override figure height; defaults to whatever is in the JSON. */
  height?: number;
  /** When set, show an explicit "Download PNG" button above the plot. */
  downloadName?: string;
  /** Callback fired after Plotly.react completes, giving the parent
   *  a ref to the plot div for direct Plotly.restyle calls. */
  onReady?: (plotDiv: HTMLDivElement) => void;
  /** Callback fired when a trace point is clicked. */
  onClick?: (event: Plotly.PlotMouseEvent) => void;
}

/**
 * Thin wrapper around plotly.js-dist-min that renders a server-generated
 * figure JSON string into a div. Responsive by default (resizes on
 * window resize). Uses ``Plotly.react`` for efficient re-renders when
 * the figure changes.
 */
export function PlotlyFigure({
  figureJson,
  className,
  height,
  downloadName,
  onReady,
  onClick,
}: PlotlyFigureProps) {
  const ref = useRef<HTMLDivElement>(null);

  const handleDownload = () => {
    if (!ref.current) return;
    // Plotly's runtime accepts `scale` on downloadImage options but its
    // TS type (DownloadImgopts) does not list it — cast the whole opts
    // object to any to let the 3x DPI export through.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Plotly.downloadImage(ref.current as any, {
      format: "png",
      filename: downloadName ?? "glycoquant-figure",
      width: ref.current.clientWidth || 1200,
      height: height ?? 560,
      scale: 3,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  };

  useEffect(() => {
    if (!ref.current) return;
    let parsed: { data: unknown; layout: unknown; config?: unknown };
    try {
      parsed = JSON.parse(figureJson);
    } catch (e) {
      console.error("Failed to parse figure JSON", e);
      return;
    }
    const layout = {
      ...(parsed.layout as Record<string, unknown>),
      ...(height ? { height } : {}),
      autosize: true,
    };
    const config = {
      displaylogo: false,
      responsive: true,
      modeBarButtonsToRemove: [
        "lasso2d",
        "select2d",
        "toggleSpikelines",
      ],
      // Publication-quality PNG export via the modebar camera icon.
      // Same TS-type workaround as handleDownload above.
      toImageButtonOptions: {
        format: "png",
        filename: "glycoquant-figure",
        scale: 3,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      ...((parsed.config as Record<string, unknown>) ?? {}),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Plotly.react(ref.current, parsed.data as any, layout as any, config as any).then(() => {
      if (ref.current && onReady) onReady(ref.current);
    });

    // Wire click handler if provided
    const plotDiv = ref.current;
    if (onClick && plotDiv) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (plotDiv as any).on("plotly_click", onClick);
    }

    const handleResize = () => {
      if (ref.current) Plotly.Plots.resize(ref.current);
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      if (plotDiv && onClick) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (plotDiv as any).removeAllListeners?.("plotly_click");
      }
      if (ref.current) {
        Plotly.purge(ref.current);
      }
    };
  }, [figureJson, height, onReady, onClick]);

  if (!downloadName) {
    return <div ref={ref} className={className} style={{ width: "100%" }} />;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={handleDownload}>
          <Download className="h-3.5 w-3.5" />
          Download PNG
        </Button>
      </div>
      <div ref={ref} className={className} style={{ width: "100%" }} />
    </div>
  );
}
