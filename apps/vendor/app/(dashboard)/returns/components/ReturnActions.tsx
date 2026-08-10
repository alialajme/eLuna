"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  approveReturn,
  rejectReturn,
  markReturnReceived,
  refundReturn,
} from "../../../actions/returns";

export function ReturnActions({ returnId, status }: { returnId: string; status: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [restock, setRestock] = useState(true);

  const run = (fn: () => Promise<{ success: boolean; error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.success) {
        setError(r.error ?? "Failed");
        return;
      }
      router.refresh();
    });
  };

  if (status === "REJECTED" || status === "REFUNDED") return null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-sand pt-3">
      {status === "REQUESTED" && (
        <>
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(() => approveReturn(returnId))}
            className="rounded-full bg-ink px-4 py-1.5 text-body-sm font-medium text-ivory hover:bg-gold hover:text-ink disabled:opacity-50 transition-colors"
          >
            Approve
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(() => rejectReturn(returnId))}
            className="rounded-full border border-sand px-4 py-1.5 text-body-sm font-medium text-ink hover:border-coral hover:text-coral disabled:opacity-50 transition-colors"
          >
            Reject
          </button>
        </>
      )}
      {status === "APPROVED" && (
        <button
          type="button"
          disabled={isPending}
          onClick={() => run(() => markReturnReceived(returnId))}
          className="rounded-full bg-ink px-4 py-1.5 text-body-sm font-medium text-ivory hover:bg-gold hover:text-ink disabled:opacity-50 transition-colors"
        >
          Mark Received
        </button>
      )}
      {status === "RECEIVED" && (
        <>
          <label className="flex items-center gap-2 text-body-sm text-ink">
            <input
              type="checkbox"
              checked={restock}
              onChange={(e) => setRestock(e.target.checked)}
              className="accent-ink"
            />
            Restock
          </label>
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(() => refundReturn(returnId, restock))}
            className="rounded-full bg-ink px-4 py-1.5 text-body-sm font-medium text-ivory hover:bg-gold hover:text-ink disabled:opacity-50 transition-colors"
          >
            {isPending ? "Processing…" : "Issue Refund"}
          </button>
        </>
      )}
      {error && <p className="w-full text-body-xs text-coral">{error}</p>}
    </div>
  );
}
