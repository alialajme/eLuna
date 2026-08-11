"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { issueOrderInvoice } from "../../actions/invoice";

export function IssueInvoiceButton({ orderId, hasTrn }: { orderId: string; hasTrn: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleIssue() {
    setError(null);
    startTransition(async () => {
      const result = await issueOrderInvoice(orderId);
      if (!result.success) {
        setError(result.error ?? "Something went wrong");
        return;
      }
      router.push(`/invoices/${result.id}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <button type="button" onClick={handleIssue} disabled={isPending || !hasTrn}
        className="rounded-full bg-ink px-5 py-2.5 text-body-sm font-medium text-ivory hover:bg-ink/90 transition-colors disabled:opacity-50">
        {isPending ? "Issuing…" : "Issue tax invoice"}
      </button>
      {!hasTrn && <p className="text-body-xs text-mist">Set your TRN in Settings to issue invoices.</p>}
      {error && <p className="text-body-xs text-coral">{error}</p>}
    </div>
  );
}
