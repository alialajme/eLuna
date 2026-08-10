"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createMaterialOrder } from "../../actions/sourcing";

type Props = {
  materialId: string;
  moq: number;
  stock: number;
  unitPrice: number;
  unit: string;
};

export function PlaceOrderForm({ materialId, moq, stock, unitPrice, unit }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [qty, setQty] = useState(String(moq));
  const [note, setNote] = useState("");

  const quantity = Number(qty);
  const validQty = Number.isInteger(quantity) && quantity >= moq && quantity <= stock;
  const total = validQty ? unitPrice * quantity : 0;

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await createMaterialOrder(materialId, quantity, note || undefined);
      if (!result.success) {
        setError(result.error ?? "Something went wrong");
        return;
      }
      router.push("/sourcing/orders");
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-sand bg-ivory p-5 space-y-4">
      <div>
        <label htmlFor="order-qty" className="text-label text-mist block mb-2">
          QUANTITY (MOQ {moq}, {stock} available)
        </label>
        <input
          id="order-qty"
          type="number"
          min={moq}
          max={stock}
          step={1}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          className="w-full rounded-xl border border-sand px-4 py-3 text-body-md text-ink bg-ivory focus:outline-none focus:border-ink"
        />
      </div>
      <div>
        <label htmlFor="order-note" className="text-label text-mist block mb-2">NOTE TO SUPPLIER (OPTIONAL)</label>
        <textarea
          id="order-note"
          rows={2}
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Delivery timing, specifications…"
          className="w-full rounded-xl border border-sand px-4 py-3 text-body-md text-ink bg-ivory focus:outline-none focus:border-ink resize-none"
        />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-body-sm text-mist">Order total</span>
        <span className="font-display text-display-sm text-ink">
          AED {total.toLocaleString("en-AE", { minimumFractionDigits: 2 })}
        </span>
      </div>
      <p className="text-body-xs text-mist">Priced at AED {unitPrice.toLocaleString("en-AE", { minimumFractionDigits: 2 })} / {unit.toLowerCase()}</p>
      {error && (
        <div className="rounded-xl bg-coral/10 border border-coral px-4 py-3 text-body-sm text-coral">{error}</div>
      )}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={isPending || !validQty}
        className="w-full rounded-full bg-ink px-6 py-3 text-body-md font-medium text-ivory hover:bg-ink/90 transition-colors disabled:opacity-50"
      >
        {isPending ? "Placing…" : "Place order"}
      </button>
    </div>
  );
}
