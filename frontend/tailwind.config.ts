import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
      },
      colors: {
        "ch-dapi": "#2166ac",
        "ch-glyco": "#1b7837",
        "ch-yap": "#762a83",
        "ch-paxillin": "#b35806",
        "ch-actin": "#4d4d4d",
      },
    },
  },
  plugins: [],
};

export default config;
