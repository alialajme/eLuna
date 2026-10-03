import * as React from "react";

// AYVANA icon set — authored to the brand icon spec: a 24×24 grid, single
// consistent stroke, square caps, mitred joins, no fill, no corner radius
// (the mark's own geometry). Colour inherits via currentColor.
export type IconName =
  | "grid"
  | "key"
  | "store"
  | "spool"
  | "clipboard"
  | "bag"
  | "tag"
  | "banknote"
  | "wallet"
  | "percent"
  | "chart"
  | "users"
  | "alert"
  | "sliders"
  | "undo"
  | "boxes"
  | "cart"
  | "receipt"
  | "package"
  | "inbox"
  | "sparkles";

const PATHS: Record<IconName, React.ReactNode> = {
  // Four-point spark — the AYVANA brand device, used for AI Studio.
  sparkles: (
    <path d="M12 3 L13.8 10.2 L21 12 L13.8 13.8 L12 21 L10.2 13.8 L3 12 L10.2 10.2 Z" />
  ),
  grid: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" />
      <rect x="13.5" y="3.5" width="7" height="7" />
      <rect x="3.5" y="13.5" width="7" height="7" />
      <rect x="13.5" y="13.5" width="7" height="7" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="8" r="3.5" />
      <path d="M10.5 10.5 L20 20 M17 20 L20 20 L20 17 M14 17 L16 15" />
    </>
  ),
  store: (
    <path d="M3.5 9 L5.5 4 H18.5 L20.5 9 M3.5 9 H20.5 M5 9 V20 H19 V9 M9 20 V14 H15 V20" />
  ),
  spool: (
    <>
      <rect x="6" y="3.5" width="12" height="17" />
      <path d="M6 8 H18 M6 16 H18" />
    </>
  ),
  clipboard: (
    <>
      <rect x="5" y="4.5" width="14" height="16.5" />
      <path d="M9 4.5 V3 H15 V4.5 M8.5 10 H15.5 M8.5 13.5 H15.5 M8.5 17 H13" />
    </>
  ),
  bag: (
    <path d="M6 8 H18 L17 20.5 H7 Z M9 8 V6.5 A3 3 0 0 1 15 6.5 V8" />
  ),
  tag: (
    <>
      <path d="M3.5 3.5 H12 L20.5 12 L12 20.5 L3.5 12 Z" />
      <circle cx="7.75" cy="7.75" r="1.25" />
    </>
  ),
  banknote: (
    <>
      <rect x="3" y="6" width="18" height="12" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 9 V15 M18 9 V15" />
    </>
  ),
  wallet: (
    <>
      <rect x="3" y="6" width="18" height="13" />
      <path d="M3 10 H21 M15.5 13 H19 V16 H15.5 Z" />
    </>
  ),
  percent: (
    <>
      <circle cx="7.5" cy="7.5" r="2" />
      <circle cx="16.5" cy="16.5" r="2" />
      <path d="M18 6 L6 18" />
    </>
  ),
  chart: (
    <path d="M4 4 V20 H20 M8 20 V14 M12 20 V9 M16 20 V12.5" />
  ),
  users: (
    <>
      <circle cx="8.5" cy="8" r="3" />
      <path d="M3.5 20 V18.5 A5 5 0 0 1 13.5 18.5 V20" />
      <path d="M15.5 5.5 A3 3 0 0 1 15.5 11 M16.5 14 A5 5 0 0 1 20.5 18.5 V20" />
    </>
  ),
  alert: (
    <path d="M12 3.5 L21 20 H3 Z M12 10 V14 M12 17 V17.5" />
  ),
  sliders: (
    <>
      <path d="M4 7 H20 M4 12 H20 M4 17 H20" />
      <rect x="7" y="5" width="3" height="4" />
      <rect x="14" y="10" width="3" height="4" />
      <rect x="9" y="15" width="3" height="4" />
    </>
  ),
  undo: (
    <path d="M8 5 L3.5 10 L8 15 M3.5 10 H15 V20 H9" />
  ),
  boxes: (
    <>
      <rect x="8" y="3" width="8" height="8" />
      <rect x="3" y="13" width="8" height="8" />
      <rect x="13" y="13" width="8" height="8" />
    </>
  ),
  cart: (
    <>
      <path d="M3 4 H5.5 L7.5 15 H18 L20 7 H6" />
      <circle cx="9" cy="19.5" r="1.4" />
      <circle cx="17" cy="19.5" r="1.4" />
    </>
  ),
  receipt: (
    <>
      <path d="M6 3 H18 V21 L15 19 L12 21 L9 19 L6 21 Z" />
      <path d="M9 8 H15 M9 12 H15 M9 16 H13" />
    </>
  ),
  package: (
    <path d="M4 8 L12 3.5 L20 8 V16.5 L12 21 L4 16.5 Z M4 8 L12 12.5 L20 8 M12 12.5 V21" />
  ),
  inbox: (
    <path d="M4 13.5 H8 L10 16.5 H14 L16 13.5 H20 V20.5 H4 Z M12 3.5 V11 M9 8 L12 11 L15 8" />
  ),
};

export function Icon({
  name,
  size = 18,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      className={className}
    >
      {PATHS[name]}
    </svg>
  );
}
