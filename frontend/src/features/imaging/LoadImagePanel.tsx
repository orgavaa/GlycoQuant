import { useQuery } from "@tanstack/react-query";
import { FileImage, FolderOpen, Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchDemoList } from "@/lib/api";

interface LoadImagePanelProps {
  onLoadDemo: (condition: "control" | "siSDC1" | "heparinase") => void;
  onLoadUpload: (file: File) => void;
  disabled: boolean;
}

export function LoadImagePanel({
  onLoadDemo,
  onLoadUpload,
  disabled,
}: LoadImagePanelProps) {
  const [selectedCondition, setSelectedCondition] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const demoQuery = useQuery({
    queryKey: ["demo-list"],
    queryFn: fetchDemoList,
  });

  const handleDemoLoad = () => {
    if (selectedCondition) {
      onLoadDemo(selectedCondition as "control" | "siSDC1" | "heparinase");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onLoadUpload(file);
  };

  return (
    <div className="space-y-4">
      {/* Demo image selector */}
      <div className="space-y-2">
        <label className="section-label">Demo dataset</label>
        <Select value={selectedCondition} onValueChange={setSelectedCondition}>
          <SelectTrigger disabled={demoQuery.isLoading}>
            <SelectValue placeholder="Select a condition..." />
          </SelectTrigger>
          <SelectContent>
            {demoQuery.data?.conditions.map((c) => (
              <SelectItem key={c.name} value={c.name}>
                <div className="flex flex-col">
                  <span className="font-medium">{c.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {c.description}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          onClick={handleDemoLoad}
          disabled={!selectedCondition || disabled}
          className="w-full"
          size="sm"
          variant="brand"
        >
          {demoQuery.isLoading ? (
            <Loader2 className="animate-spin" />
          ) : (
            <FolderOpen />
          )}
          Load demo
        </Button>
      </div>

      {/* Divider */}
      <div className="flex items-center gap-2">
        <div className="h-px flex-1 bg-border" />
        <span className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
          or
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>

      {/* File upload */}
      <div className="space-y-2">
        <label className="section-label">Upload image</label>
        <input
          ref={fileInputRef}
          type="file"
          accept=".tif,.tiff,.png"
          onChange={handleFileChange}
          className="hidden"
        />
        <Button
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className="w-full"
          size="sm"
          variant="outline"
        >
          <FileImage />
          Choose TIFF / PNG
        </Button>
        <p className="text-[0.7rem] text-muted-foreground">
          5-channel expected: DAPI · WGA · YAP · paxillin · phalloidin
        </p>
      </div>
    </div>
  );
}
