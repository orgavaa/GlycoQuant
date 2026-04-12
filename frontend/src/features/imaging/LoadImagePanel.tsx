/**
 * LoadImagePanel — bundled dataset selector + file upload.
 *
 * Groups the 42 demo datasets by source (BBBC022 / RxRx1) using
 * native <optgroup> elements so the dropdown is scannable. Each
 * entry shows the well coordinate + condition tag.
 */
import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef } from "react";
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

  // Group datasets by source prefix for <optgroup> labels
  const groups = useMemo(() => {
    const bbbc = conditions.filter((c) => c.name.startsWith("BBBC"));
    const rxrx = conditions.filter((c) => c.name.startsWith("RxRx"));
    const other = conditions.filter(
      (c) => !c.name.startsWith("BBBC") && !c.name.startsWith("RxRx"),
    );
    const result: Array<{ label: string; items: DemoCondition[] }> = [];
    if (bbbc.length > 0)
      result.push({
        label: `BBBC022 — Cell Painting (${bbbc.length} fields, WGA+phalloidin AGP)`,
        items: bbbc,
      });
    if (rxrx.length > 0)
      result.push({
        label: `RxRx1 — Recursion (${rxrx.length} fields, WGA + phalloidin separate)`,
        items: rxrx,
      });
    if (other.length > 0)
      result.push({ label: `Other (${other.length})`, items: other });
    return result;
  }, [conditions]);

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
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
            Reference datasets
          </label>
          {conditions.length > 0 && (
            <span className="text-[10px] text-on-surface-variant tabular-nums">
              {conditions.length} fields available
            </span>
          )}
        </div>
        <p className="text-xs leading-snug text-on-surface-variant">
          U-2 OS Cell Painting fields from two public collections. BBBC022
          bundles WGA + phalloidin in one AGP channel; RxRx1 keeps them
          separate, giving three real biological channels for the pipeline.
        </p>
        <select
          onChange={handleDemoSelect}
          disabled={demoQuery.isLoading || disabled}
          defaultValue=""
          className="w-full bg-surface-container-lowest ghost-border px-3 py-2.5 text-sm text-on-surface cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="" disabled>
            {demoQuery.isLoading
              ? "Loading datasets…"
              : `Select from ${conditions.length} fields`}
          </option>
          {groups.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.items.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.display_name || c.name}
                </option>
              ))}
            </optgroup>
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
