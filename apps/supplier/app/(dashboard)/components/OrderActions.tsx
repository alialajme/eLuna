"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  acceptMaterialOrder,
  rejectMaterialOrder,
  shipMaterialOrder,
  completeMaterialOrder,
} from "../../actions/incoming-order";

type Props = {
  orderId: string;
  status: string;
};

const primaryBtn =
  "rounded-full bg-ink px-5 py-2.5 text-body-sm font-medium text-ivory hover:bg-ink/90 transition-colors disabled:opacity-50";
const dangerBtn =
  "rounded-full bg-coral/10 px-5 py-2.5 text-body-sm font-medium text-coral hover:bg-coral/20 transition-colors disabled:opacity-50";

export function OrderActions({ orderId, status }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [trackingNote, setTrackingNote] = useState("");

  function run(fn: () => Promise<{ success: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.success) {
        setError(result.error ?? "Something went wrong");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {status === "PENDING" && (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={isPending} className={primaryBtn}
            onClick={() => run(() => acceptMaterialOrder(orderId))}>Accept order</button>
          <button type="button" disabled={isPending} className={dangerBtn}
            onClick={() => run(() => rejectMaterialOrder(orderId))}>Reject</button>
        </div>
      )}

      {status === "ACCEPTED" && (
        <div className="space-y-2">
          <label htmlFor="tracking" className="text-label text-mist block">TRACKING NOTE (OPTIONAL)</label>
          <input id="tracking" value={trackingNote} maxLength={200}
            onChange={(e) => setTrackingNote(e.target.value)}
            placeholder="Courier + tracking number, or pickup details"
            className="w-full rounded-xl border border-sand px-4 py-3 text-body-md text-ink bg-ivory focus:outline-none focus:border-ink" />
          <button type="button" disabled={isPending} className={primaryBtn}
            onClick={() => run(() => shipMaterialOrder(orderId, trackingNote || undefined))}>Mark shipped</button>
        </div>
      )}

      {status === "SHIPPED" && (
        <button type="button" disabled={isPending} className={primaryBtn}
          onClick={() => run(() => completeMaterialOrder(orderId))}>Mark completed</button>
      )}

      {error && <p className="text-body-xs text-coral">{error}</p>}
    </div>
  );
}
