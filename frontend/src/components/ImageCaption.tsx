interface ImageCaptionProps {
  datasetLabel: string | null;
  cellCount: number | null;
  pixelSizeUm?: number;
}

export function ImageCaption({ datasetLabel, cellCount, pixelSizeUm }: ImageCaptionProps) {
  const parts: string[] = [];
  if (datasetLabel) parts.push(datasetLabel);
  if (cellCount != null) parts.push(`${cellCount} cells`);
  if (pixelSizeUm) parts.push(`${pixelSizeUm} \u00b5m/px`);

  if (parts.length === 0) return null;

  return (
    <div className="px-4 py-3 text-[11px] text-gray-400">
      {parts.join(" \u00b7 ")}
    </div>
  );
}
