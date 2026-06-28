"use client";

import { useState, useTransition } from "react";
import { updateVariantStock } from "../../../actions/product";

type Props = {
  variantId: string;
  initialStock: number;
};

export function StockInput({ variantId, initialStock }: Props) {
  const [stock, setStock] = useState(initialStock);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSave = () => {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateVariantStock(variantId, stock);
      if (result.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        setError(result.error ?? "Failed to save");
      }
    });
  };

  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min={0}
        value={stock}
        onChange={(e) => {
          setStock(parseInt(e.target.value) || 0);
          setSaved(false);
          setError(null);
        }}
        className="w-16 rounded border border-sand bg-white px-2 py-1 text-body-sm text-ink"
      />
      <button
        type="button"
        onClick={handleSave}
        disabled={isPending}
        className="rounded px-2 py-1 text-body-xs text-gold border border-gold hover:bg-gold/10 disabled:opacity-50 transition-colors"
      >
        {isPending ? "…" : "Save"}
      </button>
      {saved && (
        <span className="text-body-xs text-sage">Saved ✓</span>
      )}
      {error && (
        <span className="text-body-xs text-coral">{error}</span>
      )}
    </div>
  );
}
