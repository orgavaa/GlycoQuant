/**
 * LoadImagePanel — bundled dataset selector + file upload.
 *
 * Restyled for the Stitch "Quantitative Aesthetic": ghost-border
 * controls, 10px uppercase labels, primary-filled load button,
 * outline upload button. The Select dropdown uses a native <select>
 * instead of Radix to avoid shadcn styling conflicts with the Stitch
 * palette.
 */
import { useQuery } from "@tanstack/react-query";
import { useRef } from "react";
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const demoQuery = useQuery({
    queryKey: ["demo-list"],
    queryFn: fetchDemoList,
  });

  const conditions = demoQuery.data?.conditions ?? [];

  const handleDemoSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const name = e.target.value;
    if (!name) return;
    const found = conditions.find((c) => c.name === name);
    if (found) onLoadDemo(found);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onLoadUpload(file);
  };

  return (
    <div className="space-y-6">
      {/* Bundled dataset selector */}
      <div className="space-y-3">
        <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
          Reference dataset
        </label>
        <p className="text-xs leading-snug text-on-surface-variant">
          Cell Painting U-2 OS field from the Broad BBBC022 collection
          (CC0). Real WGA-lectin glycocalyx staining in all five channels.
        </p>
        <select
          onChange={handleDemoSelect}
          disabled={demoQuery.isLoading || disabled}
          defaultValue=""
          className="w-full bg-surface-container-lowest ghost-border px-3 py-2.5 text-sm text-on-surface appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="" disabled>
            {demoQuery.isLoading ? "Loading datasets…" : "Select a dataset"}
          </option>
          {conditions.map((c) => (
            <option key={c.name} value={c.name}>
              {c.display_name || c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-outline-variant/20" />
        <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">
          or
        </span>
        <div className="h-px flex-1 bg-outline-variant/20" />
      </div>

      {/* File upload */}
      <div className="space-y-3">
        <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
          Upload your own image
        </label>
        <input
          ref={fileInputRef}
          type="file"
          accept=".tif,.tiff,.png"
          onChange={handleFileChange}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className="w-full py-2.5 text-[11px] font-bold uppercase tracking-widest text-on-surface ghost-border hover:bg-surface-container transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
        >
          <span className="material-symbols-outlined text-[16px]">
            upload_file
          </span>
          Select TIFF or PNG
        </button>
        <p className="text-[10px] leading-snug text-on-surface-variant">
          Five channels required, in the order DAPI, WGA-lectin, YAP,
          paxillin, phalloidin.
        </p>
      </div>
    </div>
  );
}
