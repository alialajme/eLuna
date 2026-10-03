"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requestMaterialReturn } from "../../actions/material-returns";

export function RequestReturnForm({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await requestMaterialReturn(orderId, reason);
      if (!result.success) {
        setError(result.error ?? "Something went wrong");
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-sand px-5 py-2.5 text-body-sm text-ink hover:border-ink transition-colors"
      >
        Request return
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-sand bg-ivory p-5">
      <p className="text-label text-mist">REQUEST A RETURN</p>
      <textarea
        value={reason}
        maxLength={500}
        rows={3}
        onChange={(e) => setReason(e.target.value)}
        placeholder="What's wrong with the materials? (e.g. wrong colour, damaged on arrival)"
        className="w-full rounded-xl border border-sand px-4 py-3 text-body-md text-ink bg-white focus:outline-none focus:border-ink"
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={isPending || reason.trim().length < 3}
          onClick={submit}
          className="rounded-md bg-ink px-5 py-2.5 text-body-sm font-medium text-ivory hover:bg-ink/90 transition-colors disabled:opacity-50"
        >
          {isPending ? "Submitting…" : "Submit request"}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => setOpen(false)}
          className="rounded-md px-5 py-2.5 text-body-sm text-mist hover:text-ink transition-colors"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-body-xs text-coral">{error}</p>}
    </div>
  );
}
