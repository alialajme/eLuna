import * as React from "react";

// AYVANA logo — the master lockup art (a walking figure whose drape opens into
// an "A", with the four-point spark). The figure mark is cropped from the master
// raster via background-position; the wordmark is set alongside it.
type Tone = "onLight" | "onDark";

// The figure/A mark, cropped from the top of the square master lockup.
export function AyvanaMark({ size = 40 }: { size?: number }) {
  return (
    <span
      role="img"
      aria-label="AYVANA"
      style={{
        display: "inline-block",
        width: size,
        height: size,
        backgroundImage: "url(/ayvana-logo.jpg)",
        backgroundSize: "160%",
        backgroundPosition: "center 12%",
        backgroundRepeat: "no-repeat",
      }}
    />
  );
}

export function AyvanaLogo({
  tone = "onLight",
  size = 40,
  subtitle,
}: {
  tone?: Tone;
  size?: number;
  subtitle?: string;
  /** kept for API compatibility; the master art already carries the tagline. */
  showTagline?: boolean;
}) {
  const onDark = tone === "onDark";
  return (
    <span className="inline-flex items-center gap-2.5">
      {/* On onyx the raster keeps its own white ground (per the brand: never
          invert — set a white plate behind the lockup). */}
      <span className={onDark ? "inline-flex rounded-md bg-white p-1" : "inline-flex"}>
        <AyvanaMark size={size} />
      </span>
      <span className="inline-flex flex-col leading-none">
        <span
          className={`font-display text-[1.15rem] font-medium leading-none tracking-[0.16em] ${
            onDark ? "text-ivory" : "text-ink"
          }`}
        >
          AYVANA
        </span>
        {subtitle && (
          <span
            className={`mt-1 text-[0.58rem] uppercase leading-none tracking-[0.2em] ${
              onDark ? "text-mist" : "text-mist"
            }`}
          >
            {subtitle}
          </span>
        )}
      </span>
    </span>
  );
}
