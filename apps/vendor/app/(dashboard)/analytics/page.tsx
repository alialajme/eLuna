import { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../../lib/auth";
import { getVendorByUserId } from "../../lib/vendor";
import { PeriodToggle } from "./components/PeriodToggle";

export const metadata: Metadata = { title: "Analytics — Luna Vendor" };

function pctChange(curr: number, prev: number): number | null {
  if (prev === 0) return null;
  return Math.round(((curr - prev) / prev) * 100);
}

type Props = { searchParams: Promise<{ period?: string }> };

export default async function AnalyticsPage({ searchParams }: Props) {
  const user = await safeCurrentUser();
  if (!user) redirect("/");

  const vendor = await getVendorByUserId(user.id);
  if (!vendor) redirect("/");

  const raw = (await searchParams).period ?? "30";
  const days = ["7", "30", "90"].includes(raw) ? Number(raw) : 30;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const prevCutoff = new Date(cutoff.getTime() - days * 24 * 60 * 60 * 1000);

  const [items, prevItems] = await Promise.all([
    prisma.orderItem
      .findMany({
        where: {
          vendorId: vendor.id,
          order: { createdAt: { gte: cutoff } },
        },
        include: {
          order: { select: { id: true } },
          variant: { include: { product: { select: { title: true } } } },
        },
      })
      .catch(() => []),
    prisma.orderItem
      .findMany({
        where: {
          vendorId: vendor.id,
          order: { createdAt: { gte: prevCutoff, lt: cutoff } },
        },
        select: { unitPrice: true, quantity: true, orderId: true },
      })
      .catch(() => []),
  ]);

  const totalRevenue = items.reduce(
    (s, i) => s + Number(i.unitPrice) * i.quantity,
    0
  );
  const orderCount = new Set(items.map((i) => i.order.id)).size;
  const unitsSold = items.reduce((s, i) => s + i.quantity, 0);

  const prevRevenue = prevItems.reduce(
    (s, i) => s + Number(i.unitPrice) * i.quantity,
    0
  );
  const prevOrderCount = new Set(prevItems.map((i) => i.orderId)).size;
  const prevUnitsSold = prevItems.reduce((s, i) => s + i.quantity, 0);

  const productMap = new Map<string, { units: number; revenue: number }>();
  for (const item of items) {
    const title = item.variant.product.title;
    const existing = productMap.get(title) ?? { units: 0, revenue: 0 };
    productMap.set(title, {
      units: existing.units + item.quantity,
      revenue: existing.revenue + Number(item.unitPrice) * item.quantity,
    });
  }
  const topProducts = [...productMap.entries()]
    .map(([title, stats]) => ({ title, ...stats }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const kpis = [
    {
      label: "Total Revenue",
      value: `AED ${totalRevenue.toLocaleString("en-AE")}`,
      pct: pctChange(totalRevenue, prevRevenue),
    },
    {
      label: "Orders",
      value: orderCount.toString(),
      pct: pctChange(orderCount, prevOrderCount),
    },
    {
      label: "Units Sold",
      value: unitsSold.toString(),
      pct: pctChange(unitsSold, prevUnitsSold),
    },
  ];

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-display-md text-ink">Analytics</h2>
        <PeriodToggle period={days.toString()} />
      </div>

      <div className="grid grid-cols-3 gap-4">
        {kpis.map(({ label, value, pct }) => (
          <div
            key={label}
            className="rounded-lg border border-sand bg-white p-4"
          >
            <p className="mb-2 text-body-xs uppercase tracking-wide text-mist">
              {label}
            </p>
            <p className="mb-1 font-display text-display-sm text-ink">
              {value}
            </p>
            {pct !== null && (
              <p
                className={
                  pct >= 0 ? "text-body-xs text-sage" : "text-body-xs text-coral"
                }
              >
                {pct >= 0 ? "↑" : "↓"} {Math.abs(pct)}% vs prev period
              </p>
            )}
          </div>
        ))}
      </div>

      <div>
        <p className="mb-3 text-body-sm font-medium text-ink">Top products</p>
        {topProducts.length === 0 ? (
          <p className="text-body-sm text-mist">No orders in this period.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-sand text-left">
                <th className="pb-2 text-body-xs font-medium text-mist">#</th>
                <th className="pb-2 text-body-xs font-medium text-mist">
                  Product
                </th>
                <th className="pb-2 text-body-xs font-medium text-mist">
                  Units
                </th>
                <th className="pb-2 text-body-xs font-medium text-mist">
                  Revenue
                </th>
              </tr>
            </thead>
            <tbody>
              {topProducts.map((p, i) => (
                <tr key={p.title} className="border-b border-sand/50">
                  <td className="py-2.5 pr-3 text-body-sm text-mist">
                    {i + 1}
                  </td>
                  <td className="py-2.5 pr-3 text-body-sm text-ink">
                    {p.title}
                  </td>
                  <td className="py-2.5 pr-3 text-body-sm text-ink">
                    {p.units}
                  </td>
                  <td className="py-2.5 text-body-sm text-ink">
                    AED {p.revenue.toLocaleString("en-AE")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
