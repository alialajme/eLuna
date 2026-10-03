"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { purchaseCreditPack } from "../../../actions/studio-billing";

type Pack = { code: string; name: string; credits: number; price: number };

export function PackPicker({ packs }: { packs: Pack[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const buy = (code: string) => {
    setError(null);
    setBusyCode(code);
    startTransition(async () => {
      const res = await purchaseCreditPack(code);
      setBusyCode(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  };

  const fmt = (n: number) => n.toLocaleString("en-AE");

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {packs.map((pack) => {
          const perShoot = pack.credits > 0 ? Math.round(pack.price / pack.credits) : pack.price;
          const busy = busyCode === pack.code && pending;
          return (
            <div key={pack.code} className="flex flex-col rounded-lg border border-sand bg-white p-5">
              <p className="font-display text-display-md text-ink tabular-nums">{pack.credits}</p>
              <p className="text-body-xs text-mist">{pack.credits === 1 ? "shoot" : "shoots"}</p>
              <p className="mt-3 text-body-sm font-medium text-ink tabular-nums">AED {fmt(pack.price)}</p>
              <p className="mt-0.5 text-body-xs text-mist">AED {fmt(perShoot)} / shoot</p>
              <button
                type="button"
                onClick={() => buy(pack.code)}
                disabled={busy || pending}
                className="mt-5 rounded-md border border-ink px-4 py-2 text-body-sm font-medium text-ink transition-colors hover:bg-ink hover:text-ivory disabled:opacity-60"
              >
                {busy ? "Processing…" : "Buy pack"}
              </button>
            </div>
          );
        })}
      </div>
      {error && (
        <p role="alert" className="text-body-sm text-coral">
          {error}
        </p>
      )}
    </div>
  );
}
