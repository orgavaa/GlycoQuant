import { Box } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface AppHeaderProps {
  version: string;
}

export function AppHeader({ version }: AppHeaderProps) {
  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-6 py-5">
        <Box className="h-6 w-6 shrink-0 text-foreground" strokeWidth={1.75} />
        <h1 className="text-[1.35rem] font-semibold tracking-tight text-foreground">
          GlycoQuant
        </h1>

        <div className="ml-auto shrink-0">
          <Badge variant="outline" className="font-normal tracking-tight">
            {version}
          </Badge>
        </div>
      </div>
    </header>
  );
}
