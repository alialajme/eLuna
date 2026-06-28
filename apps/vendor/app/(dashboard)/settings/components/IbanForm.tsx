"use client";

import { useState, useTransition } from "react";
import { updateVendorIBAN } from "../../../actions/vendor";

type Props = {
  currentIban: string;
};

export function IbanForm({ currentIban }: Props) {
  const [iban, setIban] = useState(currentIban);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = () => {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateVendorIBAN(iban);
      if (result.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        setError(result.error ?? "Could not save IBAN");
      }
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-body-xs font-medium text-ink mb-1">
          UAE IBAN
        </label>
        <input
          type="text"
          value={iban}
          onChange={(e) => setIban(e.target.value)}
          placeholder="AE07 0331 2345 6789 0123 456"
          className="w-full rounded-lg border border-sand bg-ivory px-3 py-2 text-body-md text-ink placeholder:text-mist focus:border-gold focus:outline-none font-mono"
        />
        <p className="mt-1 text-body-xs text-mist">
          23 characters: AE followed by 21 digits
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending}
          className="rounded-full bg-gold px-4 py-2 text-body-sm font-medium text-ink hover:bg-gold/80 disabled:opacity-50 transition-colors"
        >
          {isPending ? "Saving…" : "Save IBAN"}
        </button>
        {saved && <span className="text-body-sm text-sage">Saved ✓</span>}
        {error && <span className="text-body-sm text-coral">{error}</span>}
      </div>
    </div>
  );
}
