"use client";

import type { ReactNode } from "react";

type NotificationVariant = "info" | "success" | "warning" | "error";

const ICON: Record<NotificationVariant, string> = {
  info: "ℹ",
  success: "✓",
  warning: "⚠",
  error: "✕",
};

const STYLE: Record<NotificationVariant, string> = {
  info: "border-lilac/30 bg-lilac/10 text-lilac",
  success: "border-sage/30 bg-sage/10 text-sage",
  warning: "border-gold/30 bg-gold/10 text-gold",
  error: "border-coral/30 bg-coral/10 text-coral",
};

export function Notification({
  variant = "info",
  title,
  children,
  onDismiss,
}: {
  variant?: NotificationVariant;
  title?: string;
  children?: ReactNode;
  onDismiss?: () => void;
}) {
  return (
    <div
      role="alert"
      className={`relative flex items-start gap-3 rounded-xl border p-4 ${STYLE[variant]}`}
    >
      <span className="mt-0.5 flex-shrink-0 text-body-md font-bold">
        {ICON[variant]}
      </span>
      <div className="flex-1">
        {title && <p className="font-sans text-body-md font-semibold">{title}</p>}
        {children && <div className="mt-0.5 text-body-sm opacity-80">{children}</div>}
      </div>
      {onDismiss && (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="ml-auto text-body-md opacity-60 transition-opacity hover:opacity-100"
        >
          ✕
        </button>
      )}
    </div>
  );
}
