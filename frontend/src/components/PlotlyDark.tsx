/**
 * PlotlyDark — dark-styled Plotly chart wrapper for the right rail.
 */
import Plotly from "plotly.js-dist-min";
import { useEffect, useRef } from "react";

interface PlotlyDarkProps {
  figureJson: string;
  height?: number;
}

export function PlotlyDark({ figureJson, height = 200 }: PlotlyDarkProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    let parsed: { data: unknown; layout: Record<string, unknown> };
    try { parsed = JSON.parse(figureJson); } catch { return; }

    const layout = {
      ...parsed.layout,
      height, autosize: true,
      paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)",
      font: { family: "ui-monospace, 'JetBrains Mono', monospace", color: "#888", size: 9 },
      margin: { l: 60, r: 16, t: 12, b: 40 },
      xaxis: { ...(parsed.layout.xaxis ?? {}), gridcolor: "rgba(255,255,255,0.05)", tickfont: { size: 8, color: "#666" } },
      yaxis: { ...(parsed.layout.yaxis ?? {}), gridcolor: "rgba(255,255,255,0.05)", tickfont: { size: 8, color: "#666" } },
    };
    const config = { displayModeBar: false, displaylogo: false, responsive: true };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Plotly.react(ref.current, parsed.data as any, layout as any, config as any);

    const el = ref.current;
    const handleResize = () => { if (el) Plotly.Plots.resize(el); };
    window.addEventListener("resize", handleResize);
    return () => { window.removeEventListener("resize", handleResize); if (el) Plotly.purge(el); };
  }, [figureJson, height]);

  return <div ref={ref} style={{ width: "100%" }} />;
}
