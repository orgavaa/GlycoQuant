import Plotly from "plotly.js-dist-min";
import { useEffect, useRef } from "react";

interface Props {
  figureJson: string;
  height?: number;
  onReady?: (plotDiv: HTMLDivElement) => void;
}

export function PlotlyFigure({ figureJson, height, onReady }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    let parsed: { data: unknown; layout: Record<string, unknown>; config?: Record<string, unknown> };
    try { parsed = JSON.parse(figureJson); } catch { return; }
    const layout = {
      ...parsed.layout,
      ...(height ? { height } : {}),
      autosize: true,
      paper_bgcolor: "#fff",
      plot_bgcolor: "#fff",
      font: { family: "Inter, sans-serif", color: "#6b7280", size: 10 },
      margin: { l: 50, r: 20, t: 20, b: 40 },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Plotly.react(ref.current, parsed.data as any, layout as any, { displayModeBar: false, responsive: true, ...(parsed.config ?? {}) } as any).then(() => {
      if (ref.current && onReady) onReady(ref.current);
    });
    const el = ref.current;
    const onResizeFn = () => { if (el) Plotly.Plots.resize(el); };
    window.addEventListener("resize", onResizeFn);
    return () => { window.removeEventListener("resize", onResizeFn); if (el) Plotly.purge(el); };
  }, [figureJson, height, onReady]);

  return <div ref={ref} style={{ width: "100%" }} />;
}
