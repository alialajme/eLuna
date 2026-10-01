"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updatePlan } from "../../../actions/ai-studio";

type Plan = {
  id: string;
  code: string;
  name: string;
  priceMonthly: number;
  priceAnnual: number | null;
  includedShoots: number;
  maxResolution: string;
  isActive: boolean;
};

export function PlanRow({ plan }: { plan: Plan }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [monthly, setMonthly] = useState(String(plan.priceMonthly));
  const [annual, setAnnual] = useState(plan.priceAnnual == null ? "" : String(plan.priceAnnual));
  const [shoots, setShoots] = useState(String(plan.includedShoots));
  const [active, setActive] = useState(plan.isActive);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = () => {
    setError(null);
    start(async () => {
      const res = await updatePlan(plan.id, {
        priceMonthly: Number(monthly),
        priceAnnual: annual.trim() === "" ? null : Number(annual),
        includedShoots: Number(shoots),
        isActive: active,
      });
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
        <td className="px-4 py-2.5 text-body-sm font-medium text-ink">{plan.name}</td>
        <td className="px-4 py-2.5 text-body-sm tabular-nums text-ink">{plan.priceMonthly.toLocaleString("en-AE")}</td>
        <td className="px-4 py-2.5 text-body-sm tabular-nums text-mist">
          {plan.priceAnnual == null ? "—" : plan.priceAnnual.toLocaleString("en-AE")}
        </td>
        <td className="px-4 py-2.5 text-body-sm tabular-nums text-ink">{plan.includedShoots}</td>
        <td className="px-4 py-2.5">
          <span
            className={`rounded-md px-2 py-0.5 text-body-xs font-medium ${
              plan.isActive ? "bg-sage/20 text-sage" : "bg-sand text-mist"
            }`}
          >
            {plan.isActive ? "Active" : "Hidden"}
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
      <td className="px-4 py-2.5 text-body-sm font-medium text-ink">{plan.name}</td>
      <td className="px-4 py-2.5">
        <input
          type="number"
          min="0"
          step="1"
          value={monthly}
          onChange={(e) => setMonthly(e.target.value)}
          className="w-24 rounded-md border border-sand px-2 py-1 text-body-sm tabular-nums focus:border-gold focus:outline-none"
          aria-label={`${plan.name} monthly price`}
        />
      </td>
      <td className="px-4 py-2.5">
        <input
          type="number"
          min="0"
          step="1"
          value={annual}
          onChange={(e) => setAnnual(e.target.value)}
          placeholder="—"
          className="w-24 rounded-md border border-sand px-2 py-1 text-body-sm tabular-nums focus:border-gold focus:outline-none"
          aria-label={`${plan.name} annual price`}
        />
      </td>
      <td className="px-4 py-2.5">
        <input
          type="number"
          min="0"
          step="1"
          value={shoots}
          onChange={(e) => setShoots(e.target.value)}
          className="w-20 rounded-md border border-sand px-2 py-1 text-body-sm tabular-nums focus:border-gold focus:outline-none"
          aria-label={`${plan.name} included shoots`}
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
