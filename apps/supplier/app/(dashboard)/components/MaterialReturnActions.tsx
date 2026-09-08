"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  approveMaterialReturn,
  rejectMaterialReturn,
  markMaterialReturnReceived,
  refundMaterialReturn,
} from "../../actions/material-return";

type Props = { returnId: string; status: string };

const primaryBtn =
  "rounded-full bg-ink px-5 py-2.5 text-body-sm font-medium text-ivory hover:bg-ink/90 transition-colors disabled:opacity-50";
const dangerBtn =
  "rounded-full bg-coral/10 px-5 py-2.5 text-body-sm font-medium text-coral hover:bg-coral/20 transition-colors disabled:opacity-50";

export function MaterialReturnActions({ returnId, status }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [restock, setRestock] = useState(true);

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
      {status === "REQUESTED" && (
        <div className="space-y-3 rounded-2xl border border-sand bg-ivory p-5">
          <label htmlFor="note" className="text-body-xs text-mist block">Note to vendor (optional)</label>
          <input id="note" value={note} maxLength={300}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Reason for approval / rejection"
            className="w-full rounded-xl border border-sand px-4 py-3 text-body-md text-ink bg-white focus:outline-none focus:border-ink" />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={isPending} className={primaryBtn}
              onClick={() => run(() => approveMaterialReturn(returnId, note || undefined))}>Approve return</button>
            <button type="button" disabled={isPending} className={dangerBtn}
              onClick={() => run(() => rejectMaterialReturn(returnId, note || undefined))}>Reject</button>
          </div>
        </div>
      )}

      {status === "APPROVED" && (
        <button type="button" disabled={isPending} className={primaryBtn}
          onClick={() => run(() => markMaterialReturnReceived(returnId))}>Mark received</button>
      )}

      {status === "RECEIVED" && (
        <div className="space-y-3 rounded-2xl border border-sand bg-ivory p-5">
          <label className="flex items-center gap-2 text-body-sm text-ink">
            <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} />
            Restock the returned quantity
          </label>
          <button type="button" disabled={isPending} className={primaryBtn}
            onClick={() => run(() => refundMaterialReturn(returnId, restock))}>Refund &amp; close</button>
          <p className="text-body-xs text-mist">
            Refunding reverses this order&apos;s earnings from your payout balance.
          </p>
        </div>
      )}

      {error && <p className="text-body-xs text-coral">{error}</p>}
    </div>
  );
}
