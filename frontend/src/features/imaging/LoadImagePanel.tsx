import { useQuery } from "@tanstack/react-query";
import { ImageIcon, Loader2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchDemoList, type DemoCondition } from "@/lib/api";

interface LoadImagePanelProps {
  onLoadDemo: (condition: DemoCondition) => void;
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
    if (!selectedCondition) return;
    const found = demoQuery.data?.conditions.find(
      (c) => c.name === selectedCondition,
    );
    if (found) onLoadDemo(found);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onLoadUpload(file);
  };

  return (
    <div className="space-y-5">
      {/* Bundled datasets from the Human Protein Atlas */}
      <div className="space-y-2">
        <label className="section-label">Reference dataset</label>
        <p className="text-[0.7rem] leading-snug text-muted-foreground">
          Real immunofluorescence microscopy from the Human Protein Atlas
          (CC BY-SA 3.0). Three canonical proteins from our glycocalyx
          and mechanotransduction panels.
        </p>
        <Select value={selectedCondition} onValueChange={setSelectedCondition}>
          <SelectTrigger disabled={demoQuery.isLoading}>
            <SelectValue placeholder="Choose a dataset" />
          </SelectTrigger>
          <SelectContent>
            {demoQuery.data?.conditions.map((c) => (
              <SelectItem key={c.name} value={c.name}>
                <div className="flex flex-col">
                  <span className="font-medium">{c.display_name || c.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {c.source}
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
        >
          {demoQuery.isLoading ? (
            <Loader2 className="animate-spin" />
          ) : (
            <ImageIcon />
          )}
          Load dataset
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

      {/* User upload */}
      <div className="space-y-2">
        <label className="section-label">Upload your own image</label>
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
          <Upload />
          Select TIFF or PNG
        </Button>
        <p className="text-[0.72rem] leading-snug text-muted-foreground">
          Five channels required, in the order DAPI, WGA-lectin, YAP,
          paxillin, phalloidin.
        </p>
      </div>
    </div>
  );
}
