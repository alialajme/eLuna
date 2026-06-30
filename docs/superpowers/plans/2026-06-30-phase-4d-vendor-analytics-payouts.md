# Phase 4d: Vendor Analytics & Payouts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/analytics` and `/payouts` vendor stubs with working read-only pages: KPI cards + top-5 products for a selectable time range, and an earnings summary with full payout history.

**Architecture:** Two RSC pages overwrite existing stubs. Analytics fetches current and previous period `OrderItem` data in the RSC, computes KPIs and top products in memory, and renders a small `PeriodToggle` client component for the 7d/30d/90d switch. Payouts fetches DELIVERED `OrderItem` rows + all `Payout` rows, computes the earnings waterfall (gross → fee → net → paid → available), and renders everything server-side.

**Tech Stack:** Next.js 15 App Router (RSC + "use client"), Prisma (`@e-luna/db`), Clerk via `safeCurrentUser()`, Tailwind CSS (Warm Oud tokens).

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/vendor/app/(dashboard)/analytics/components/PeriodToggle.tsx` | Create | "use client" pill toggle, pushes `?period=N` |
| `apps/vendor/app/(dashboard)/analytics/page.tsx` | Overwrite stub | RSC, period resolution, data fetch, KPI cards, top-5 table |
| `apps/vendor/app/(dashboard)/payouts/page.tsx` | Overwrite stub | RSC, earnings waterfall, payout history table |

---

## Shared Context

**Working directory:** `apps/vendor/` (run all commands from `/Users/alialajme/Projects/Luna/e-luna`)

**Imports used across tasks:**
- Auth: `import { safeCurrentUser } from "../../lib/auth"` (relative from `(dashboard)/analytics/` or `(dashboard)/payouts/`)
- Vendor: `import { getVendorByUserId } from "../../lib/vendor"`
- DB: `import { prisma } from "@e-luna/db"`
- Next: `import { redirect } from "next/navigation"`, `import { Metadata } from "next"`

**`VendorWithStatus` type** (from `app/lib/vendor.ts`) does NOT include `commissionRate`. The payouts page fetches it separately.

**Decimal → number:** All `Prisma.Decimal` fields (`unitPrice`, `amount`, `commissionRate`) must be converted with `Number()` before arithmetic.

**Next.js 15:** `searchParams` is a `Promise` — always `await` it.

**Guard pattern** (every RSC page):
```ts
const user = await safeCurrentUser();
if (!user) redirect("/");
const vendor = await getVendorByUserId(user.id);
if (!vendor) redirect("/");
```

---

## Task 1: PeriodToggle client component

**Files:**
- Create: `apps/vendor/app/(dashboard)/analytics/components/PeriodToggle.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useRouter, usePathname } from "next/navigation";

const PERIODS = [
  { label: "7 days", value: "7" },
  { label: "30 days", value: "30" },
  { label: "90 days", value: "90" },
] as const;

type Props = { period: string };

