"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { COURIERS } from "@e-luna/ui/couriers";
import { updateFulfillmentStatus } from "../../../actions/order";
import { createShipment, markShipmentDelivered } from "../../../actions/shipment";

type Item = { id: string; fulfillmentStatus: string; shipmentId: string | null; dropshipSupplierName: string | null };
type Shipment = { id: string; courier: string; trackingNumber: string | null; status: string; labelUrl: string | null };

type Props = {
  orderId: string;
  items: Item[];
  shipments: Shipment[];
};

export function FulfillmentPanel({ orderId, items, shipments }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [courier, setCourier] = useState<string>(COURIERS[0]?.id ?? "");
  const [tracking, setTracking] = useState("");
  const [eta, setEta] = useState("");

  const dropshipItems = items.filter((i) => i.dropshipSupplierName);
  const unshipped = items.filter(
    (i) =>
      !i.dropshipSupplierName &&
      !i.shipmentId &&
      (i.fulfillmentStatus === "PENDING" || i.fulfillmentStatus === "PROCESSING"),
  );
  const pendingItems = unshipped.filter((i) => i.fulfillmentStatus === "PENDING");
  const allDelivered = items.length > 0 && items.every((i) => i.fulfillmentStatus === "DELIVERED");

  const markProcessing = () => {
    setError(null);
    startTransition(async () => {
      for (const i of pendingItems) {
        const r = await updateFulfillmentStatus(i.id, "PROCESSING");
        if (!r.success) {
          setError(r.error ?? "Failed to update");
          return;
        }
      }
      router.refresh();
    });
  };

  const submitShipment = () => {
    setError(null);
    startTransition(async () => {
      const r = await createShipment({
        orderId,
        courier,
        trackingNumber: tracking,
        estimatedDelivery: eta || undefined,
      });
      if (!r.success) {
        setError(r.error ?? "Failed to create shipment");
        return;
      }
      setTracking("");
      setEta("");
      router.refresh();
    });
  };

  const deliver = (shipmentId: string) => {
    setError(null);
    startTransition(async () => {
      const r = await markShipmentDelivered(shipmentId);
      if (!r.success) {
        setError(r.error ?? "Failed to mark delivered");
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="rounded-lg border border-sand bg-ivory p-4 mt-4 space-y-4">
      <h3 className="text-body-xs font-medium text-ink">Fulfillment</h3>

      {dropshipItems.length > 0 && (
        <p className="text-body-xs text-mist">
          {dropshipItems.length} item(s) fulfilled by {dropshipItems[0]!.dropshipSupplierName} (dropship) — the supplier ships these directly.
        </p>
      )}

      {allDelivered && <p className="text-body-sm text-sage font-medium">Fulfilled ✓</p>}

      {shipments.map((s) => {
        const name = COURIERS.find((c) => c.id === s.courier)?.name ?? s.courier;
        return (
          <div key={s.id} className="rounded-md border border-sand p-3 space-y-2">
            <p className="text-body-sm text-ink">
              {name}
              {s.trackingNumber ? ` · ${s.trackingNumber}` : ""}
            </p>
            <p className="text-body-xs text-mist capitalize">{s.status.replace(/_/g, " ").toLowerCase()}</p>
            {s.labelUrl && (
              <a
                href={s.labelUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-body-xs text-gold hover:underline"
              >
                Print label
              </a>
            )}
            {s.status !== "DELIVERED" && (
              <button
                type="button"
                onClick={() => deliver(s.id)}
                disabled={isPending}
                className="rounded-full bg-ink px-4 py-2 text-body-sm font-medium text-ivory hover:bg-gold hover:text-ink disabled:opacity-50 transition-colors"
              >
                {isPending ? "Updating…" : "Mark Delivered"}
              </button>
            )}
          </div>
        );
      })}

      {unshipped.length > 0 && (
        <div className="space-y-2">
          {pendingItems.length > 0 && (
            <button
              type="button"
              onClick={markProcessing}
              disabled={isPending}
              className="text-body-xs text-mist hover:text-gold transition-colors disabled:opacity-50"
            >
              Mark {pendingItems.length} item(s) as processing
            </button>
          )}
          <p className="text-body-sm text-ink font-medium">Ship {unshipped.length} item(s)</p>
          <select
            value={courier}
            onChange={(e) => setCourier(e.target.value)}
            className="w-full rounded-lg border border-sand px-3 py-2 text-body-sm text-ink bg-ivory"
          >
            {COURIERS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            value={tracking}
            onChange={(e) => setTracking(e.target.value)}
            placeholder="Tracking number (blank if the courier auto-generates)"
            className="w-full rounded-lg border border-sand px-3 py-2 text-body-sm text-ink bg-ivory placeholder:text-mist"
          />
          <input
            type="date"
            value={eta}
            onChange={(e) => setEta(e.target.value)}
            className="w-full rounded-lg border border-sand px-3 py-2 text-body-sm text-ink bg-ivory"
          />
          <button
            type="button"
            onClick={submitShipment}
            disabled={isPending}
            className="rounded-full bg-ink px-4 py-2 text-body-sm font-medium text-ivory hover:bg-gold hover:text-ink disabled:opacity-50 transition-colors"
          >
            {isPending ? "Creating…" : "Create Shipment"}
          </button>
        </div>
      )}

      {error && <p className="text-body-xs text-coral">{error}</p>}
    </div>
  );
}
