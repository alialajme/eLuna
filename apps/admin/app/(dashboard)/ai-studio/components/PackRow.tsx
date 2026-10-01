"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updatePackage } from "../../../actions/ai-studio";

type Pack = { id: string; code: string; name: string; credits: number; price: number; isActive: boolean };

export function PackRow({ pack }: { pack: Pack }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [credits, setCredits] = useState(String(pack.credits));
  const [price, setPrice] = useState(String(pack.price));
  const [active, setActive] = useState(pack.isActive);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = () => {
    setError(null);
    start(async () => {
      const res = await updatePackage(pack.id, { credits: Number(credits), price: Number(price), isActive: active });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  };

  if (!editing) {
    return (
      <tr className="border-b border-sand/50 last:border-0">
        <td className="px-4 py-2.5 text-body-sm font-medium text-ink">{pack.name}</td>
        <td className="px-4 py-2.5 text-body-sm tabular-nums text-ink">{pack.credits}</td>
        <td className="px-4 py-2.5 text-body-sm tabular-nums text-ink">{pack.price.toLocaleString("en-AE")}</td>
        <td className="px-4 py-2.5">
          <span
            className={`rounded-md px-2 py-0.5 text-body-xs font-medium ${
              pack.isActive ? "bg-sage/20 text-sage" : "bg-sand text-mist"
            }`}
          >
            {pack.isActive ? "Active" : "Hidden"}
          </span>
        </td>
        <td className="px-4 py-2.5 text-right">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-body-sm text-gold underline-offset-2 hover:underline"
          >
            Edit
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-sand/50 bg-gold/5 last:border-0">
      <td className="px-4 py-2.5 text-body-sm font-medium text-ink">{pack.name}</td>
      <td className="px-4 py-2.5">
        <input
          type="number"
          min="1"
          step="1"
          value={credits}
          onChange={(e) => setCredits(e.target.value)}
          className="w-20 rounded-md border border-sand px-2 py-1 text-body-sm tabular-nums focus:border-gold focus:outline-none"
          aria-label={`${pack.name} credits`}
        />
      </td>
      <td className="px-4 py-2.5">
        <input
          type="number"
          min="0"
          step="1"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="w-24 rounded-md border border-sand px-2 py-1 text-body-sm tabular-nums focus:border-gold focus:outline-none"
          aria-label={`${pack.name} price`}
        />
      </td>
      <td className="px-4 py-2.5">
        <label className="inline-flex items-center gap-2 text-body-xs text-ink">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="accent-gold" />
          Active
        </label>
      </td>
      <td className="px-4 py-2.5 text-right">
        <div className="inline-flex items-center gap-2">
          {error && <span className="text-body-xs text-coral">{error}</span>}
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="rounded-md bg-ink px-3 py-1 text-body-xs font-medium text-ivory hover:bg-ink-elevated disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={pending}
            className="text-body-xs text-mist hover:text-ink"
          >
            Cancel
          </button>
        </div>
      </td>
    </tr>
  );
}
