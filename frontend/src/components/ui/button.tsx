import { forwardRef, type ButtonHTMLAttributes } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "default", size = "default", ...props }, ref) => {
    const base = "inline-flex items-center justify-center gap-2 font-medium transition-colors disabled:opacity-50";
    const variants: Record<string, string> = {
      default: "bg-[#343dff] text-white hover:opacity-90",
      outline: "border border-[#333] text-[#888] hover:text-[#ccc] hover:border-[#555]",
      ghost: "text-[#888] hover:text-[#ccc]",
    };
    const sizes: Record<string, string> = {
      default: "px-4 py-2 text-[11px]",
      sm: "px-3 py-1.5 text-[10px]",
      lg: "px-5 py-2.5 text-[11px]",
    };
    return (
      <button
        ref={ref}
        className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
