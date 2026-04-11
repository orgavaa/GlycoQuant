import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { JobResult } from "@/lib/api";

interface FeatureTableProps {
  result: JobResult;
}

interface Row {
  cell_id: number;
  [key: string]: number;
}

export function FeatureTable({ result }: FeatureTableProps) {
  const [filter, setFilter] = useState("");

  const rows: Row[] = useMemo(() => {
    try {
      return JSON.parse(result.features_df_json) as Row[];
    } catch {
      return [];
    }
  }, [result.features_df_json]);

  const columns = useMemo(() => {
    if (rows.length === 0) return [];
    // Take the first row's keys, drop deep_* columns for readability
    return Object.keys(rows[0]).filter((k) => !k.startsWith("deep_"));
  }, [rows]);

  const filtered = useMemo(() => {
    if (!filter) return rows;
    const q = filter.toLowerCase();
    return rows.filter((r) =>
      JSON.stringify(r).toLowerCase().includes(q),
    );
  }, [rows, filter]);

  const downloadCSV = () => {
    if (rows.length === 0) return;
    const allCols = Object.keys(rows[0]);
    const header = allCols.join(",");
    const body = rows
      .map((r) => allCols.map((c) => r[c]).join(","))
      .join("\n");
    const csv = `${header}\n${body}`;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "glycoquant_features.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Input
          placeholder="Filter rows..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="max-w-xs"
        />
        <Button variant="outline" size="sm" onClick={downloadCSV}>
          Download CSV
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length} / {rows.length} rows
          {result.has_deep_features && " · + 768 deep features (hidden)"}
        </span>
      </div>

      <div className="max-h-[480px] overflow-auto rounded-xl border">
        <Table>
          <TableHeader className="sticky top-0 bg-muted">
            <TableRow>
              {columns.map((col) => (
                <TableHead
                  key={col}
                  className="whitespace-nowrap"
                >
                  {col}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((row, i) => (
              <TableRow key={i}>
                {columns.map((col) => (
                  <TableCell key={col} className="whitespace-nowrap">
                    {typeof row[col] === "number"
                      ? row[col].toFixed(3)
                      : String(row[col])}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
