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
      plot_bgcolor: "#ffffff",
      font: { family: "Inter, sans-serif", color: "#6b7280", size: 10 },
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

    const el = ref.current;
    const onResizeFn = () => { if (el) Plotly.Plots.resize(el); };
    window.addEventListener("resize", onResizeFn);
    return () => { window.removeEventListener("resize", onResizeFn); if (el) Plotly.purge(el); };
  }, [figureJson, height, onReady]);

  return <div ref={ref} className="w-full" />;
}
