import { cn } from "@/lib/utils";

type StatusKind = "ready" | "running" | "warn" | "idle" | "error";

interface StatusBadgeProps {
  kind: StatusKind;
  label: string;
  className?: string;
}

const VARIANTS: Record<
  StatusKind,
  { bg: string; text: string; border: string; pulse: boolean }
> = {
  ready: {
    bg: "bg-[hsl(var(--brand))]/10",
    text: "text-[hsl(var(--brand))]",
    border: "border-[hsl(var(--brand))]/30",
    pulse: false,
  },
  running: {
    bg: "bg-primary/10",
    text: "text-primary",
    border: "border-primary/30",
    pulse: true,
  },
  warn: {
    bg: "bg-[hsl(var(--warning))]/10",
    text: "text-[hsl(var(--warning))]",
    border: "border-[hsl(var(--warning))]/30",
    pulse: false,
  },
  error: {
    bg: "bg-destructive/10",
    text: "text-destructive",
    border: "border-destructive/30",
    pulse: false,
  },
  idle: {
    bg: "bg-muted",
    text: "text-muted-foreground",
    border: "border-border",
    pulse: false,
  },
};

export function StatusBadge({ kind, label, className }: StatusBadgeProps) {
  const v = VARIANTS[kind];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[0.7rem] font-medium uppercase tracking-wider",
        v.bg,
        v.text,
        v.border,
        className,
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full bg-current",
          v.pulse && "animate-pulse-brand",
        )}
      />
      {label}
    </span>
  );
}
