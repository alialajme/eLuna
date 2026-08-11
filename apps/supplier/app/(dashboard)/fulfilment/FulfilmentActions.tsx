"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { COURIERS } from "@e-luna/ui/couriers";
import { shipDropshipItems, markDropshipDelivered } from "../../actions/dropship";

const primaryBtn =
  "rounded-full bg-ink px-5 py-2.5 text-body-sm font-medium text-ivory hover:bg-ink/90 transition-colors disabled:opacity-50";

export function ShipGroup({ orderId, vendorId }: { orderId: string; vendorId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [courier, setCourier] = useState(COURIERS[0]?.id ?? "");
  const [trackingNumber, setTrackingNumber] = useState("");

  function ship() {
    setError(null);
    startTransition(async () => {
      const r = await shipDropshipItems({ orderId, vendorId, courier, trackingNumber: trackingNumber || undefined });
      if (!r.success) {
        setError(r.error ?? "Something went wrong");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <select value={courier} onChange={(e) => setCourier(e.target.value)}
        className="w-full rounded-xl border border-sand px-4 py-2.5 text-body-sm text-ink bg-white focus:outline-none focus:border-ink">
        {COURIERS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <input value={trackingNumber} maxLength={100} onChange={(e) => setTrackingNumber(e.target.value)}
        placeholder="Tracking number (required unless auto-generated)"
        className="w-full rounded-xl border border-sand px-4 py-2.5 text-body-sm text-ink bg-white focus:outline-none focus:border-ink" />
      <button type="button" disabled={isPending || !courier} className={primaryBtn} onClick={ship}>Ship to customer</button>
      {error && <p className="text-body-xs text-coral">{error}</p>}
    </div>
  );
}

export function DeliverButton({ shipmentId }: { shipmentId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function deliver() {
    setError(null);
    startTransition(async () => {
      const r = await markDropshipDelivered(shipmentId);
      if (!r.success) {
        setError(r.error ?? "Something went wrong");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-1">
      <button type="button" disabled={isPending} className={primaryBtn} onClick={deliver}>Mark delivered</button>
      {error && <p className="text-body-xs text-coral">{error}</p>}
    </div>
  );
}
