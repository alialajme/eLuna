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
        ink: "#121212",
        ivory: "#f7f5f3",
        gold: {
          DEFAULT: "#7e6248",
          light: "#f2ece5",
        },
        sand: "#e6e2dd",
        lilac: "#7e6248",
        sage: "#3f6146",
        coral: "#a3312a",
        mist: "#6b6560",
        "ink-700": "#3d3a37",
        "sand-100": "#f2ece5",
        "sand-300": "#cbb49e",
        "sand-500": "#b3967d",
        "sand-700": "#7e6248",
        "surface-000": "#ffffff",
        "surface-200": "#eceae7",
        "line-strong": "#8f8880",
        onyx: "#121212",
        "signal-sale": "#a3312a",
        "signal-success": "#3f6146",
        "signal-warn": "#7a5c15",
        "signal-info": "#3d5a6b",
      },
      borderRadius: { none: "0", sm: "2px", DEFAULT: "2px", md: "4px", lg: "4px", xl: "4px", "2xl": "4px" },
      fontFamily: {
        display: ["var(--font-jost)", "system-ui", "sans-serif"],
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        arabic: ["var(--font-ibm-plex-arabic)", "system-ui", "sans-serif"],
        "arabic-display": ["var(--font-reem-kufi)", "var(--font-ibm-plex-arabic)", "sans-serif"],
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
