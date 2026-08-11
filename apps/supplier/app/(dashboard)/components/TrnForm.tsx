"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setSupplierTrn } from "../../actions/invoice";

export function TrnForm({ initialTrn }: { initialTrn: string | null }) {
  const router = useRouter();
  const [trn, setTrn] = useState(initialTrn ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await setSupplierTrn(trn);
      if (!result.success) {
        setError(result.error ?? "Something went wrong");
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="trn" className="text-label text-mist block mb-2">TAX REGISTRATION NUMBER (TRN)</label>
        <input
          id="trn"
          value={trn}
          onChange={(e) => setTrn(e.target.value.replace(/[^0-9]/g, "").slice(0, 15))}
          placeholder="15-digit TRN"
          inputMode="numeric"
          className="w-full max-w-xs rounded-xl border border-sand px-4 py-3 text-body-md text-ink bg-ivory focus:outline-none focus:border-ink font-mono"
        />
      </div>
      {error && <p className="text-body-sm text-coral">{error}</p>}
      {saved && <p className="text-body-sm text-sage">Saved ✓</p>}
      <button
        type="button"
        onClick={handleSave}
        disabled={isPending || trn.length !== 15}
        className="rounded-full bg-ink px-6 py-3 text-body-md font-medium text-ivory hover:bg-ink/90 transition-colors disabled:opacity-50"
      >
        {isPending ? "Saving…" : "Save TRN"}
      </button>
    </div>
  );
}
