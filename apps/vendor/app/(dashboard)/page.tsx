import { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../lib/auth";
import { getVendorByUserId } from "../lib/vendor";

export const metadata: Metadata = {
  title: "Dashboard — Luna Vendor",
};

type DailyRevenue = { day: string; total: number };

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function buildChart(data: DailyRevenue[]): DailyRevenue[] {
  const days: DailyRevenue[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dayStr = d.toISOString().slice(0, 10);
    const found = data.find((r) => r.day === dayStr);
    days.push({ day: dayStr, total: found?.total ?? 0 });
  }
  return days;
}

export default async function DashboardPage() {
  const user = await safeCurrentUser();
  if (!user) return null; // Layout handles the sign-in redirect

  const vendor = await getVendorByUserId(user.id);
  if (!vendor) return null; // Layout handles the onboarding redirect

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const [revenueItems, orderCount, pendingCount, productCount, lowStock, dailyItems] =
    await Promise.all([
      prisma.orderItem
        .findMany({
          where: {
            vendorId: vendor.id,
            order: {
              createdAt: { gte: thirtyDaysAgo },
              status: { not: "CANCELLED" },
            },
          },
          select: { unitPrice: true, quantity: true },
        })
        .catch(() => []),

      prisma.order
        .count({ where: { items: { some: { vendorId: vendor.id } } } })
        .catch(() => 0),

      prisma.order
        .count({
          where: {
            items: { some: { vendorId: vendor.id } },
            status: "PENDING",
          },
        })
        .catch(() => 0),

      prisma.product
        .count({ where: { vendorId: vendor.id, status: "ACTIVE" } })
        .catch(() => 0),

      prisma.productVariant
        .findMany({
          where: {
            product: { vendorId: vendor.id },
            stock: { lte: 3, gt: 0 },
          },
          include: { product: { select: { title: true } } },
          take: 5,
          orderBy: { stock: "asc" },
        })
        .catch(() => []),

      prisma.orderItem
        .findMany({
          where: {
            vendorId: vendor.id,
            order: {
              createdAt: { gte: sevenDaysAgo },
              status: { not: "CANCELLED" },
            },
          },
          select: {
            unitPrice: true,
            quantity: true,
            order: { select: { createdAt: true } },
          },
        })
        .catch(() => []),
    ]);

  const revenue30d = revenueItems.reduce(
    (sum, item) => sum + Number(item.unitPrice) * item.quantity,
    0
  );

  const dailyMap: Record<string, number> = {};
  for (const item of dailyItems) {
    const day = item.order.createdAt.toISOString().slice(0, 10);
    dailyMap[day] = (dailyMap[day] ?? 0) + Number(item.unitPrice) * item.quantity;
  }
  const dailyData = buildChart(
    Object.entries(dailyMap).map(([day, total]) => ({ day, total }))
  );
  const maxRevenue = Math.max(...dailyData.map((d) => d.total), 1);

  const today = new Date().toLocaleDateString("en-AE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Greeting */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-display-md text-ink">
            {getGreeting()}, {vendor.storeName} ✦
          </h2>
          <p className="text-body-md text-mist">{today}</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-sand bg-ivory p-5">
          <p className="text-body-sm text-mist">Revenue (30d)</p>
          <p className="font-display text-display-md text-gold mt-1">
            AED {revenue30d.toLocaleString("en-AE", { minimumFractionDigits: 0 })}
          </p>
        </div>

        <div className="rounded-2xl border border-sand bg-ivory p-5">
          <p className="text-body-sm text-mist">Total Orders</p>
          <p className="font-display text-display-md text-ink mt-1">{orderCount}</p>
        </div>

        <div
          className={`rounded-2xl border p-5 ${
            pendingCount > 0
              ? "border-coral/50 bg-coral/5"
              : "border-sand bg-ivory"
          }`}
        >
          <p className="text-body-sm text-mist">Pending</p>
          <p
            className={`font-display text-display-md mt-1 ${
              pendingCount > 0 ? "text-coral" : "text-ink"
            }`}
          >
            {pendingCount}
          </p>
          {pendingCount > 0 && (
            <Link
              href="/orders"
              className="text-body-xs text-coral hover:underline"
            >
              View orders →
            </Link>
          )}
        </div>

        <div className="rounded-2xl border border-sand bg-ivory p-5">
          <p className="text-body-sm text-mist">Active Products</p>
          <p className="font-display text-display-md text-ink mt-1">{productCount}</p>
        </div>
      </div>

      {/* Luna AI Alert Strip */}
      {lowStock.length > 0 && (
        <div className="rounded-2xl bg-ink px-5 py-4">
          <p className="text-label text-gold mb-2">✦ LUNA AI — LOW STOCK ALERT</p>
          <div className="space-y-1">
            {lowStock.map((variant) => (
              <div
                key={variant.id}
                className="flex items-center justify-between"
              >
                <p className="text-body-sm text-ivory">
                  {variant.product.title} — {variant.size} · {variant.color}
                </p>
                <span
                  className={`text-body-xs font-medium ${
                    variant.stock <= 1 ? "text-coral" : "text-gold"
                  }`}
                >
                  {variant.stock} left
                </span>
              </div>
            ))}
          </div>
          <Link
            href="/inventory"
            className="mt-3 inline-block text-body-sm text-gold hover:underline"
          >
            Manage inventory →
          </Link>
        </div>
      )}

      {/* 7-Day Revenue Chart */}
      <div className="rounded-2xl border border-sand bg-ivory p-5">
        <p className="text-body-sm font-medium text-ink mb-4">Revenue — last 7 days</p>
        <div className="flex items-end gap-2 h-28">
          {dailyData.map(({ day, total }) => {
            const heightPct = total > 0 ? Math.max((total / maxRevenue) * 100, 8) : 0;
            const label = new Date(day + "T00:00:00").toLocaleDateString("en-AE", {
              weekday: "short",
            });
            return (
              <div
                key={day}
                className="flex flex-1 flex-col items-center gap-1"
              >
                <p className="text-body-xs text-mist">
                  {total > 0 ? `${Math.round(total / 1000)}k` : ""}
                </p>
                <div className="w-full flex items-end" style={{ height: "80px" }}>
                  <div
                    className={`w-full rounded-t-md transition-all ${
                      total > 0 ? "bg-gold" : "bg-sand"
                    }`}
                    style={{ height: `${heightPct}%` }}
                  />
                </div>
                <p className="text-body-xs text-mist">{label}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
