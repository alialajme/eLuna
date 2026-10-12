"use client";

import { useState } from "react";

export type CaseCategoryOption = { id: string; name: string };
export type CaseSubmitResult = { ok: true; caseNumber: string } | { ok: false; error: string };

type Props = {
  categories: CaseCategoryOption[];
  defaultContactName?: string;
  defaultContactEmail?: string;
  defaultContactPhone?: string;
  action: (data: {
    type: "COMPLAINT" | "SUGGESTION" | "QUESTION";
    categoryId: string;
    subject: string;
    description: string;
    contactName: string;
    contactEmail: string;
    contactPhone: string;
    orderId?: string;
  }) => Promise<CaseSubmitResult>;
  orderId?: string;
};

export function CaseSubmitForm({
  categories,
  action,
  defaultContactName = "",
  defaultContactEmail = "",
  defaultContactPhone = "",
  orderId,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const res = await action({
      type: fd.get("type") as "COMPLAINT" | "SUGGESTION" | "QUESTION",
      categoryId: String(fd.get("categoryId")),
      subject: String(fd.get("subject")),
      description: String(fd.get("description")),
      contactName: String(fd.get("contactName")),
      contactEmail: String(fd.get("contactEmail")),
      contactPhone: String(fd.get("contactPhone")),
      orderId,
    });
    setBusy(false);
    if (res.ok) setDone(res.caseNumber);
    else setError(res.error);
  }

  if (done)
    return (
      <p className="rounded-md bg-sage/10 p-4 text-body-sm text-ink">
        Submitted — your reference is <b>{done}</b>.
      </p>
    );

  return (
    <form onSubmit={onSubmit} className="flex max-w-lg flex-col gap-3">
      <select
        name="type"
        className="rounded-md border border-sand bg-white p-2 text-body-sm"
        defaultValue="COMPLAINT"
      >
        <option value="COMPLAINT">Complaint</option>
        <option value="SUGGESTION">Suggestion</option>
        <option value="QUESTION">Question</option>
      </select>
      <select
        name="categoryId"
        className="rounded-md border border-sand bg-white p-2 text-body-sm"
        required
      >
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <input
        name="subject"
        placeholder="Subject"
        required
        className="rounded-md border border-sand bg-white p-2 text-body-sm"
      />
      <textarea
        name="description"
        placeholder="Describe the issue"
        required
        rows={5}
        className="rounded-md border border-sand bg-white p-2 text-body-sm"
      />
      <input
        name="contactName"
        placeholder="Your name"
        required
        defaultValue={defaultContactName}
        className="rounded-md border border-sand bg-white p-2 text-body-sm"
      />
      <input
        name="contactEmail"
        type="email"
        placeholder="Email"
        defaultValue={defaultContactEmail}
        className="rounded-md border border-sand bg-white p-2 text-body-sm"
      />
      <input
        name="contactPhone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="Mobile number"
        defaultValue={defaultContactPhone}
        className="rounded-md border border-sand bg-white p-2 text-body-sm"
      />
      {error && <p className="text-label text-coral">{error}</p>}
      <button
        disabled={busy}
        className="rounded-md bg-ink px-4 py-2 text-body-sm text-ivory disabled:opacity-50"
      >
        {busy ? "Submitting…" : "Submit"}
      </button>
    </form>
  );
}
