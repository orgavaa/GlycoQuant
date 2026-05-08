interface CardProps {
  children: React.ReactNode;
  className?: string;
  noPadding?: boolean;
  compact?: boolean;
}

export function Card({ children, className, noPadding, compact }: CardProps) {
  const padding = noPadding ? "" : compact ? "p-3" : "p-4";
  return (
    <div className={`rounded-lg border border-gray-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${padding} ${className ?? ""}`}>
      {children}
    </div>
  );
}
