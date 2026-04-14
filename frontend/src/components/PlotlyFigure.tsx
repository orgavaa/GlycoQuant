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
    let parsed: { data: unknown[]; layout: Record<string, unknown>; config?: Record<string, unknown> };
    try { parsed = JSON.parse(figureJson); } catch { return; }

    const backendXaxis = (parsed.layout?.xaxis ?? {}) as Record<string, unknown>;
    const backendYaxis = (parsed.layout?.yaxis ?? {}) as Record<string, unknown>;

    const layout = {
      ...parsed.layout,
      ...(height ? { height } : {}),
      autosize: true,
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      font: { family: "Inter, sans-serif", color: "#6b7280", size: 10 },
      colorway: ["#66c2a5","#fc8d62","#8da0cb","#e78ac3","#a6d854","#ffd92f","#e5c494","#b3b3b3"],
      margin: { l: 44, r: 10, t: 10, b: 36 },
      xaxis: {
        ...backendXaxis,
        gridcolor: "#f3f4f6",
        tickfont: { size: 9, family: "Inter, sans-serif", color: "#9ca3af" },
      },
      yaxis: {
        ...backendYaxis,
        gridcolor: "#f3f4f6",
        tickfont: { size: 9, family: "Inter, sans-serif", color: "#9ca3af" },
      },
    };

    // Style heatmap colorbars
    const data = (parsed.data as Record<string, unknown>[]).map(trace => {
      if (trace.type === "heatmap" && trace.colorbar) {
        return {
          ...trace,
          colorbar: {
            ...(trace.colorbar as Record<string, unknown>),
            thickness: 12,
            len: 0.85,
            tickfont: { size: 8, color: "#9ca3af" },
            outlinewidth: 0,
          },
        };
      }
      return trace;
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Plotly.react(ref.current, data as any, layout as any, {
      displayModeBar: false,
      responsive: true,
      ...(parsed.config ?? {}),
    } as any).then(() => {
      if (ref.current && onReady) onReady(ref.current);
    });

    // Resize on both window resize AND container resize. The latter matters when
    // the figure lives inside a draggable rail (RightRail) or a collapsible panel —
    // those width changes never fire a window resize event, so a bare window
    // listener leaves the Plotly chart stuck at its initial width.
    const el = ref.current;
    const onResizeFn = () => { if (el) Plotly.Plots.resize(el); };
    window.addEventListener("resize", onResizeFn);
    const parent = el.parentElement;
    const ro = parent ? new ResizeObserver(() => onResizeFn()) : null;
    if (ro && parent) ro.observe(parent);
    return () => {
      window.removeEventListener("resize", onResizeFn);
      if (ro) ro.disconnect();
      if (el) Plotly.purge(el);
    };
  }, [figureJson, height, onReady]);

  return <div ref={ref} className="w-full" />;
}
