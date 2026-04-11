import { Badge } from "@/components/ui/badge";

interface AppHeaderProps {
  version: string;
  institution: string;
}

export function AppHeader({ version, institution }: AppHeaderProps) {
  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-[1400px] items-center gap-4 px-6 py-3">
        {/* Brand mark — gradient square with GQ monogram */}
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg font-mono text-[15px] font-bold text-white shadow-sm"
          style={{
            background:
              "linear-gradient(135deg, hsl(var(--brand)) 0%, hsl(var(--primary)) 100%)",
          }}
        >
          GQ
        </div>

        {/* Title block */}
        <div className="flex min-w-0 flex-col">
          <div className="truncate text-[1.05rem] font-bold tracking-tight text-foreground">
            GlycoQuant
            <span className="ml-2 font-normal text-muted-foreground">
              — Glycocalyx Mechanotransduction Analysis
            </span>
          </div>
          <div className="text-[0.78rem] text-muted-foreground">
            Per-cell phenotyping from multi-channel fluorescence microscopy
          </div>
        </div>

        {/* Version + institution pills */}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Badge variant="outline" className="font-normal">
            {institution}
          </Badge>
          <Badge variant="brand" className="font-mono">
            {version}
          </Badge>
        </div>
      </div>
    </header>
  );
}
