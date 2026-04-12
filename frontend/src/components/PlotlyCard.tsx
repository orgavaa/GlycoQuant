import Plotly from "plotly.js-dist-min";
import { useEffect, useRef } from "react";
import { Card } from "./Card";

interface PlotlyCardProps {
  title?: string;
  subtitle?: string;
  figureJson: string;
  maxHeight?: number;
}

export function PlotlyCard({ title, subtitle, figureJson, maxHeight = 200 }: PlotlyCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    let parsed: { data: unknown; layout: Record<string, unknown> };
    try { parsed = JSON.parse(figureJson); } catch { return; }
    const layout = {
      ...parsed.layout,
      height: maxHeight,
      autosize: true,
      paper_bgcolor: "#fff",
      plot_bgcolor: "#fff",
      font: { family: "Inter, sans-serif", color: "#9ca3af", size: 10 },
      margin: { l: 50, r: 12, t: 8, b: 36 },
      xaxis: { ...(parsed.layout?.xaxis as object ?? {}), gridcolor: "#f3f4f6", zerolinecolor: "#e5e7eb", tickfont: { size: 9, family: "Inter" } },
      yaxis: { ...(parsed.layout?.yaxis as object ?? {}), gridcolor: "#f3f4f6", zerolinecolor: "#e5e7eb", tickfont: { size: 9, family: "Inter" } },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Plotly.react(ref.current, parsed.data as any, layout as any, { displayModeBar: false, responsive: true } as any);
    const el = ref.current;
    const onResize = () => { if (el) Plotly.Plots.resize(el); };
    window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("resize", onResize); if (el) Plotly.purge(el); };
  }, [figureJson, maxHeight]);

  return (
    <Card>
      {title && <h3 className="text-[13px] font-semibold text-gray-900 mb-0.5">{title}</h3>}
      {subtitle && <p className="text-[11px] text-gray-400 mb-3">{subtitle}</p>}
      <div ref={ref} style={{ width: "100%" }} />
    </Card>
  );
}
