import { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  getStudioMetrics,
  getDailyGenerationVolume,
  getTopVendorsByConsumption,
  getSubscriptionDistribution,
} from "@ayvana/db";
import { safeCurrentUser } from "../../lib/auth";
import { PeriodToggle } from "../components/PeriodToggle";
import { LineChart } from "../components/LineChart";
import { BarChart } from "../components/BarChart";

export const metadata: Metadata = { title: "AI Studio — AYVANA Ops" };

const fmtAED = (n: number) => `AED ${n.toLocaleString("en-AE", { maximumFractionDigits: 0 })}`;
const fmtUSD = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

type Props = { searchParams: Promise<{ period?: string }> };

// Admin AI-Studio monitoring dashboard (§25). ADMIN gate: the (dashboard) layout
// role-gates all child routes; `safeCurrentUser` here mirrors the sibling
// analytics page (defense-in-depth with the layout + per-action getAuthUser).
export default async function AiStudioPage({ searchParams }: Props) {
  const user = await safeCurrentUser();
  if (!user) redirect("/");

  const raw = (await searchParams).period ?? "30";
  const days = ["7", "30", "90"].includes(raw) ? Number(raw) : 30;

  const [metrics, volume, topVendors, distribution] = await Promise.all([
    getStudioMetrics(days),
    getDailyGenerationVolume(days),
    getTopVendorsByConsumption(days),
    getSubscriptionDistribution(),
  ]);

  const revenuePerShoot = metrics.shootsConsumed > 0 ? Number(metrics.revenue) / metrics.shootsConsumed : 0;
  const costPerShoot = metrics.shootsConsumed > 0 ? Number(metrics.variableCost) / metrics.shootsConsumed : 0;
  const marginHealthy = metrics.grossMarginPct >= 60;
  const topVendorMax = Math.max(...topVendors.map((v) => v.shoots), 0);

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-display-md text-ink">AI Studio</h2>
          <p className="mt-1 text-body-sm text-mist">Generation, billing, cost and margin.</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/ai-studio/plans"
            className="rounded-md border border-sand px-3 py-1.5 text-body-xs font-medium text-ink transition-colors hover:border-gold/60"
          >
            Plans &amp; packs
          </Link>
          <Link
            href="/ai-studio/review"
            className="rounded-md border border-sand px-3 py-1.5 text-body-xs font-medium text-ink transition-colors hover:border-gold/60"
          >
            Review queue{metrics.reviewQueue > 0 ? ` · ${metrics.reviewQueue}` : ""}
          </Link>
          <PeriodToggle period={String(days)} />
        </div>
      </div>

      {/* Revenue / margin KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Studio revenue" value={fmtAED(Number(metrics.revenue))} sub="allocated to shoots" />
        <Kpi label="Subscription MRR" value={fmtAED(Number(metrics.mrr))} sub={`${metrics.subscribers} subscribers`} />
        <Kpi label="AI cost" value={fmtUSD(Number(metrics.variableCost))} sub="variable, in-period" />
        <Kpi
          label="Gross margin"
          value={`${metrics.grossMarginPct}%`}
          sub={fmtAED(Number(metrics.grossContribution)) + " contribution"}
          tone={marginHealthy ? "sage" : "coral"}
        />
      </div>

      {/* Shoot economics */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Shoots consumed" value={metrics.shootsConsumed.toLocaleString("en-AE")} sub="delivered in-period" />
        <Kpi label="Shoots remaining" value={metrics.shootsRemaining.toLocaleString("en-AE")} sub={`${metrics.shootsReserved} reserved`} />
        <Kpi label="Revenue / shoot" value={fmtAED(revenuePerShoot)} sub="allocated" />
        <Kpi label="Cost / shoot" value={fmtUSD(costPerShoot)} sub="variable" />
      </div>

      {/* Reliability */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Generations" value={metrics.generationTotal.toLocaleString("en-AE")} sub="started in-period" />
        <Kpi
          label="Success rate"
          value={`${metrics.successRatePct}%`}
          sub={`${metrics.generationCompleted} completed`}
          tone={metrics.successRatePct >= 90 ? "sage" : metrics.successRatePct > 0 ? "coral" : "ink"}
        />
        <Kpi label="Failed jobs" value={metrics.generationFailed.toLocaleString("en-AE")} sub="credits released" tone={metrics.generationFailed > 0 ? "coral" : "ink"} />
        <Kpi label="Review queue" value={metrics.reviewQueue.toLocaleString("en-AE")} sub="awaiting review" tone={metrics.reviewQueue > 0 ? "gold" : "ink"} />
      </div>

      {/* Generation volume line */}
      <div className="rounded-lg border border-sand bg-white p-5">
        <p className="mb-3 text-body-xs font-medium uppercase tracking-wide text-mist">
          Generation volume — last {days} days
        </p>
        <LineChart values={volume} />
      </div>

      {/* Revenue split + distribution + top sellers */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-sand bg-white p-5">
          <p className="mb-3 text-body-xs font-medium uppercase tracking-wide text-mist">Revenue by source</p>
          <BarChart
            bars={[
              { label: "Subscriptions", value: Number(metrics.subscriptionRevenue) },
              { label: "Shoot packs", value: Number(metrics.packRevenue) },
            ]}
          />
        </div>

        <div className="rounded-lg border border-sand bg-white p-5">
          <p className="mb-3 text-body-xs font-medium uppercase tracking-wide text-mist">Subscription distribution</p>
          {distribution.length === 0 ? (
            <p className="text-body-sm text-mist">No active subscriptions yet.</p>
          ) : (
            <BarChart bars={distribution} />
          )}
        </div>
      </div>

      {/* Top sellers by consumption */}
      <div className="rounded-lg border border-sand bg-white p-5">
        <p className="mb-3 text-body-xs font-medium uppercase tracking-wide text-mist">Top sellers by shoots consumed</p>
        {topVendors.length === 0 ? (
          <p className="text-body-sm text-mist">No shoots consumed in this period.</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {topVendors.map((v) => (
              <div key={v.vendorId}>
                <div className="flex justify-between text-body-xs text-ink">
                  <span className="truncate">{v.storeName}</span>
                  <span className="shrink-0 tabular-nums">{v.shoots} shoots</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-sand">
                  <div
                    className="h-full rounded-full bg-gold"
                    style={{ width: `${topVendorMax === 0 ? 0 : Math.round((v.shoots / topVendorMax) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  tone = "ink",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "ink" | "sage" | "coral" | "gold";
}) {
  const toneClass =
    tone === "sage" ? "text-sage" : tone === "coral" ? "text-coral" : tone === "gold" ? "text-gold" : "text-ink";
  return (
    <div className="rounded-lg border border-sand bg-white p-4">
      <p className="text-body-xs text-mist">{label}</p>
      <p className={`mt-1 font-display text-display-sm tabular-nums ${toneClass}`}>{value}</p>
      {sub && <p className="mt-0.5 text-body-xs text-mist">{sub}</p>}
    </div>
  );
}
