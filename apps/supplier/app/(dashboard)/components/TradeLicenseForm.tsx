"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitTradeLicense } from "../../actions/trade-license";

type Props = { initialNumber: string | null; status: string };

const BADGE: Record<string, { className: string; label: string }> = {
  VERIFIED: { className: "bg-sage/20 text-sage", label: "Verified" },
  PENDING: { className: "bg-gold/20 text-gold", label: "Pending verification" },
  REJECTED: { className: "bg-coral/10 text-coral", label: "Rejected" },
  UNVERIFIED: { className: "bg-sand text-mist", label: "Not verified" },
};

export function TradeLicenseForm({ initialNumber, status }: Props) {
  const router = useRouter();
  const [num, setNum] = useState(initialNumber ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const badge = BADGE[status] ?? BADGE.UNVERIFIED!;

  function handleSubmit() {
    setError(null);
    setOk(null);
    startTransition(async () => {
      const result = await submitTradeLicense(num);
      if (!result.success) {
        setError(result.error ?? "Something went wrong");
        router.refresh();
        return;
      }
      setOk(result.status === "VERIFIED" ? "Verified ✓" : "Submitted — pending verification");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="license" className="text-label text-mist block mb-2">TRADE LICENCE NUMBER</label>
        <input
          id="license"
          value={num}
          maxLength={30}
          onChange={(e) => setNum(e.target.value)}
          placeholder="e.g. CN-1234567"
          className="w-full max-w-xs rounded-xl border border-sand px-4 py-3 text-body-md text-ink bg-ivory focus:outline-none focus:border-ink font-mono"
        />
      </div>
      <div>
        <span className={`rounded-md px-3 py-1 text-body-sm font-medium ${badge.className}`}>{badge.label}</span>
      </div>
      {error && <p className="text-body-sm text-coral">{error}</p>}
      {ok && <p className="text-body-sm text-sage">{ok}</p>}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={isPending || num.trim().length < 4}
        className="rounded-md bg-ink px-6 py-3 text-body-md font-medium text-ivory hover:bg-ink/90 transition-colors disabled:opacity-50"
      >
        {isPending ? "Verifying…" : "Verify licence"}
      </button>
    </div>
  );
}
