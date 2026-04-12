/**
 * PlotlyChart — dark-styled Plotly wrapper for the right rail only.
 * NOT used for the main canvas.
 */
import Plotly from "plotly.js-dist-min";
import { useEffect, useRef } from "react";

interface PlotlyChartProps {
  figureJson: string;
  height?: number;
}

export function PlotlyChart({ figureJson, height = 200 }: PlotlyChartProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    let parsed: { data: unknown; layout: unknown };
    try {
      parsed = JSON.parse(figureJson);
    } catch {
      return;
    }

    const layout = {
      ...(parsed.layout as Record<string, unknown>),
      height,
      autosize: true,
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      font: { family: "ui-monospace, monospace", color: "#888", size: 10 },
      margin: { l: 35, r: 10, t: 10, b: 30 },
    };

    const config = {
      displaylogo: false,
      displayModeBar: false,
      responsive: true,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Plotly.react(ref.current, parsed.data as any, layout as any, config as any);

    const handleResize = () => {
      if (ref.current) Plotly.Plots.resize(ref.current);
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      if (ref.current) Plotly.purge(ref.current);
    };
  }, [figureJson, height]);

  return <div ref={ref} style={{ width: "100%" }} />;
}
