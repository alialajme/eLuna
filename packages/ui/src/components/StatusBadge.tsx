import type { ReactNode } from "react";

type StatusVariant =
  | "pending"
  | "active"
  | "success"
  | "error"
  | "warning"
  | "info"
  | "neutral";

const VARIANT_CLASSES: Record<StatusVariant, string> = {
  pending: "bg-sand text-ink",
  active: "bg-gold/20 text-gold",
  success: "bg-sage/20 text-sage",
  error: "bg-coral/20 text-coral",
  warning: "bg-gold/30 text-ink",
  info: "bg-lilac/20 text-lilac",
  neutral: "bg-mist/20 text-mist",
};

export function StatusBadge({
  children,
  variant = "neutral",
}: {
  children: ReactNode;
  variant?: StatusVariant;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-label font-medium ${VARIANT_CLASSES[variant]}`}
    >
      {children}
    </span>
  );
}
