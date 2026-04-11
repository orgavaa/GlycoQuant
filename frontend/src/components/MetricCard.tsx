import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: string;
  unit?: string;
  delta?: { direction: "up" | "down"; text: string } | null;
  className?: string;
}

export function MetricCard({
  label,
  value,
  unit,
  delta,
  className,
}: MetricCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border bg-card px-4 py-3.5 shadow-sm transition-colors hover:border-slate-300",
        className,
      )}
    >
      <span className="section-label mb-1">{label}</span>
      <div className="flex items-baseline gap-1">
        <span className="font-mono text-[1.55rem] font-semibold leading-none tracking-tight text-foreground">
          {value}
        </span>
        {unit && (
          <span className="text-[0.75rem] font-normal text-muted-foreground">
            {unit}
          </span>
        )}
      </div>
      {delta && (
        <span
          className={cn(
            "mt-1 font-mono text-[0.72rem] font-medium",
            delta.direction === "up"
              ? "text-[hsl(var(--success))]"
              : "text-destructive",
          )}
        >
          {delta.direction === "up" ? "↑" : "↓"} {delta.text}
        </span>
      )}
    </div>
  );
}