export function PeriodToggle({ period }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div className="flex overflow-hidden rounded-full border border-sand">
      {PERIODS.map(({ label, value }) => (
        <button
          key={value}
          onClick={() => router.push(`${pathname}?period=${value}`)}
          className={
            period === value
              ? "bg-ink px-4 py-1.5 text-body-xs font-medium text-gold"
              : "px-4 py-1.5 text-body-xs text-mist hover:text-ink"
          }
        >
          {label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/vendor && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts"
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git add "apps/vendor/app/(dashboard)/analytics/components/PeriodToggle.tsx" && git commit -m "feat: PeriodToggle client component for analytics time range"
```

---

## Task 2: Analytics page

**Files:**
- Overwrite: `apps/vendor/app/(dashboard)/analytics/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
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
```

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/vendor && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts"
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git add "apps/vendor/app/(dashboard)/analytics/page.tsx" && git commit -m "feat: analytics page with KPI cards, period toggle, and top-5 products"
```

---

## Task 3: Payouts page

**Files:**
- Overwrite: `apps/vendor/app/(dashboard)/payouts/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
import { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../../lib/auth";
import { getVendorByUserId } from "../../lib/vendor";

export const metadata: Metadata = { title: "Payouts — Luna Vendor" };

function maskIban(iban: string): string {
  return iban.slice(0, 4) + "···" + iban.slice(-4);
}

const STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-sand text-mist",
  PROCESSING: "bg-gold/20 text-gold",
  COMPLETED: "bg-sage/20 text-sage",
  FAILED: "bg-coral/20 text-coral",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending",
  PROCESSING: "Processing",
  COMPLETED: "Completed",
  FAILED: "Failed",
};

export default async function PayoutsPage() {
  const user = await safeCurrentUser();
  if (!user) redirect("/");

  const vendor = await getVendorByUserId(user.id);
  if (!vendor) redirect("/");

  const vendorWithRate = await prisma.vendor
    .findUnique({
      where: { id: vendor.id },
      select: { commissionRate: true },
    })
    .catch(() => null);

  const commissionRate = Number(vendorWithRate?.commissionRate ?? 0.15);
  const commissionPct = Math.round(commissionRate * 100);

  const [items, payouts] = await Promise.all([
    prisma.orderItem
      .findMany({
        where: { vendorId: vendor.id, fulfillmentStatus: "DELIVERED" },
        select: { unitPrice: true, quantity: true },
      })
      .catch(() => []),
    prisma.payout
      .findMany({
        where: { vendorId: vendor.id },
        orderBy: { createdAt: "desc" },
      })
      .catch(() => []),
  ]);

  const grossRevenue = items.reduce(
    (s, i) => s + Number(i.unitPrice) * i.quantity,
    0
  );
  const platformFee = grossRevenue * commissionRate;
  const netEarned = grossRevenue - platformFee;
  const paidOut = payouts
    .filter((p) => p.status === "COMPLETED")
    .reduce((s, p) => s + Number(p.amount), 0);
  const availableBalance = Math.max(0, netEarned - paidOut);

  const fmt = (n: number) =>
    n.toLocaleString("en-AE", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });

  return (
    <div className="max-w-3xl space-y-6">
      <h2 className="font-display text-display-md text-ink">Payouts</h2>

      {/* Earnings summary */}
      <div className="rounded-lg border border-sand bg-white p-5">
        <p className="mb-4 text-body-xs font-medium uppercase tracking-wide text-mist">
          Earnings summary — all time
        </p>
        <div className="grid grid-cols-4 gap-5">
          <div>
            <p className="mb-1 text-body-xs text-mist">Gross revenue</p>
            <p className="font-display text-display-sm text-ink">
              AED {fmt(grossRevenue)}
            </p>
          </div>
          <div>
            <p className="mb-1 text-body-xs text-mist">
              Platform fee ({commissionPct}%)
            </p>
            <p className="font-display text-display-sm text-coral">
              − AED {fmt(platformFee)}
            </p>
          </div>
          <div>
            <p className="mb-1 text-body-xs text-mist">Paid out</p>
            <p className="font-display text-display-sm text-ink">
              AED {fmt(paidOut)}
            </p>
          </div>
          <div className="border-l-2 border-gold pl-5">
            <p className="mb-1 text-body-xs text-mist">Available balance</p>
            <p className="font-display text-display-sm text-gold">
              AED {fmt(availableBalance)}
            </p>
          </div>
        </div>
      </div>

      {/* Payout history */}
      <div>
        <p className="mb-3 text-body-sm font-medium text-ink">
          Payout history
        </p>
        {payouts.length === 0 ? (
          <p className="text-body-sm text-mist">
            No payouts yet. Luna Operations processes payouts bi-monthly.
          </p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-sand text-left">
                <th className="pb-2 text-body-xs font-medium text-mist">
                  Date
                </th>
                <th className="pb-2 text-body-xs font-medium text-mist">
                  Amount
                </th>
                <th className="pb-2 text-body-xs font-medium text-mist">
                  IBAN
                </th>
                <th className="pb-2 text-body-xs font-medium text-mist">
                  Reference
                </th>
                <th className="pb-2 text-body-xs font-medium text-mist">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {payouts.map((p) => (
                <tr key={p.id} className="border-b border-sand/50">
                  <td className="py-2.5 pr-3 text-body-sm text-mist">
                    {new Date(p.createdAt).toLocaleDateString("en-AE", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="py-2.5 pr-3 text-body-sm font-medium text-ink">
                    AED {fmt(Number(p.amount))}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-body-sm text-mist">
                    {maskIban(p.ibanNumber)}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-body-sm text-mist">
                    {p.reference ?? "—"}
                  </td>
                  <td className="py-2.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-body-xs font-medium ${STATUS_BADGE[p.status] ?? "bg-sand text-mist"}`}
                    >
                      {STATUS_LABEL[p.status] ?? p.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-4 text-body-xs text-mist">
          Payouts are processed by Luna Operations. Contact support if a payout
          is overdue.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/vendor && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts"
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git add "apps/vendor/app/(dashboard)/payouts/page.tsx" && git commit -m "feat: payouts page with earnings summary and payout history"
```

---

## Task 4: Final TypeScript check + git log

**Files:** None (verification only)

- [ ] **Step 1: Full TypeScript check**

```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/vendor && npx tsc --noEmit 2>&1
```

Expected output (only this, nothing else):
```
tailwind.config.ts(1,29): error TS2307: Cannot find module 'tailwindcss' or its corresponding type declarations.
```

Any other error must be fixed before proceeding.

- [ ] **Step 2: Confirm git log**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git log --oneline -4
```

Expected (newest first):
- feat: payouts page with earnings summary and payout history
- feat: analytics page with KPI cards, period toggle, and top-5 products
- feat: PeriodToggle client component for analytics time range
- (previous Phase 4c or 4d spec/plan commit)

Report the actual SHAs.
