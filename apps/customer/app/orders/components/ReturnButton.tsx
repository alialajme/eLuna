"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requestReturn } from "../../actions/returns";

export function ReturnButton({ orderItemId }: { orderItemId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    if (!reason.trim()) {
      setError("Please add a reason");
      return;
    }
    startTransition(async () => {
      const r = await requestReturn(orderItemId, reason);
      if (!r.success) {
        setError(r.error ?? "Failed to submit");
        return;
      }
      setOpen(false);
      router.refresh();
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 text-body-sm text-gold hover:underline"
      >
        Request return
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason for return"
        rows={2}
        className="w-full rounded-lg border border-sand px-3 py-2 text-body-sm text-ink bg-ivory placeholder:text-mist"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={isPending}
          className="rounded-full bg-ink px-4 py-1.5 text-body-sm font-medium text-ivory hover:bg-ink/90 disabled:opacity-50 transition-colors"
        >
          {isPending ? "Submitting…" : "Submit"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-body-sm text-mist hover:text-ink">
          Cancel
        </button>
      </div>
      {error && <p className="text-body-xs text-coral">{error}</p>}
    </div>
  );
}
