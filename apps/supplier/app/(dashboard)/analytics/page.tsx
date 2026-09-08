import { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../../lib/auth";
import { getSupplierByUserId } from "../../lib/supplier";
import { PeriodToggle } from "./components/PeriodToggle";
import { LineChart } from "./components/LineChart";
import { BarChart } from "./components/BarChart";

export const metadata: Metadata = { title: "Analytics — Luna Supplier" };

function pctChange(curr: number, prev: number): number | null {
  if (prev === 0) return null;
  return Math.round(((curr - prev) / prev) * 100);
}

const aed = (n: number) => `AED ${n.toLocaleString("en-AE")}`;
const DAY = 24 * 60 * 60 * 1000;

type Props = { searchParams: Promise<{ period?: string }> };

export default async function SupplierAnalyticsPage({ searchParams }: Props) {
  const user = await safeCurrentUser();
  if (!user) redirect("/");
  const supplier = await getSupplierByUserId(user.id);
  if (!supplier) redirect("/");

  const raw = (await searchParams).period ?? "30";
  const days = ["7", "30", "90"].includes(raw) ? Number(raw) : 30;
  const cutoff = new Date(Date.now() - days * DAY);
  const prevCutoff = new Date(cutoff.getTime() - days * DAY);

  // Earnings = COMPLETED material orders (aligns with payout `earned`; REFUNDED
  // orders are excluded automatically since they're no longer COMPLETED).
  const [orders, prevOrders, pending] = await Promise.all([
    prisma.materialOrder
      .findMany({
        where: { supplierId: supplier.id, status: "COMPLETED", createdAt: { gte: cutoff } },
        select: { total: true, createdAt: true, items: { select: { materialName: true, quantity: true, unitPrice: true } } },
      })
      .catch(() => []),
    prisma.materialOrder
      .findMany({
        where: { supplierId: supplier.id, status: "COMPLETED", createdAt: { gte: prevCutoff, lt: cutoff } },
        select: { total: true, items: { select: { quantity: true } } },
      })
      .catch(() => []),
    prisma.materialOrder
      .aggregate({
        where: { supplierId: supplier.id, status: "PENDING" },
        _count: true,
        _sum: { total: true },
      })
      .catch(() => ({ _count: 0, _sum: { total: null } })),
  ]);

  const earned = orders.reduce((s, o) => s + Number(o.total), 0);
  const orderCount = orders.length;
  const units = orders.reduce((s, o) => s + o.items.reduce((u, i) => u + i.quantity, 0), 0);

  const prevEarned = prevOrders.reduce((s, o) => s + Number(o.total), 0);
  const prevCount = prevOrders.length;
  const prevUnits = prevOrders.reduce((s, o) => s + o.items.reduce((u, i) => u + i.quantity, 0), 0);

  // Daily earnings series bucketed from `cutoff`.
  const series: number[] = new Array(days).fill(0);
  for (const o of orders) {
    const idx = Math.min(days - 1, Math.max(0, Math.floor((o.createdAt.getTime() - cutoff.getTime()) / DAY)));
    series[idx] = (series[idx] ?? 0) + Number(o.total);
  }

  // Top materials by revenue (item-level, within completed orders).
  const materialMap = new Map<string, { units: number; revenue: number }>();
  for (const o of orders) {
    for (const i of o.items) {
      const existing = materialMap.get(i.materialName) ?? { units: 0, revenue: 0 };
      materialMap.set(i.materialName, {
        units: existing.units + i.quantity,
        revenue: existing.revenue + Number(i.unitPrice) * i.quantity,
      });
    }
  }
  const topMaterials = [...materialMap.entries()]
    .map(([name, stats]) => ({ name, ...stats }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const pendingCount = typeof pending._count === "number" ? pending._count : 0;
  const pendingValue = Number(pending._sum?.total ?? 0);

  const kpis = [
    { label: "Earned (completed)", value: aed(earned), pct: pctChange(earned, prevEarned) },
    { label: "Completed orders", value: orderCount.toString(), pct: pctChange(orderCount, prevCount) },
    { label: "Units sold", value: units.toString(), pct: pctChange(units, prevUnits) },
  ];

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-display-md text-ink">Analytics</h2>
        <PeriodToggle period={days.toString()} />
      </div>

      <div className="grid grid-cols-3 gap-4">
        {kpis.map(({ label, value, pct }) => (
          <div key={label} className="rounded-lg border border-sand bg-white p-4">
            <p className="mb-2 text-body-xs uppercase tracking-wide text-mist">{label}</p>
            <p className="mb-1 font-display text-display-sm text-ink">{value}</p>
            {pct !== null && (
              <p className={pct >= 0 ? "text-body-xs text-sage" : "text-body-xs text-coral"}>
                {pct >= 0 ? "↑" : "↓"} {Math.abs(pct)}% vs prev period
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-sand bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-body-sm font-medium text-ink">Earnings over time</p>
          <p className="text-body-xs text-mist">Last {days} days</p>
        </div>
        <LineChart values={series} />
      </div>

      <div className="rounded-lg border border-sand bg-white p-4">
        <p className="mb-3 text-body-sm font-medium text-ink">Top materials by revenue</p>
        <BarChart bars={topMaterials.map((m) => ({ label: m.name, value: m.revenue }))} />
      </div>

      <div className="rounded-lg border border-sand bg-white p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-body-xs uppercase tracking-wide text-mist">Pending orders</p>
            <p className="mt-1 text-body-sm text-ink">
              {pendingCount} awaiting your response · {aed(pendingValue)}
            </p>
          </div>
        </div>
      </div>

      <div>
        <p className="mb-3 text-body-sm font-medium text-ink">Top materials</p>
        {topMaterials.length === 0 ? (
          <p className="text-body-sm text-mist">No completed orders in this period.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-sand text-left">
                <th className="pb-2 text-body-xs font-medium text-mist">#</th>
                <th className="pb-2 text-body-xs font-medium text-mist">Material</th>
                <th className="pb-2 text-body-xs font-medium text-mist">Units</th>
                <th className="pb-2 text-body-xs font-medium text-mist">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {topMaterials.map((m, i) => (
                <tr key={m.name} className="border-b border-sand/50">
                  <td className="py-2.5 pr-3 text-body-sm text-mist">{i + 1}</td>
                  <td className="py-2.5 pr-3 text-body-sm text-ink">{m.name}</td>
                  <td className="py-2.5 pr-3 text-body-sm text-ink">{m.units}</td>
                  <td className="py-2.5 text-body-sm text-ink">{aed(m.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
