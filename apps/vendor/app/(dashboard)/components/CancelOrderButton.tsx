"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelMaterialOrder } from "../../actions/sourcing";

export function CancelOrderButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleCancel() {
    if (!confirm("Cancel this order?")) return;
    setError(null);
    startTransition(async () => {
      const result = await cancelMaterialOrder(orderId);
      if (!result.success) {
        setError(result.error ?? "Something went wrong");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleCancel}
        disabled={isPending}
        className="rounded-full bg-coral/10 px-5 py-2.5 text-body-sm font-medium text-coral hover:bg-coral/20 transition-colors disabled:opacity-50"
      >
        {isPending ? "Cancelling…" : "Cancel order"}
      </button>
      {error && <p className="text-body-xs text-coral">{error}</p>}
    </div>
  );
}
