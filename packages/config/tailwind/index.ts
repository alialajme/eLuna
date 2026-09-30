import type { Config } from "tailwindcss";

// AYVANA — The Abaya Marketplace. Design tokens from Brand Guidelines v2.0.
// Three brand values measured off the flat lockup (ink #121212, sand #b3967d,
// white); every other token is derived for contrast. The legacy token names
// (ink/ivory/gold/sand/sage/coral/mist) are kept and remapped so the whole UI
// re-skins to AYVANA, alongside the full named scale for new work.
export const ayvanaPreset: Partial<Config> = {
  theme: {
    extend: {
      colors: {
        // ── Legacy names, remapped to AYVANA ──
        ink: "#121212", // ink-900 — headlines, wordmark, prices
        ivory: "#f7f5f3", // surface-100 — the page
        gold: {
          DEFAULT: "#7e6248", // sand-700 — sand made legible: links, active, primary fills, focus
          light: "#f2ece5", // sand-100 — quietest tint
        },
        sand: "#e6e2dd", // line-hairline — the 1px rule / light neutral
        lilac: "#7e6248", // no purple in the brand — neutralised to sand-700
        sage: "#3f6146", // signal-success
        coral: "#a3312a", // signal-sale — the only red in the system
        mist: "#6b6560", // ink-500 — lightest ink allowed on text

        // ── AYVANA named scale ──
        "ink-900": "#121212",
        "ink-700": "#3d3a37", // body copy
        "ink-500": "#6b6560", // captions, meta
        "sand-100": "#f2ece5",
        "sand-300": "#cbb49e",
        "sand-500": "#b3967d", // brand drape/spark — graphic fills only, never type
        "sand-700": "#7e6248",
        "surface-000": "#ffffff", // cards
        "surface-100": "#f7f5f3", // page
        "surface-200": "#eceae7", // recessed
        "line-hairline": "#e6e2dd",
        "line-strong": "#8f8880",
        onyx: "#121212", // dark theme ground
        "signal-sale": "#a3312a",
        "signal-success": "#3f6146",
        "signal-warn": "#7a5c15",
        "signal-info": "#3d5a6b",
      },
      fontFamily: {
        // Display = Jost (geometric, closest living relative of the wordmark);
        // UI/text = Inter. Arabic display = Reem Kufi; Arabic text = IBM Plex Arabic.
        display: ["var(--font-jost)", "system-ui", "sans-serif"],
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        arabic: ["var(--font-ibm-plex-arabic)", "system-ui", "sans-serif"],
        "arabic-display": ["var(--font-reem-kufi)", "var(--font-ibm-plex-arabic)", "sans-serif"],
      },
      fontSize: {
        "display-xl": ["4rem", { lineHeight: "1.05", letterSpacing: "0.02em", fontWeight: "300" }],
        "display-lg": ["2.75rem", { lineHeight: "1.1", letterSpacing: "0.03em", fontWeight: "300" }],
        "display-md": ["2rem", { lineHeight: "1.2", letterSpacing: "0.03em", fontWeight: "300" }],
        "display-sm": ["1.375rem", { lineHeight: "1.3", letterSpacing: "0.02em", fontWeight: "400" }],
        "body-xl": ["1.0625rem", { lineHeight: "1.65" }],
        "body-lg": ["1rem", { lineHeight: "1.6" }],
        "body-md": ["0.9375rem", { lineHeight: "1.6" }],
        "body-sm": ["0.8125rem", { lineHeight: "1.55" }],
        label: ["0.75rem", { lineHeight: "1.35", letterSpacing: "0.14em", fontWeight: "500" }],
      },
      borderRadius: {
        // Cut, don't round: square is the default; soft corners contradict the mark.
        none: "0",
        sm: "2px", // inputs, selects, chips, badges
        DEFAULT: "2px",
        md: "4px",
        lg: "4px", // buttons, cards, modals, toasts
        xl: "4px",
        "2xl": "4px",
      },
    },
  },
};
