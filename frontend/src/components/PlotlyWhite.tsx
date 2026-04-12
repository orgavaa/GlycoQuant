import Plotly from "plotly.js-dist-min";
import { useEffect, useRef } from "react";

interface Props { figureJson: string; maxHeight?: number; }

export function PlotlyWhite({ figureJson, maxHeight = 200 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    let parsed: { data: unknown; layout: Record<string, unknown> };
    try { parsed = JSON.parse(figureJson); } catch { return; }
    const layout = {
      ...parsed.layout, height: maxHeight, autosize: true,
      paper_bgcolor: "#fff", plot_bgcolor: "#fff",
      font: { family: "Inter, sans-serif", color: "#999", size: 10 },
      margin: { l: 50, r: 10, t: 8, b: 40 },
      xaxis: { ...(parsed.layout.xaxis as object ?? {}), gridcolor: "#f0f0f0", zerolinecolor: "#e8e8e8", tickfont: { size: 9, family: "Inter" } },
      yaxis: { ...(parsed.layout.yaxis as object ?? {}), gridcolor: "#f0f0f0", zerolinecolor: "#e8e8e8", tickfont: { size: 9, family: "Inter" } },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Plotly.react(ref.current, parsed.data as any, layout as any, { displayModeBar: false, responsive: true } as any);
    const el = ref.current;
    const onResize = () => { if (el) Plotly.Plots.resize(el); };
    window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("resize", onResize); if (el) Plotly.purge(el); };
  }, [figureJson, maxHeight]);
  return <div ref={ref} style={{ width: "100%" }} />;
}
