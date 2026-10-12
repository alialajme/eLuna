"use client";

import { useState, useTransition } from "react";
import { replyToCaseAction } from "../../../actions/cases";

export function CaseComposer({ caseId }: { caseId: string }) {
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-2 rounded-md border border-sand bg-white p-3">
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="Write a reply…" className="rounded-md border border-sand p-2 text-body-sm" />
      <label className="flex items-center gap-2 text-label text-mist">
        <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} /> Internal note (hidden from the opener)
      </label>
      {error && <p className="text-label text-coral">{error}</p>}
      <button
        disabled={pending}
        onClick={() => start(async () => { const r = await replyToCaseAction(caseId, body, internal); if ("error" in r) setError(r.error); else { setBody(""); setError(null); } })}
        className="self-start rounded-md bg-ink px-4 py-1.5 text-label text-ivory disabled:opacity-50"
      >
        {pending ? "Sending…" : internal ? "Add note" : "Reply"}
      </button>
    </div>
  );
}
