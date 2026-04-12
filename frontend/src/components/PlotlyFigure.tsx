/**
 * PlotlyFigure — Plotly wrapper for white-background contexts (Ranking tab).
 * White paper bg, gray text, no toolbar.
 */
import Plotly from "plotly.js-dist-min";
import { useEffect, useRef } from "react";

interface PlotlyFigureProps {
  figureJson: string;
  className?: string;
  height?: number;
  downloadName?: string;
  onReady?: (plotDiv: HTMLDivElement) => void;
  onClick?: (event: Plotly.PlotMouseEvent) => void;
}

export function PlotlyFigure({
  figureJson,
  className,
  height,
  onReady,
  onClick,
}: PlotlyFigureProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    let parsed: { data: unknown; layout: unknown; config?: unknown };
    try {
      parsed = JSON.parse(figureJson);
    } catch {
      return;
    }
    const layout = {
      ...(parsed.layout as Record<string, unknown>),
      ...(height ? { height } : {}),
      autosize: true,
      paper_bgcolor: "#fff",
      plot_bgcolor: "#fafafa",
      font: { family: "ui-monospace, monospace", color: "#333", size: 10 },
      margin: { l: 50, r: 20, t: 20, b: 40 },
    };
    const config = {
      displaylogo: false,
      displayModeBar: false,
      responsive: true,
      ...((parsed.config as Record<string, unknown>) ?? {}),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Plotly.react(ref.current, parsed.data as any, layout as any, config as any).then(() => {
      if (ref.current && onReady) onReady(ref.current);
    });

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
      if (ref.current) Plotly.purge(ref.current);
    };
  }, [figureJson, height, onReady, onClick]);

  return <div ref={ref} className={className} style={{ width: "100%" }} />;
}
