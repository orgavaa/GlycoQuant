import Plotly from "plotly.js-dist-min";
import { useEffect, useRef, type ReactNode } from "react";
import { Card } from "./Card";

interface PlotlyCardProps {
  title?: ReactNode;
  subtitle?: string;
  figureJson: string;
  maxHeight?: number;
}

export function PlotlyCard({ title, subtitle, figureJson, maxHeight = 300 }: PlotlyCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    let parsed: { data: unknown[]; layout: Record<string, unknown> };
    try { parsed = JSON.parse(figureJson); } catch { return; }

    const backendXaxis = (parsed.layout?.xaxis ?? {}) as Record<string, unknown>;
    const backendYaxis = (parsed.layout?.yaxis ?? {}) as Record<string, unknown>;

    const layout: Record<string, unknown> = {
      ...parsed.layout,
      // Strip the backend's title + annotations — we render our own via React
      title: undefined,
      annotations: (parsed.layout?.annotations as unknown[] ?? []).filter(
        (a: unknown) => !(a as Record<string, unknown>)?.text?.toString().includes("correlation")
          && !(a as Record<string, unknown>)?.text?.toString().includes("top |")
      ),
      height: maxHeight,
      autosize: true,
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      font: { family: "IBM Plex Sans, sans-serif", color: "#6b7280", size: 11 },
      colorway: ["#66c2a5","#fc8d62","#8da0cb","#e78ac3","#a6d854","#ffd92f","#e5c494","#b3b3b3"],
      margin: { l: 52, r: 20, t: 6, b: 48, pad: 2 },
      xaxis: {
        ...backendXaxis,
        gridcolor: "#f3f4f6",
        zerolinecolor: "#e5e7eb",
        tickfont: { size: 10, family: "IBM Plex Sans, sans-serif", color: "#9ca3af" },
        title: backendXaxis.title
          ? {
              ...(typeof backendXaxis.title === "object" ? backendXaxis.title : { text: backendXaxis.title }),
              font: { size: 11, family: "IBM Plex Sans, sans-serif", color: "#6b7280" },
            }
          : undefined,
      },
      yaxis: {
        ...backendYaxis,
        gridcolor: "#f3f4f6",
        zerolinecolor: "#e5e7eb",
        tickfont: { size: 10, family: "IBM Plex Sans, sans-serif", color: "#9ca3af" },
        title: backendYaxis.title
          ? {
              ...(typeof backendYaxis.title === "object" ? backendYaxis.title : { text: backendYaxis.title }),
              font: { size: 11, family: "IBM Plex Sans, sans-serif", color: "#6b7280" },
            }
          : undefined,
      },
    };

    // Handle coloraxis
    if (parsed.layout?.coloraxis) {
      const ca = parsed.layout.coloraxis as Record<string, unknown>;
      layout.coloraxis = {
        ...ca,
        colorbar: {
          ...((ca.colorbar as Record<string, unknown>) ?? {}),
          thickness: 14,
          len: 0.9,
          tickfont: { size: 10, family: "IBM Plex Sans, sans-serif", color: "#9ca3af" },
          outlinewidth: 0,
          xpad: 6,
        },
      };
    }

    // Style per-trace colorbars
    const data = (parsed.data as Record<string, unknown>[]).map(trace => {
      if (trace.type === "heatmap" && trace.colorbar) {
        return {
          ...trace,
          colorbar: {
            ...(trace.colorbar as Record<string, unknown>),
            thickness: 14,
            len: 0.9,
            tickfont: { size: 10, family: "IBM Plex Sans, sans-serif", color: "#9ca3af" },
            outlinewidth: 0,
            xpad: 6,
          },
        };
      }
      return trace;
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Plotly.react(ref.current, data as any, layout as any, {
      displayModeBar: false,
      responsive: true,
    } as any);

    const el = ref.current;
    const container = containerRef.current;
    let resizeObs: ResizeObserver | null = null;
    if (container) {
      resizeObs = new ResizeObserver(() => {
        if (el) Plotly.Plots.resize(el);
      });
      resizeObs.observe(container);
    }

    return () => {
      if (resizeObs) resizeObs.disconnect();
      if (el) Plotly.purge(el);
    };
  }, [figureJson, maxHeight]);

  return (
    <Card>
      {title && <h3 className="text-[14px] font-semibold text-gray-900 mb-0.5 flex items-center gap-2">{title}</h3>}
      {subtitle && <p className="text-[11px] text-gray-400 mb-3 leading-snug">{subtitle}</p>}
      <div ref={containerRef} className="w-full overflow-hidden">
        <div ref={ref} className="w-full" />
      </div>
    </Card>
  );
}
