"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { COURIERS } from "@e-luna/ui/couriers";
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
  const [courier, setCourier] = useState(COURIERS[0]?.id ?? "");
  const [trackingNumber, setTrackingNumber] = useState("");
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
        <div className="space-y-3 rounded-2xl border border-sand bg-ivory p-5">
          <p className="text-label text-mist">SHIP TO VENDOR</p>
          <div className="space-y-2">
            <label htmlFor="courier" className="text-body-xs text-mist block">Courier</label>
            <select id="courier" value={courier} onChange={(e) => setCourier(e.target.value)}
              className="w-full rounded-xl border border-sand px-4 py-3 text-body-md text-ink bg-white focus:outline-none focus:border-ink">
              {COURIERS.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label htmlFor="trackingNumber" className="text-body-xs text-mist block">
              Tracking number <span className="text-mist">(required unless auto-generated)</span>
            </label>
            <input id="trackingNumber" value={trackingNumber} maxLength={100}
              onChange={(e) => setTrackingNumber(e.target.value)}
              placeholder="e.g. 1234567890"
              className="w-full rounded-xl border border-sand px-4 py-3 text-body-md text-ink bg-white focus:outline-none focus:border-ink" />
          </div>
          <div className="space-y-2">
            <label htmlFor="note" className="text-body-xs text-mist block">Note (optional)</label>
            <input id="note" value={trackingNote} maxLength={200}
              onChange={(e) => setTrackingNote(e.target.value)}
              placeholder="Pickup details, etc."
              className="w-full rounded-xl border border-sand px-4 py-3 text-body-md text-ink bg-white focus:outline-none focus:border-ink" />
          </div>
          <button type="button" disabled={isPending || !courier} className={primaryBtn}
            onClick={() => run(() => shipMaterialOrder(orderId, {
              courier,
              trackingNumber: trackingNumber || undefined,
              trackingNote: trackingNote || undefined,
            }))}>Mark shipped</button>
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
