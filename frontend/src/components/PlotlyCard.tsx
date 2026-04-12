import Plotly from "plotly.js-dist-min";
import { useEffect, useRef } from "react";
import { Card } from "./Card";

interface PlotlyCardProps {
  title?: string;
  subtitle?: string;
  figureJson: string;
  maxHeight?: number;
}

export function PlotlyCard({ title, subtitle, figureJson, maxHeight = 240 }: PlotlyCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    let parsed: { data: unknown[]; layout: Record<string, unknown> };
    try { parsed = JSON.parse(figureJson); } catch { return; }

    // Deep-merge axis configs so we don't clobber backend-provided ranges/labels
    const backendXaxis = (parsed.layout?.xaxis ?? {}) as Record<string, unknown>;
    const backendYaxis = (parsed.layout?.yaxis ?? {}) as Record<string, unknown>;

    const layout: Record<string, unknown> = {
      ...parsed.layout,
      height: maxHeight,
      autosize: true,
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "#ffffff",
      font: { family: "Inter, sans-serif", color: "#6b7280", size: 10 },
      // Tight margins for narrow rail — maximize chart area
      margin: { l: 40, r: 8, t: 4, b: 32, pad: 0 },
      xaxis: {
        ...backendXaxis,
        gridcolor: "#f3f4f6",
        zerolinecolor: "#e5e7eb",
        tickfont: { size: 9, family: "Inter, sans-serif", color: "#9ca3af" },
        title: backendXaxis.title ? { ...(typeof backendXaxis.title === "object" ? backendXaxis.title : { text: backendXaxis.title }), font: { size: 10, family: "Inter, sans-serif", color: "#9ca3af" } } : undefined,
      },
      yaxis: {
        ...backendYaxis,
        gridcolor: "#f3f4f6",
        zerolinecolor: "#e5e7eb",
        tickfont: { size: 9, family: "Inter, sans-serif", color: "#9ca3af" },
        title: backendYaxis.title ? { ...(typeof backendYaxis.title === "object" ? backendYaxis.title : { text: backendYaxis.title }), font: { size: 10, family: "Inter, sans-serif", color: "#9ca3af" } } : undefined,
      },
      // Colorbar styling for heatmaps
      coloraxis: parsed.layout?.coloraxis ? {
        ...(parsed.layout.coloraxis as Record<string, unknown>),
        colorbar: {
          ...((parsed.layout.coloraxis as Record<string, unknown>)?.colorbar as Record<string, unknown> ?? {}),
          thickness: 10,
          len: 0.8,
          tickfont: { size: 8, family: "Inter, sans-serif", color: "#9ca3af" },
          outlinewidth: 0,
        },
      } : undefined,
    };

    // Also style any per-trace colorbars (heatmaps often use trace-level colorbar)
    const data = (parsed.data as Record<string, unknown>[]).map(trace => {
      if (trace.type === "heatmap" && trace.colorbar) {
        return {
          ...trace,
          colorbar: {
            ...(trace.colorbar as Record<string, unknown>),
            thickness: 10,
            len: 0.8,
            tickfont: { size: 8, family: "Inter, sans-serif", color: "#9ca3af" },
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
      staticPlot: false,
    } as any);

    // Resize observer to handle container size changes
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
      {title && <h3 className="text-[13px] font-semibold text-gray-900 mb-0.5">{title}</h3>}
      {subtitle && <p className="text-[11px] text-gray-400 mb-2 leading-snug">{subtitle}</p>}
      <div ref={containerRef} className="w-full overflow-hidden">
        <div ref={ref} className="w-full" />
      </div>
    </Card>
  );
}
