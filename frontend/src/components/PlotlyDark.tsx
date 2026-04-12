/**
 * PlotlyDark — dark-styled Plotly wrapper for the right rail.
 * Transparent background, muted axes, no toolbar.
 */
import Plotly from "plotly.js-dist-min";
import { useEffect, useRef } from "react";

interface PlotlyDarkProps {
  figureJson: string;
  height?: number;
  title?: string;
}

export function PlotlyDark({ figureJson, height = 200, title }: PlotlyDarkProps) {
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
      font: {
        family: "ui-monospace, 'JetBrains Mono', monospace",
        color: "#aaa",
        size: 9,
      },
      margin: { l: 35, r: 10, t: 10, b: 30 },
      xaxis: {
        ...((parsed.layout as Record<string, unknown>)?.xaxis ?? {}),
        gridcolor: "rgba(255,255,255,0.05)",
        zerolinecolor: "rgba(255,255,255,0.08)",
      },
      yaxis: {
        ...((parsed.layout as Record<string, unknown>)?.yaxis ?? {}),
        gridcolor: "rgba(255,255,255,0.05)",
        zerolinecolor: "rgba(255,255,255,0.08)",
      },
    };

    const config = {
      displaylogo: false,
      displayModeBar: false,
      responsive: true,
      staticPlot: false,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Plotly.react(ref.current, parsed.data as any, layout as any, config as any);

    const el = ref.current;
    const handleResize = () => {
      if (el) Plotly.Plots.resize(el);
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      if (el) Plotly.purge(el);
    };
  }, [figureJson, height]);

  return (
    <div>
      {title && (
        <div className="text-[10px] text-[#888] mono mb-1">{title}</div>
      )}
      <div ref={ref} style={{ width: "100%" }} />
    </div>
  );
}
