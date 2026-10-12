"use client";

import { useTransition, useState } from "react";
import { assignToMeAction, setCaseStatusAction, resolveCaseAction, reopenCaseAction } from "../../../actions/cases";

const NEXT: Record<string, string[]> = {
  NEW: ["IN_PROGRESS", "CANCELLED"],
  ASSIGNED: ["IN_PROGRESS", "WAITING_CUSTOMER", "CANCELLED"],
  IN_PROGRESS: ["WAITING_CUSTOMER", "CANCELLED"],
  WAITING_CUSTOMER: ["IN_PROGRESS", "CANCELLED"],
  RESOLVED: [],
  CLOSED: [],
  CANCELLED: [],
};

export function CaseActions({ caseId, status }: { caseId: string; status: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ success: true } | { error: string }>) =>
    start(async () => { const r = await fn(); setError("error" in r ? r.error : null); });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button disabled={pending} onClick={() => run(() => assignToMeAction(caseId))} className="rounded-md border border-sand px-3 py-1 text-label">Assign to me</button>
      {(NEXT[status] ?? []).map((to) => (
        <button key={to} disabled={pending} onClick={() => run(() => setCaseStatusAction(caseId, to as never))} className="rounded-md border border-sand px-3 py-1 text-label">{to.replace(/_/g, " ").toLowerCase()}</button>
      ))}
      {["IN_PROGRESS", "WAITING_CUSTOMER"].includes(status) && (
        <button disabled={pending} onClick={() => run(() => resolveCaseAction(caseId))} className="rounded-md bg-sage/20 px-3 py-1 text-label text-sage">Resolve</button>
      )}
      {["RESOLVED", "CLOSED"].includes(status) && (
        <button disabled={pending} onClick={() => run(() => reopenCaseAction(caseId))} className="rounded-md border border-sand px-3 py-1 text-label">Reopen</button>
      )}
      {error && <span className="text-label text-coral">{error}</span>}
    </div>
  );
}
