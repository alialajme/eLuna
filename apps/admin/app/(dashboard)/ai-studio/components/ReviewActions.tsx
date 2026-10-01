"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resolveReview } from "../../../actions/ai-studio";

export function ReviewActions({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const decide = (decision: "approve" | "reject") => {
    setError(null);
    start(async () => {
      const res = await resolveReview(sessionId, decision);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="inline-flex items-center gap-2">
      {error && <span className="text-body-xs text-coral">{error}</span>}
      <button
        type="button"
        onClick={() => decide("reject")}
        disabled={pending}
        className="rounded-md border border-sand px-3 py-1 text-body-xs font-medium text-coral transition-colors hover:border-coral/60 disabled:opacity-60"
      >
        Reject
      </button>
      <button
        type="button"
        onClick={() => decide("approve")}
        disabled={pending}
        className="rounded-md bg-ink px-3 py-1 text-body-xs font-medium text-ivory transition-colors hover:bg-ink-elevated disabled:opacity-60"
      >
        {pending ? "…" : "Approve"}
      </button>
    </div>
  );
}
