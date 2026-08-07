import { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../../lib/auth";
import { PeriodToggle } from "../components/PeriodToggle";
import { LineChart } from "../components/LineChart";
import { BarChart } from "../components/BarChart";

export const metadata: Metadata = { title: "Analytics — Luna Ops" };

const DAY_MS = 24 * 60 * 60 * 1000;

function pctChange(curr: number, prev: number): number | null {
  if (prev === 0) return null;
  return Math.round(((curr - prev) / prev) * 100);
}

function fmtAED(n: number): string {
  return `AED ${n.toLocaleString("en-AE", { maximumFractionDigits: 0 })}`;
}

function ChangeBadge({ pct }: { pct: number | null }) {
  if (pct === null || pct === 0) return null;
  const up = pct > 0;
  return (
    <span
      className={`text-body-xs font-medium ${up ? "text-sage" : "text-coral"}`}
    >
      {up ? "▲" : "▼"} {Math.abs(pct)}%
    </span>
  );
}

type Props = { searchParams: Promise<{ period?: string }> };

export default async function AnalyticsPage({ searchParams }: Props) {
  const user = await safeCurrentUser();
  if (!user) redirect("/");

  const raw = (await searchParams).period ?? "30";
  const days = ["7", "30", "90"].includes(raw) ? Number(raw) : 30;
  const cutoff = new Date(Date.now() - days * DAY_MS);
  const prevCutoff = new Date(cutoff.getTime() - days * DAY_MS);

  const [orders, prevAgg, newVendors, prevNewVendors, vendorList] =
    await Promise.all([
      prisma.order
        .findMany({
          where: {
            status: { notIn: ["CANCELLED", "REFUNDED"] },
            createdAt: { gte: cutoff },
          },
          select: {
            total: true,
            createdAt: true,
            items: {
              select: {
                vendorId: true,
                unitPrice: true,
                quantity: true,
                variant: {
                  select: { product: { select: { category: true } } },
                },
              },
            },
          },
        })
        .catch(() => []),
      prisma.order
        .aggregate({
          _sum: { total: true },
          _count: true,
          where: {
            status: { notIn: ["CANCELLED", "REFUNDED"] },
            createdAt: { gte: prevCutoff, lt: cutoff },
          },
        })
        .catch(() => ({ _sum: { total: null }, _count: 0 })),
      prisma.vendor
        .count({ where: { createdAt: { gte: cutoff } } })
        .catch(() => 0),
      prisma.vendor
        .count({ where: { createdAt: { gte: prevCutoff, lt: cutoff } } })
        .catch(() => 0),
      prisma.vendor
        .findMany({ select: { id: true, storeName: true } })
        .catch(() => []),
    ]);

  // KPIs
  const gmv = orders.reduce((s, o) => s + Number(o.total), 0);
  const orderCount = orders.length;
  const aov = orderCount === 0 ? 0 : gmv / orderCount;

  const prevGmv = Number(prevAgg._sum.total ?? 0);
  const prevOrders = prevAgg._count;
  const prevAov = prevOrders === 0 ? 0 : prevGmv / prevOrders;

  // Daily GMV series for the line chart
  const series = new Array<number>(days).fill(0);
  for (const o of orders) {
    const idx = Math.floor((o.createdAt.getTime() - cutoff.getTime()) / DAY_MS);
    const clamped = Math.min(Math.max(idx, 0), days - 1);
    // `?? 0` satisfies noUncheckedIndexedAccess (series[clamped] is number | undefined)
    series[clamped] = (series[clamped] ?? 0) + Number(o.total);
  }

  // Top vendors by GMV + GMV by category (item-level attribution)
  const vendorGmv = new Map<string, number>();
  const categoryGmv = new Map<string, number>();
  for (const o of orders) {
    for (const item of o.items) {
      const line = Number(item.unitPrice) * item.quantity;
      vendorGmv.set(item.vendorId, (vendorGmv.get(item.vendorId) ?? 0) + line);
      const category = item.variant.product.category;
      categoryGmv.set(category, (categoryGmv.get(category) ?? 0) + line);
    }
  }

  const nameById = new Map(vendorList.map((v) => [v.id, v.storeName]));
  const topVendors = [...vendorGmv.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, value]) => ({ name: nameById.get(id) ?? "Unknown", value }));
  const topVendorMax = Math.max(...topVendors.map((v) => v.value), 0);

  const categoryBars = [...categoryGmv.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value }));

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="font-display text-display-md text-ink">Analytics</h2>
        <PeriodToggle period={String(days)} />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-lg border border-sand bg-white p-4">
          <p className="text-body-xs text-mist">GMV</p>
          <p className="mt-1 font-display text-display-sm text-ink">{fmtAED(gmv)}</p>
          <ChangeBadge pct={pctChange(gmv, prevGmv)} />
        </div>
        <div className="rounded-lg border border-sand bg-white p-4">
          <p className="text-body-xs text-mist">Orders</p>
          <p className="mt-1 font-display text-display-sm text-ink">
            {orderCount.toLocaleString("en-AE")}
          </p>
          <ChangeBadge pct={pctChange(orderCount, prevOrders)} />
        </div>
        <div className="rounded-lg border border-sand bg-white p-4">
          <p className="text-body-xs text-mist">Avg order value</p>
          <p className="mt-1 font-display text-display-sm text-ink">{fmtAED(aov)}</p>
          <ChangeBadge pct={pctChange(aov, prevAov)} />
        </div>
        <div className="rounded-lg border border-sand bg-white p-4">
          <p className="text-body-xs text-mist">New vendors</p>
          <p className="mt-1 font-display text-display-sm text-ink">{newVendors}</p>
          <ChangeBadge pct={pctChange(newVendors, prevNewVendors)} />
        </div>
      </div>

      {/* GMV line chart */}
      <div className="rounded-lg border border-sand bg-white p-5">
        <p className="mb-3 text-body-xs font-medium uppercase tracking-wide text-mist">
          GMV — last {days} days
        </p>
        <LineChart values={series} />
      </div>

      {/* Top vendors + GMV by category */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-sand bg-white p-5">
          <p className="mb-3 text-body-xs font-medium uppercase tracking-wide text-mist">
            Top vendors by GMV
          </p>
          {topVendors.length === 0 ? (
            <p className="text-body-sm text-mist">No data yet.</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {topVendors.map((v) => (
                <div key={v.name}>
                  <div className="flex justify-between text-body-xs text-ink">
                    <span className="truncate">{v.name}</span>
                    <span className="shrink-0">{fmtAED(v.value)}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-sand">
                    <div
                      className="h-full rounded-full bg-gold"
                      style={{
                        width: `${topVendorMax === 0 ? 0 : Math.round((v.value / topVendorMax) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-sand bg-white p-5">
          <p className="mb-3 text-body-xs font-medium uppercase tracking-wide text-mist">
            GMV by category
          </p>
          <BarChart bars={categoryBars} />
        </div>
      </div>
    </div>
  );
}
