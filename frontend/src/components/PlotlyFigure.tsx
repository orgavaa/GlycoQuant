import Plotly from "plotly.js-dist-min";
import { useEffect, useRef } from "react";

interface PlotlyFigureProps {
  /** Serialized Plotly figure JSON (from ``fig.to_json()`` in Python). */
  figureJson: string;
  className?: string;
  /** Override figure height; defaults to whatever is in the JSON. */
  height?: number;
}

/**
 * Thin wrapper around plotly.js-dist-min that renders a server-generated
 * figure JSON string into a div. Responsive by default (resizes on
 * window resize). Uses ``Plotly.react`` for efficient re-renders when
 * the figure changes.
 */
export function PlotlyFigure({ figureJson, className, height }: PlotlyFigureProps) {
  const ref = useRef<HTMLDivElement>(null);

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
      ...((parsed.config as Record<string, unknown>) ?? {}),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Plotly.react(ref.current, parsed.data as any, layout as any, config as any);

    const handleResize = () => {
      if (ref.current) Plotly.Plots.resize(ref.current);
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      if (ref.current) {
        Plotly.purge(ref.current);
      }
    };
  }, [figureJson, height]);

  return <div ref={ref} className={className} style={{ width: "100%" }} />;
}
