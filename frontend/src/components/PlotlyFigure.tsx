import Plotly from "plotly.js-dist-min";
import { useEffect, useRef } from "react";

interface Props {
  figureJson: string;
  className?: string;
  height?: number;
  downloadName?: string;
  onReady?: (plotDiv: HTMLDivElement) => void;
  onClick?: (event: Plotly.PlotMouseEvent) => void;
}

export function PlotlyFigure({ figureJson, className, height, onReady, onClick }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    let parsed: { data: unknown; layout: Record<string, unknown>; config?: Record<string, unknown> };
    try { parsed = JSON.parse(figureJson); } catch { return; }
    const layout = {
      ...parsed.layout, ...(height ? { height } : {}), autosize: true,
      paper_bgcolor: "#fff", plot_bgcolor: "#fafafa",
      font: { family: "Inter, sans-serif", color: "#666", size: 10 },
      margin: { l: 50, r: 20, t: 20, b: 40 },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Plotly.react(ref.current, parsed.data as any, layout as any, { displayModeBar: false, responsive: true, ...(parsed.config ?? {}) } as any).then(() => {
      if (ref.current && onReady) onReady(ref.current);
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (onClick && ref.current) (ref.current as any).on("plotly_click", onClick);
    const el = ref.current;
    const onResize = () => { if (el) Plotly.Plots.resize(el); };
    window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("resize", onResize); if (el) Plotly.purge(el); };
  }, [figureJson, height, onReady, onClick]);
  return <div ref={ref} className={className} style={{ width: "100%" }} />;
}
