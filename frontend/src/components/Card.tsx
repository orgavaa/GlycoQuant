interface CardProps {
  children: React.ReactNode;
  className?: string;
  noPadding?: boolean;
  compact?: boolean;
}

export function Card({ children, className, noPadding, compact }: CardProps) {
  const padding = noPadding ? "" : compact ? "p-3" : "p-4";
  return (
    <div className={`bg-white border border-gray-200 rounded-lg shadow-sm ${padding} ${className ?? ""}`}>
      {children}
    </div>
  );
}
