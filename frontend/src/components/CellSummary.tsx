/**
 * CellSummary — plain-English one-line cell state description.
 * Compares cell features to population medians.
 */

interface CellSummaryProps {
  cell: Record<string, number | undefined>;
  populationMedians: Record<string, number>;
}

export function CellSummary({ cell, populationMedians }: CellSummaryProps) {
  const summary = summarizeCell(cell, populationMedians);
  return (
    <p className="text-[11px] italic text-[#999] leading-relaxed">
      {summary}
    </p>
  );
}

function summarizeCell(
  cell: Record<string, number | undefined>,
  medians: Record<string, number>,
): string {
  const parts: string[] = [];

  const glyco = cell.glycocalyx_pericellular_ratio;
  const glycoMed = medians.glycocalyx_pericellular_ratio;
  if (typeof glyco === "number" && glycoMed) {
    if (glyco > glycoMed * 1.3) parts.push("thick glycocalyx");
    else if (glyco < glycoMed * 0.7) parts.push("thin glycocalyx");
  }

  const yap = cell.yap_nc_ratio_size_corrected;
  if (typeof yap === "number") {
    if (yap > 1.3) parts.push("nuclear YAP");
    else if (yap < 0.8) parts.push("cytoplasmic YAP");
  }

  const actin = cell.actin_stress_fiber_coherence;
  if (typeof actin === "number" && actin > 0.6) {
    parts.push("aligned stress fibers");
  }

  const fa = cell.fa_mature_fraction;
  if (typeof fa === "number") {
    if (fa > 0.5) parts.push("mature adhesions");
    else parts.push("nascent adhesions");
  }

  return parts.length > 0 ? parts.join(", ") : "unremarkable phenotype";
}
