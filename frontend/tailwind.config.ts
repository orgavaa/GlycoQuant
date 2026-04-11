import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

/**
 * GlycoQuant techbio light theme.
 * Palette mirrored from glycoquant/theme.py (Palette dataclass).
 * Keep the two in sync by hand.
 */
const config: Config = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "1.5rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        // -----------------------------------------------------------------
        // shadcn/ui legacy tokens — kept so the existing Card/Button/Tabs
        // primitives still resolve. The HSL CSS variables behind them are
        // overridden in index.css to match the Stitch palette so both
        // vocabularies render the same colour.
        // -----------------------------------------------------------------
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        brand: {
          DEFAULT: "hsl(var(--brand))",
          foreground: "hsl(var(--brand-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",

        // -----------------------------------------------------------------
        // Stitch / Material 3 surface tokens — direct hex values per the
        // "Quantitative Aesthetic" design system spec. Reference:
        // UI_SCIENCE_GUIDELINES.md and stitch/glycoquant_lab_system/DESIGN.md
        // -----------------------------------------------------------------
        "primary-stitch": "#343dff",
        "primary-dim": "#1a21ff",
        "primary-container": "#e0e0ff",
        "primary-fixed": "#e0e0ff",
        "primary-fixed-dim": "#cfd1ff",
        "on-primary": "#f9f6ff",
        "on-primary-fixed": "#0001d9",
        "on-primary-container": "#181eff",
        "on-primary-fixed-variant": "#2e37ff",
        "inverse-primary": "#7c84ff",
        // Surface hierarchy — the layering principle
        surface: "#f8fafb",
        "surface-bright": "#f8fafb",
        "surface-dim": "#cfdce0",
        "surface-container-lowest": "#ffffff",
        "surface-container-low": "#f0f4f6",
        "surface-container": "#e8eff1",
        "surface-container-high": "#e1eaec",
        "surface-container-highest": "#d9e4e8",
        "surface-variant": "#d9e4e8",
        "surface-tint": "#343dff",
        "inverse-surface": "#0b0f10",
        "inverse-on-surface": "#9a9d9e",
        // Foreground / outline
        "on-surface": "#2a3437",
        "on-surface-variant": "#566164",
        "on-background": "#2a3437",
        outline: "#727d80",
        "outline-variant": "#a9b4b7",
        // Secondary / tertiary (used sparingly per the spec)
        "secondary-stitch": "#4d626c",
        "secondary-dim": "#415660",
        "secondary-container": "#cfe6f2",
        "secondary-fixed": "#cfe6f2",
        "secondary-fixed-dim": "#c1d8e4",
        "on-secondary": "#f2faff",
        "on-secondary-fixed": "#2d424c",
        "on-secondary-fixed-variant": "#495f69",
        "on-secondary-container": "#40555f",
        "tertiary-stitch": "#b22e00",
        "tertiary-dim": "#9d2700",
        "tertiary-container": "#fc4400",
        "tertiary-fixed": "#fc4400",
        "tertiary-fixed-dim": "#e63d00",
        "on-tertiary": "#fff7f5",
        "on-tertiary-fixed": "#000000",
        "on-tertiary-container": "#000000",
        "on-tertiary-fixed-variant": "#280400",
        // Error
        "error-stitch": "#9f403d",
        "error-dim": "#4e0309",
        "error-container": "#fe8983",
        "on-error": "#fff7f6",
        "on-error-container": "#752121",
        // Strict functional channel colours — only on data, never on UI
        "channel-dapi": "#0000FF",
        "channel-wga": "#00FF00",
        "channel-yap": "#FF00FF",
        "channel-actin": "#FFBF00",
        "channel-fa": "#FF4500",
      },
      borderRadius: {
        // Stitch spec: default radius = 2px (sm). The shadcn ladder is
        // overridden so existing components inherit the new tighter look.
        DEFAULT: "0.125rem",
        sm: "0.125rem",
        md: "0.25rem",
        lg: "0.25rem",
        xl: "0.5rem",
        full: "9999px",
      },
      fontFamily: {
        // Stitch spec: Space Grotesk for headlines (display), Inter for
        // body and labels. Both already loaded in index.html. The shadcn
        // sans default still resolves to Inter so non-headline components
        // don't change.
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        headline: [
          "Space Grotesk",
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "sans-serif",
        ],
        body: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        label: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "pulse-brand": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "pulse-brand": "pulse-brand 2s ease-in-out infinite",
      },
    },
  },
  plugins: [animate],
};

export default config;
