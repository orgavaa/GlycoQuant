import { useMemo, useState } from "react";
import { Search, X, ArrowUpDown } from "lucide-react";
import { Badge } from "./Badge";

interface Feature {
  name: string;
  value: number;
  zScore: number;
}

interface FeatureGroupProps {
  name: string;
  features: Feature[];
  defaultOpen?: boolean;
  searchable?: boolean;
}

type SortMode = "deviation" | "alphabetical";

// Pretty-print feature names: strip group prefix, replace underscores, keep radial profile indices padded.
function prettifyName(raw: string): string {
  return raw
    .replace(/^glycocalyx_/, "")
    .replace(/^yap_/, "")
    .replace(/^fa_/, "")
    .replace(/^actin_/, "")
    .replace(/_/g, " ");
}

export function FeatureGroup({ name, features, defaultOpen = false, searchable = true }: FeatureGroupProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("deviation");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = features;
    if (q) list = list.filter(f => f.name.toLowerCase().includes(q));
    if (sort === "deviation") {
      list = [...list].sort((a, b) => {
        const za = Number.isFinite(a.zScore) ? Math.abs(a.zScore) : -Infinity;
        const zb = Number.isFinite(b.zScore) ? Math.abs(b.zScore) : -Infinity;
        return zb - za;
      });
    } else {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    }
    return list;
  }, [features, query, sort]);

  const totalHidden = features.length - filtered.length;

  return (
    <div className="mb-2.5">
      <div onClick={() => setOpen(v => !v)} className="flex items-center justify-between cursor-pointer py-2">
        <span className="text-[11px] font-semibold text-gray-400 tracking-[1.5px] uppercase">
          {name} ({features.length})
        </span>
        <span className="text-[12px] text-gray-300">{open ? "\u25BE" : "\u25B8"}</span>
      </div>

      {open && (
        <>
          {searchable && features.length > 6 && (
            <div className="flex items-center gap-1.5 mb-1.5">
              <div className="relative flex-1">
                <Search size={11} strokeWidth={1.5} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
                <input
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder={`Search ${features.length} features`}
                  className="w-full pl-7 pr-6 py-1 text-[11px] bg-gray-50 border border-gray-200 rounded focus:outline-none focus:border-blue-400 focus:bg-white transition-colors"
                  aria-label={`Search ${name} features`}
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
                    aria-label="Clear search"
                  >
                    <X size={11} strokeWidth={1.5} />
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSort(s => s === "deviation" ? "alphabetical" : "deviation")}
                title={`Sort: ${sort === "deviation" ? "by |z| (largest deviations first)" : "alphabetical"} — click to toggle`}
                className="flex items-center gap-1 px-1.5 py-1 text-[9px] font-medium text-gray-500 border border-gray-200 rounded hover:bg-gray-50"
              >
                <ArrowUpDown size={10} strokeWidth={1.5} />
                {sort === "deviation" ? "|z|" : "a–z"}
              </button>
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="py-2 text-[10px] text-gray-400 italic text-center">
              No features match "{query}".
            </div>
          ) : (
            filtered.map(f => {
              const pretty = prettifyName(f.name);
              const highlightIdx = query ? pretty.toLowerCase().indexOf(query.trim().toLowerCase()) : -1;
              return (
                <div key={f.name} className="flex items-center py-1 text-[11px] border-b border-gray-100">
                  <span
                    className="text-gray-600 flex-1 overflow-hidden text-ellipsis whitespace-nowrap mr-2"
                    title={f.name}
                  >
                    {highlightIdx >= 0 ? (
                      <>
                        {pretty.slice(0, highlightIdx)}
                        <mark className="bg-yellow-100 text-gray-900 rounded px-0.5">
                          {pretty.slice(highlightIdx, highlightIdx + query.trim().length)}
                        </mark>
                        {pretty.slice(highlightIdx + query.trim().length)}
                      </>
                    ) : pretty}
                  </span>
                  <span className="text-gray-800 font-medium w-[60px] text-right flex-shrink-0" style={{ fontFeatureSettings: "'tnum'" }}>
                    {Number.isFinite(f.value) ? f.value.toFixed(3) : "\u2014"}
                  </span>
                  <span className="w-[54px] text-right flex-shrink-0 ml-1.5">
                    <Badge z={f.zScore} />
                  </span>
                </div>
              );
            })
          )}

          {searchable && query && totalHidden > 0 && filtered.length > 0 && (
            <div className="pt-1.5 text-[9px] text-gray-400 text-right">
              {totalHidden} more hidden by filter
            </div>
          )}
        </>
      )}
    </div>
  );
}
