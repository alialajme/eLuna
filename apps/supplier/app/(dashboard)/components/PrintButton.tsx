"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-full border border-sand px-5 py-2.5 text-body-sm text-ink hover:border-ink transition-colors print:hidden"
    >
      Print
    </button>
  );
}
