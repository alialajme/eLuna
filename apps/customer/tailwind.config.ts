import type { Config } from "tailwindcss";
import path from "path";

const config: Config = {
  content: [
    path.join(__dirname, "./app/**/*.{ts,tsx}"),
    path.join(__dirname, "../../packages/ui/src/**/*.{ts,tsx}"),
  ],
  theme: {
    extend: {
      colors: {
        ink: "#1a0a00",
        ivory: "#fff8ee",
        gold: {
          DEFAULT: "#d4a855",
          light: "#f0e8d8",
        },
        sand: "#f0e8d8",
        lilac: "#c4a0f0",
        sage: "#6dbf8e",
        coral: "#e57373",
        mist: "#888888",
      },
      fontFamily: {
        display: ["var(--font-bodoni)", "Georgia", "serif"],
        sans: ["var(--font-hanken)", "system-ui", "sans-serif"],
        arabic: ["var(--font-ibm-plex-arabic)", "system-ui", "sans-serif"],
      },
      fontSize: {
        "display-xl": ["3rem", { lineHeight: "1.1", fontWeight: "700" }],
        "display-lg": ["2.25rem", { lineHeight: "1.2", fontWeight: "700" }],
        "display-md": ["1.75rem", { lineHeight: "1.25", fontWeight: "600" }],
        "display-sm": ["1.375rem", { lineHeight: "1.3", fontWeight: "600" }],
        "body-xl": ["1.125rem", { lineHeight: "1.6" }],
        "body-lg": ["1rem", { lineHeight: "1.6" }],
        "body-md": ["0.875rem", { lineHeight: "1.5" }],
        "body-sm": ["0.75rem", { lineHeight: "1.5" }],
        "body-xs": ["0.625rem", { lineHeight: "1.4" }],
        label: ["0.625rem", { lineHeight: "1.4", letterSpacing: "0.1em", fontWeight: "700" }],
      },
    },
  },
  plugins: [],
};

export default config;
