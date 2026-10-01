import { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { listPlans, listPackages } from "@ayvana/db";
import { safeCurrentUser } from "../../../lib/auth";
import { PlanRow } from "../components/PlanRow";
import { PackRow } from "../components/PackRow";

export const metadata: Metadata = { title: "Plans & packs — AYVANA Ops" };

// Admin plan/pack management (§25). Edit price / included shoots / limits without
// a deploy — these rows ARE the config the vendor billing UI reads.
export default async function PlansPage() {
  const user = await safeCurrentUser();
  if (!user) redirect("/");

  const [plans, packs] = await Promise.all([listPlans({ activeOnly: false }), listPackages({ activeOnly: false })]);

  return (
    <div className="max-w-4xl space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-display-md text-ink">Plans &amp; packs</h2>
          <p className="mt-1 text-body-sm text-mist">
            Edit pricing and included shoots. Changes apply immediately — no deploy.
          </p>
        </div>
        <Link href="/ai-studio" className="text-body-sm text-gold underline-offset-2 hover:underline">
          Back to dashboard
        </Link>
      </div>

      <section>
        <h3 className="mb-3 font-display text-display-sm text-ink">Subscription plans</h3>
        <div className="overflow-hidden rounded-lg border border-sand bg-white">
          <table className="w-full">
            <thead>
              <tr className="border-b border-sand bg-sand/30 text-left">
                <th className="px-4 py-2.5 text-body-xs font-medium text-mist">Plan</th>
                <th className="px-4 py-2.5 text-body-xs font-medium text-mist">Monthly (AED)</th>
                <th className="px-4 py-2.5 text-body-xs font-medium text-mist">Annual (AED)</th>
                <th className="px-4 py-2.5 text-body-xs font-medium text-mist">Shoots</th>
                <th className="px-4 py-2.5 text-body-xs font-medium text-mist">Active</th>
                <th className="px-4 py-2.5 text-right text-body-xs font-medium text-mist">Edit</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <PlanRow key={p.id} plan={p} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3 className="mb-3 font-display text-display-sm text-ink">Shoot packs</h3>
        <div className="overflow-hidden rounded-lg border border-sand bg-white">
          <table className="w-full">
            <thead>
              <tr className="border-b border-sand bg-sand/30 text-left">
                <th className="px-4 py-2.5 text-body-xs font-medium text-mist">Pack</th>
                <th className="px-4 py-2.5 text-body-xs font-medium text-mist">Shoots</th>
                <th className="px-4 py-2.5 text-body-xs font-medium text-mist">Price (AED)</th>
                <th className="px-4 py-2.5 text-body-xs font-medium text-mist">Active</th>
                <th className="px-4 py-2.5 text-right text-body-xs font-medium text-mist">Edit</th>
              </tr>
            </thead>
            <tbody>
              {packs.map((p) => (
                <PackRow key={p.id} pack={p} />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
