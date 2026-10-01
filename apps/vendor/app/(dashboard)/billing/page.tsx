import { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  ensureWallet,
  getSubscription,
  listPlans,
  listPackages,
  listCreditTransactions,
} from "@ayvana/db";
import { safeCurrentUser } from "../../lib/auth";
import { getVendorByUserId } from "../../lib/vendor";
import { PlanPicker } from "./components/PlanPicker";
import { PackPicker } from "./components/PackPicker";

export const metadata: Metadata = { title: "Billing — AYVANA Studio" };

const TXN_LABEL: Record<string, string> = {
  GRANT: "Plan shoots granted",
  PURCHASE: "Pack purchased",
  RESERVE: "Shoot reserved",
  CONSUME: "Shoot used",
  RELEASE: "Shoot released",
  EXPIRE: "Credits expired",
  ADJUST: "Adjustment",
  ROLLOVER: "Rolled over",
};

const dateFmt = (d: Date) =>
  new Date(d).toLocaleDateString("en-AE", { day: "numeric", month: "short", year: "numeric" });

export default async function BillingPage() {
  const user = await safeCurrentUser();
  if (!user) redirect("/");
  const vendor = await getVendorByUserId(user.id);
  if (!vendor) redirect("/");

  const [wallet, subscription, plans, packs, txns] = await Promise.all([
    ensureWallet(vendor.id),
    getSubscription(vendor.id),
    listPlans({ activeOnly: true }),
    listPackages({ activeOnly: true }),
    listCreditTransactions(vendor.id, 12),
  ]);

  const available = Number(wallet.available);
  const reserved = Number(wallet.reserved);
  const consumed = Number(wallet.lifetimeConsumed);
  const lapsed = subscription?.expired ?? false;

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h2 className="font-display text-display-md text-ink">Billing</h2>
        <p className="mt-1 text-body-sm text-mist">
          Manage your AYVANA Studio plan and AI Shoots. One shoot produces four on-model views and a turntable.
        </p>
      </div>

      {/* Current state: shoots + plan */}
      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-gold/40 bg-gold/5 p-5 sm:col-span-1">
          <p className="text-body-xs font-medium uppercase tracking-wide text-mist">AI Shoots available</p>
          <p className="mt-2 font-display text-display-lg text-gold tabular-nums">{available}</p>
          <p className="mt-1 text-body-xs text-mist">
            {reserved > 0 ? `${reserved} in progress · ` : ""}
            {consumed} used all-time
          </p>
        </div>
        <div className="rounded-lg border border-sand bg-white p-5 sm:col-span-2">
          <p className="text-body-xs font-medium uppercase tracking-wide text-mist">Current plan</p>
          {subscription ? (
            <>
              <p className="mt-2 font-display text-display-sm text-ink">{subscription.planName}</p>
              <p className="mt-1 text-body-sm text-mist">
                {subscription.includedShoots} shoots / {subscription.billingCycle.toLowerCase()} ·{" "}
                {lapsed ? (
                  <span className="text-coral">
                    Lapsed {dateFmt(subscription.currentPeriodEnd)} — renew to restore included shoots
                  </span>
                ) : (
                  <>Renews {dateFmt(subscription.currentPeriodEnd)}</>
                )}
              </p>
            </>
          ) : (
            <>
              <p className="mt-2 font-display text-display-sm text-ink">No active plan</p>
              <p className="mt-1 text-body-sm text-mist">
                Choose a plan below to get monthly included shoots, or buy a one-off pack.
              </p>
            </>
          )}
        </div>
      </section>

      {/* Plans */}
      <section>
        <h3 className="mb-1 font-display text-display-sm text-ink">Plans</h3>
        <p className="mb-4 text-body-sm text-mist">
          Subscriptions grant included shoots each cycle. Prices exclude 5% VAT.
        </p>
        <PlanPicker plans={plans} currentPlanCode={lapsed ? null : subscription?.planCode ?? null} />
      </section>

      {/* Credit packs */}
      <section>
        <h3 className="mb-1 font-display text-display-sm text-ink">Shoot packs</h3>
        <p className="mb-4 text-body-sm text-mist">
          Top up with extra shoots any time — no subscription required. Prices exclude 5% VAT.
        </p>
        <PackPicker packs={packs} />
      </section>

      {/* Ledger + invoices */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-display-sm text-ink">Recent activity</h3>
          <Link href="/invoices" className="text-body-sm text-gold underline-offset-2 hover:underline">
            View invoices
          </Link>
        </div>
        {txns.length === 0 ? (
          <p className="text-body-sm text-mist">No activity yet. Subscribe or buy a pack to start shooting.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-sand text-left">
                <th className="pb-2 text-body-xs font-medium text-mist">Date</th>
                <th className="pb-2 text-body-xs font-medium text-mist">Activity</th>
                <th className="pb-2 text-right text-body-xs font-medium text-mist">Shoots</th>
                <th className="pb-2 text-right text-body-xs font-medium text-mist">Balance</th>
              </tr>
            </thead>
            <tbody>
              {txns.map((t) => {
                const amt = Number(t.amount);
                return (
                  <tr key={t.id} className="border-b border-sand/50">
                    <td className="py-2.5 pr-3 text-body-sm text-mist">{dateFmt(t.createdAt)}</td>
                    <td className="py-2.5 pr-3 text-body-sm text-ink">{TXN_LABEL[t.type] ?? t.type}</td>
                    <td
                      className={`py-2.5 pr-3 text-right font-medium tabular-nums text-body-sm ${
                        amt > 0 ? "text-sage" : amt < 0 ? "text-ink" : "text-mist"
                      }`}
                    >
                      {amt > 0 ? "+" : ""}
                      {amt}
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-body-sm text-mist">{Number(t.balanceAfter)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
