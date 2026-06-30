"use client";

import { useState, useTransition } from "react";
import { updateFulfillmentStatus } from "../../../actions/order";

type ItemStatus = {
  id: string;
  fulfillmentStatus: string;
};

type Props = {
  items: ItemStatus[];
};

type ForwardStatus = "PROCESSING" | "SHIPPED" | "DELIVERED";

const STATUS_PRECEDENCE = ["PENDING", "PROCESSING", "SHIPPED", "DELIVERED", "RETURNED"];

const NEXT_STATUS: Record<string, ForwardStatus | null> = {
  PENDING: "PROCESSING",
  PROCESSING: "SHIPPED",
  SHIPPED: "DELIVERED",
  DELIVERED: null,
};

const BUTTON_LABELS: Record<string, string> = {
  PENDING: "Mark as Processing",
  PROCESSING: "Mark as Shipped",
  SHIPPED: "Mark as Delivered",
};

function worstStatus(statuses: string[]): string {
  let worst = "DELIVERED";
  for (const s of statuses) {
    if (STATUS_PRECEDENCE.indexOf(s) < STATUS_PRECEDENCE.indexOf(worst)) {
      worst = s;
    }
  }
  return worst;
}

export function FulfillmentPanel({ items }: Props) {
  const [statuses, setStatuses] = useState<Record<string, string>>(
    Object.fromEntries(items.map((i) => [i.id, i.fulfillmentStatus]))
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const currentStatuses = Object.values(statuses);
  const current = worstStatus(currentStatuses);
  const allDelivered = currentStatuses.every((s) => s === "DELIVERED");
  const nextStatus = NEXT_STATUS[current];

  const handleAdvance = () => {
    if (!nextStatus) return;
    setError(null);

    const eligibleItems = items.filter((i) => statuses[i.id] === current);

    startTransition(async () => {
      const updates: Record<string, string> = {};
      let firstError: string | null = null;

      for (const item of eligibleItems) {
        const result = await updateFulfillmentStatus(item.id, nextStatus);
        if (result.success) {
          updates[item.id] = nextStatus;
        } else if (!firstError) {
          firstError = result.error ?? "Failed to update";
        }
      }

      if (Object.keys(updates).length > 0) {
        setStatuses((prev) => ({ ...prev, ...updates }));
      }
      if (firstError) {
        setError(firstError);
      }
    });
  };

  return (
    <div className="rounded-lg border border-sand bg-ivory p-4 mt-4">
      <h3 className="text-body-xs font-medium text-ink mb-2">Fulfillment</h3>
      {allDelivered ? (
        <p className="text-body-sm text-sage font-medium">Fulfilled ✓</p>
      ) : (
        <div className="space-y-3">
          <p className="text-body-sm text-mist">
            Status:{" "}
            <span className="text-ink font-medium capitalize">
              {current.toLowerCase()}
            </span>
          </p>
          {nextStatus && (
            <button
              type="button"
              onClick={handleAdvance}
              disabled={isPending}
              className="rounded-full bg-ink px-4 py-2 text-body-sm font-medium text-ivory hover:bg-gold hover:text-ink disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isPending ? "Updating…" : BUTTON_LABELS[current]}
            </button>
          )}
          {error && <p className="text-body-xs text-coral">{error}</p>}
        </div>
      )}
    </div>
  );
}
