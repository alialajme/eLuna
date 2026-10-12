"use client";

import { useState, useTransition } from "react";

export function OwnCaseComposer({
  caseId,
  action,
}: {
  caseId: string;
  action: (caseId: string, body: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder="Add a reply…"
        className="rounded-md border border-sand p-2 text-body-sm"
      />
      {error && <p className="text-label text-coral">{error}</p>}
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await action(caseId, body);
            if (r.ok) setBody("");
            else setError(r.error ?? "Failed");
          })
        }
        className="self-start rounded-md bg-ink px-4 py-1.5 text-label text-ivory disabled:opacity-50"
      >
        {pending ? "Sending…" : "Reply"}
      </button>
    </div>
  );
}
