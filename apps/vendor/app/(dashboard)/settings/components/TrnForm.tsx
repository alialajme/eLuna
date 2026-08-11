"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setVendorTrn } from "../../../actions/invoice";

export function TrnForm({ initialTrn }: { initialTrn: string | null }) {
  const router = useRouter();
  const [trn, setTrn] = useState(initialTrn ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setError(null); setSaved(false);
    startTransition(async () => {
      const result = await setVendorTrn(trn);
      if (!result.success) { setError(result.error ?? "Something went wrong"); return; }
      setSaved(true); router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <input value={trn} inputMode="numeric" placeholder="15-digit TRN"
        onChange={(e) => setTrn(e.target.value.replace(/[^0-9]/g, "").slice(0, 15))}
        className="w-full max-w-xs rounded-lg border border-sand bg-ivory px-3 py-2 text-body-md text-ink font-mono focus:border-gold focus:outline-none" />
      {error && <p className="text-body-sm text-coral">{error}</p>}
      {saved && <p className="text-body-sm text-sage">Saved ✓</p>}
      <button type="button" onClick={handleSave} disabled={isPending || trn.length !== 15}
        className="rounded-full bg-ink px-5 py-2 text-body-sm font-medium text-ivory hover:bg-ink/90 transition-colors disabled:opacity-50">
        {isPending ? "Saving…" : "Save TRN"}
      </button>
    </div>
  );
}
