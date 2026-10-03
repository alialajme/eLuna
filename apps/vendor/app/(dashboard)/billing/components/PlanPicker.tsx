"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { subscribeToPlan } from "../../../actions/studio-billing";

type Plan = {
  code: string;
  name: string;
  priceMonthly: number;
  priceAnnual: number | null;
  includedShoots: number;
  maxResolution: string;
};

type Cycle = "MONTHLY" | "ANNUAL";

export function PlanPicker({ plans, currentPlanCode }: { plans: Plan[]; currentPlanCode: string | null }) {
  const router = useRouter();
  const [cycle, setCycle] = useState<Cycle>("MONTHLY");
  const [pending, startTransition] = useTransition();
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const choose = (code: string) => {
    setError(null);
    setBusyCode(code);
    startTransition(async () => {
      const res = await subscribeToPlan(code, cycle);
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
      {/* Billing cycle toggle */}
      <div className="inline-flex rounded-md border border-sand bg-white p-0.5">
        {(["MONTHLY", "ANNUAL"] as const).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCycle(c)}
            aria-pressed={cycle === c}
            className={`rounded-[3px] px-3 py-1 text-body-xs font-medium transition-colors ${
              cycle === c ? "bg-ink text-ivory" : "text-mist hover:text-ink"
            }`}
          >
            {c === "MONTHLY" ? "Monthly" : "Annual · 2 months free"}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => {
          const price = cycle === "ANNUAL" && plan.priceAnnual != null ? plan.priceAnnual : plan.priceMonthly;
          const isCurrent = plan.code === currentPlanCode;
          const busy = busyCode === plan.code && pending;
          return (
            <div
              key={plan.code}
              className={`flex flex-col rounded-lg border bg-white p-5 ${
                isCurrent ? "border-gold ring-1 ring-gold" : "border-sand"
              }`}
            >
              <p className="font-display text-display-sm text-ink">{plan.name}</p>
              <p className="mt-2">
                <span className="font-display text-display-md text-ink tabular-nums">AED {fmt(price)}</span>
                <span className="text-body-xs text-mist"> / {cycle === "ANNUAL" ? "year" : "month"}</span>
              </p>
              <p className="mt-3 text-body-sm text-ink">
                <span className="font-medium">{plan.includedShoots}</span> shoots included
              </p>
              <p className="mt-0.5 text-body-xs text-mist">Up to {plan.maxResolution} resolution</p>

              <button
                type="button"
                onClick={() => choose(plan.code)}
                disabled={isCurrent || busy || pending}
                className={`mt-5 rounded-md px-4 py-2 text-body-sm font-medium transition-colors ${
                  isCurrent
                    ? "cursor-default border border-sand bg-sand/40 text-mist"
                    : "bg-ink text-ivory hover:bg-ink-elevated disabled:opacity-60"
                }`}
              >
                {isCurrent ? "Current plan" : busy ? "Processing…" : currentPlanCode ? "Switch to this plan" : "Subscribe"}
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
