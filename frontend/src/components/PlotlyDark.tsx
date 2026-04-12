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

    const existingLayout = parsed.layout || {};
    const layout = {
      ...existingLayout,
      height, autosize: true,
      paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)",
      font: { family: "'Inter', sans-serif", color: "#999", size: 10 },
      margin: { l: 70, r: 16, t: 16, b: 50 },
      xaxis: {
        ...(existingLayout.xaxis as object ?? {}),
        gridcolor: "rgba(255,255,255,0.06)",
        tickfont: { size: 9, color: "#888", family: "'Inter', sans-serif" },
      },
      yaxis: {
        ...(existingLayout.yaxis as object ?? {}),
        gridcolor: "rgba(255,255,255,0.06)",
        tickfont: { size: 9, color: "#888", family: "'Inter', sans-serif" },
      },
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
