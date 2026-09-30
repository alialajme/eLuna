import * as React from "react";

// AYVANA mark — a walking figure whose drape opens into an "A", with the
// four-point spark in the counter. Flat: one ink, one sand, no gradient
// (Brand Guidelines v2.0). `tone` flips it for light vs onyx grounds.
type Tone = "onLight" | "onDark";

const PALETTE: Record<Tone, { figure: string; drape: string; spark: string; word: string; sub: string }> = {
  onLight: { figure: "#121212", drape: "#b3967d", spark: "#121212", word: "#121212", sub: "#6b6560" },
  onDark: { figure: "#f7f5f3", drape: "#cbb49e", spark: "#cbb49e", word: "#f7f5f3", sub: "#8f8880" },
};

export function AyvanaMark({ size = 32, tone = "onLight" }: { size?: number; tone?: Tone }) {
  const c = PALETTE[tone];
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true" role="img">
      {/* head — hints the figure at the apex of the A */}
      <circle cx="24" cy="6.5" r="2.7" fill={c.figure} />
      {/* body — the cloaked figure, left leg of the A */}
      <path d="M24 10.5 L11.5 41.5" stroke={c.figure} strokeWidth="3.4" strokeLinecap="round" />
      {/* drape — sweeps out to the right, the A's second leg */}
      <path d="M24 10.5 C30.5 19, 34 30, 36.5 41.5" stroke={c.drape} strokeWidth="3.4" strokeLinecap="round" />
      {/* four-point spark in the counter — the one decorative device */}
      <path
        d="M24 23 L25.7 28.3 L31 30 L25.7 31.7 L24 37 L22.3 31.7 L17 30 L22.3 28.3 Z"
        fill={c.spark}
      />
    </svg>
  );
}

export function AyvanaLogo({
  tone = "onLight",
  size = 30,
  subtitle,
  showTagline = false,
}: {
  tone?: Tone;
  size?: number;
  subtitle?: string;
  showTagline?: boolean;
}) {
  const c = PALETTE[tone];
  const caption = subtitle ?? (showTagline ? "The Abaya Marketplace" : undefined);
  return (
    <span className="inline-flex items-center gap-2.5">
      <AyvanaMark size={size} tone={tone} />
      <span className="inline-flex flex-col leading-none">
        <span
          style={{ color: c.word }}
          className="font-display text-[1.15rem] font-medium leading-none tracking-[0.16em]"
        >
          AYVANA
        </span>
        {caption && (
          <span
            style={{ color: c.sub }}
            className="mt-1 text-[0.58rem] uppercase leading-none tracking-[0.2em]"
          >
            {caption}
          </span>
        )}
      </span>
    </span>
  );
}
