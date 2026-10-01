/**
 * AYVANA — The Abaya Marketplace.
 * Design tokens ported from the web brand system (Brand Guidelines v2.0):
 * ink + sand palette, "cut, don't round" radii, Jost display / Inter UI.
 * One tint (sand-700) drives interactive elements per the iOS HIG.
 */

import '@/global.css';

// ---------------------------------------------------------------------------
// Palette — raw brand values (mirror of the web tailwind tokens)
// ---------------------------------------------------------------------------
const palette = {
  ink: '#121212',
  inkElevated: '#2a2420',
  ink700: '#3d3a37',
  ivory: '#f7f5f3',
  white: '#ffffff',
  surface200: '#eceae7',
  sand: '#e6e2dd', // hairline
  sand100: '#f2ece5',
  sand300: '#cbb49e',
  sand500: '#b3967d', // graphic fills
  sand700: '#7e6248', // legible / interactive
  lineStrong: '#8f8880',
  mist: '#6b6560',
  sale: '#a3312a',
  success: '#3f6146',
  warn: '#7a5c15',
  info: '#3d5a6b',
} as const;

// ---------------------------------------------------------------------------
// Semantic colors — light (default) + dark (onyx). Keys prefixed for the
// AYVANA system; the last two keys keep the expo-router template happy.
// ---------------------------------------------------------------------------
export const Colors = {
  light: {
    background: palette.ivory,
    surface: palette.white,
    surfaceAlt: palette.surface200,
    surfaceInk: palette.ink, // dark CTAs / ink cards
    text: palette.ink,
    textSecondary: palette.mist,
    textOnInk: palette.ivory,
    hairline: palette.sand,
    hairlineStrong: palette.lineStrong,
    tint: palette.sand700, // one interactive tint
    fill: palette.sand500, // graphic fills only
    fillSoft: palette.sand100,
    sale: palette.sale,
    success: palette.success,
    warn: palette.warn,
    // template compatibility
    backgroundElement: palette.surface200,
    backgroundSelected: palette.sand,
  },
  dark: {
    background: palette.ink,
    surface: palette.inkElevated,
    surfaceAlt: '#332e29',
    surfaceInk: '#000000',
    text: palette.ivory,
    textSecondary: '#b3ada6',
    textOnInk: palette.ivory,
    hairline: 'rgba(247,245,243,0.12)',
    hairlineStrong: 'rgba(247,245,243,0.28)',
    tint: palette.sand500,
    fill: palette.sand500,
    fillSoft: palette.ink700,
    sale: '#d06a62',
    success: '#7ba488',
    warn: '#c2a24e',
    backgroundElement: palette.inkElevated,
    backgroundSelected: '#332e29',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;
export type ThemePalette = (typeof Colors)['light'];

// ---------------------------------------------------------------------------
// Type — Jost display (geometric, tracked) + Inter UI/body. Family names are
// the exact @expo-google-fonts identifiers loaded in the root layout.
// ---------------------------------------------------------------------------
export const Fonts = {
  displayBold: 'Jost_700Bold',
  displaySemi: 'Jost_600SemiBold',
  displayMed: 'Jost_500Medium',
  body: 'Inter_400Regular',
  bodyMed: 'Inter_500Medium',
  bodySemi: 'Inter_600SemiBold',
} as const;

/** Text style presets (fontFamily + size + line height + tracking). */
export const Type = {
  displayXl: { fontFamily: Fonts.displayBold, fontSize: 34, lineHeight: 38, letterSpacing: -0.5 },
  displayLg: { fontFamily: Fonts.displayBold, fontSize: 28, lineHeight: 32, letterSpacing: -0.4 },
  displayMd: { fontFamily: Fonts.displaySemi, fontSize: 22, lineHeight: 27, letterSpacing: -0.2 },
  displaySm: { fontFamily: Fonts.displaySemi, fontSize: 18, lineHeight: 23 },
  bodyLg: { fontFamily: Fonts.body, fontSize: 17, lineHeight: 26 },
  bodyMd: { fontFamily: Fonts.body, fontSize: 15, lineHeight: 22 },
  bodySm: { fontFamily: Fonts.body, fontSize: 13, lineHeight: 18 },
  bodyMedMd: { fontFamily: Fonts.bodyMed, fontSize: 15, lineHeight: 22 },
  bodySemiMd: { fontFamily: Fonts.bodySemi, fontSize: 15, lineHeight: 20 },
  price: { fontFamily: Fonts.displaySemi, fontSize: 18, lineHeight: 22 },
  /** All-caps tracked micro-label. */
  label: { fontFamily: Fonts.bodySemi, fontSize: 11, lineHeight: 14, letterSpacing: 1.4 },
  wordmark: { fontFamily: Fonts.displaySemi, fontSize: 20, lineHeight: 24, letterSpacing: 3 },
} as const;

// ---------------------------------------------------------------------------
// Spacing, radii (cut, don't round), layout
// ---------------------------------------------------------------------------
export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

/** "Cut, don't round": sharp by default, 2px controls, 4px cards/buttons. */
export const Radii = {
  none: 0,
  control: 2,
  card: 4,
  pill: 999, // avatars, dots, wishlist disc only
} as const;

export const BottomTabInset = 88;
export const MaxContentWidth = 900;
