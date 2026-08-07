# Phase 6c-ii: Admin Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a platform analytics dashboard at `/analytics` — period toggle, 4 KPI cards with period-over-period change, a GMV line chart, top vendors by GMV, and GMV by category — using hand-rolled inline-SVG charts with zero new dependencies.

**Architecture:** One RSC route under `apps/admin/app/(dashboard)/` (ADMIN gated by the layout). Charts are pure server components returning inline SVG from numeric props (no `"use client"`, no deps). The only client component is a period toggle. All metrics derive in-memory from a single rich "current period orders" query plus a couple of small comparison queries. No schema changes.

**Tech Stack:** Next.js 15 App Router (RSC + server actions not needed here — read-only), Prisma (`@e-luna/db`), Tailwind (Warm Oud tokens), inline SVG.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `(dashboard)/components/Sidebar.tsx` | Modify | Add Analytics nav |
| `(dashboard)/components/TopBar.tsx` | Modify | Add page title |
| `(dashboard)/components/PeriodToggle.tsx` | Create | Client 7/30/90 pills |
| `(dashboard)/components/LineChart.tsx` | Create | Server SVG line + area |
| `(dashboard)/components/BarChart.tsx` | Create | Server SVG/flex bars |
| `(dashboard)/analytics/page.tsx` | Create | Queries + derivations + render |

---

## Shared Context

**Working dir:** `/Users/alialajme/Projects/Luna/e-luna`

**DB:** `import { prisma } from "@e-luna/db"`.

**Auth:** ADMIN enforced centrally by `(dashboard)/layout.tsx`. Page needs only a null-user check via `safeCurrentUser()` (from `../../lib/auth`).

**Next.js 15:** `searchParams` is a Promise — always `await`.

**Verified schema facts:**
- `Order`: `total (Decimal)`, `status (OrderStatus)`, `createdAt`, `items (OrderItem[])`.
- `OrderItem`: `vendorId, unitPrice (Decimal), quantity`, `variant (ProductVariant)`.
- `ProductVariant` → `product (Product)` → `category (String)`.
- `Vendor`: `id, storeName, createdAt`.
- `OrderStatus` excludes CANCELLED/REFUNDED for GMV.

**Decimals** → `Number()` before arithmetic.

**Warm Oud tokens:** `text-ink/mist/gold`, `bg-ink`, `bg-white`, `bg-sand`/`border-sand`, `bg-gold`, `bg-sage/20 text-sage`, `bg-coral/20 text-coral`, `text-sage`. Literal hex in SVG: gold `#d4a855`, sand `#f0e8d8`. Typography: `font-display`, `text-display-sm/md`, `text-body-xs/sm/md`.

**Lint conventions:** `next/link` `<Link>` for internal nav; escape JSX entities. Charts are inline SVG (no `<img>`).

**Verification commands (run in every task):**
```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/admin && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts" | grep -v "\.next/types" | grep -v "packages/auth/src/middleware"
cd /Users/alialajme/Projects/Luna/e-luna/apps/admin && npx next lint 2>&1 | tail -5
```
tsc expected: empty. lint expected: `✔ No ESLint warnings or errors`.

---

## Task 1: Sidebar + TopBar nav

**Files:**
- Modify: `apps/admin/app/(dashboard)/components/Sidebar.tsx`
- Modify: `apps/admin/app/(dashboard)/components/TopBar.tsx`

- [ ] **Step 1: Add nav item to `Sidebar.tsx`**

Read the file. In `NAV_ITEMS`, add after the Commissions item:
```tsx
{ icon: "📈", label: "Analytics", href: "/analytics" },
```

Then extend the `isActive` computation — replace the existing assignment with (adds the `/analytics` branch before the final fallback):
```tsx
const isActive =
  href === "/"
    ? pathname === "/"
    : href === "/sellers"
      ? (pathname === "/sellers" ||
          (pathname.startsWith("/sellers/") &&
            pathname !== "/sellers/approvals"))
      : href === "/orders"
        ? pathname === "/orders" || pathname.startsWith("/orders/")
        : href === "/products"
          ? pathname === "/products"
          : href === "/payouts"
            ? pathname === "/payouts"
            : href === "/commissions"
              ? pathname === "/commissions"
              : href === "/analytics"
                ? pathname === "/analytics"
                : pathname === href;
```

- [ ] **Step 2: Add page title to `TopBar.tsx`**

Read the file. Add to `PAGE_TITLES`:
```tsx
"/analytics": "Analytics",
```

- [ ] **Step 3: TypeScript + lint check**

```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/admin && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts" | grep -v "\.next/types" | grep -v "packages/auth/src/middleware"
cd /Users/alialajme/Projects/Luna/e-luna/apps/admin && npx next lint 2>&1 | tail -5
```
Expected: tsc empty; lint clean.

- [ ] **Step 4: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git add "apps/admin/app/(dashboard)/components/Sidebar.tsx" "apps/admin/app/(dashboard)/components/TopBar.tsx" && git commit -m "feat: add Analytics nav to admin sidebar and topbar"
```

---

## Task 2: PeriodToggle client component

**Files:**
- Create: `apps/admin/app/(dashboard)/components/PeriodToggle.tsx`

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
              ? "bg-ink px-4 py-1.5 text-body-xs font-medium text-sage"
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

- [ ] **Step 2: TypeScript + lint check**

```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/admin && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts" | grep -v "\.next/types" | grep -v "packages/auth/src/middleware"
cd /Users/alialajme/Projects/Luna/e-luna/apps/admin && npx next lint 2>&1 | tail -5
```
Expected: tsc empty; lint clean.

- [ ] **Step 3: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git add "apps/admin/app/(dashboard)/components/PeriodToggle.tsx" && git commit -m "feat: admin PeriodToggle client component"
```

---

## Task 3: LineChart + BarChart server components

**Files:**
- Create: `apps/admin/app/(dashboard)/components/LineChart.tsx`
- Create: `apps/admin/app/(dashboard)/components/BarChart.tsx`

- [ ] **Step 1: Create `LineChart.tsx`**

```tsx
type Props = { values: number[]; height?: number };

const WIDTH = 600;

export function LineChart({ values, height = 120 }: Props) {
  const max = Math.max(...values, 0);
  const n = values.length;

  // Degenerate cases: no meaningful line — render a flat baseline.
  if (n < 2 || max === 0) {
    return (
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${WIDTH} ${height}`}
        preserveAspectRatio="none"
      >
        <line
          x1="0"
          y1={height - 1}
          x2={WIDTH}
          y2={height - 1}
          stroke="#f0e8d8"
          strokeWidth="2"
        />
      </svg>
    );
  }

  const points = values.map((v, i) => {
    const x = (i / (n - 1)) * WIDTH;
    const y = height - (v / max) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = points.join(" ");
  const area = `${line} ${WIDTH},${height} 0,${height}`;

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${WIDTH} ${height}`}
      preserveAspectRatio="none"
    >
      <polygon points={area} fill="#d4a855" opacity="0.08" />
      <polyline points={line} fill="none" stroke="#d4a855" strokeWidth="2.5" />
    </svg>
  );
}
```

- [ ] **Step 2: Create `BarChart.tsx`**

```tsx
type Props = { bars: { label: string; value: number }[] };

export function BarChart({ bars }: Props) {
  if (bars.length === 0) {
    return <p className="text-body-sm text-mist">No data yet.</p>;
  }

  const max = Math.max(...bars.map((b) => b.value), 0);

  return (
    <div className="flex h-28 items-end gap-3">
      {bars.map((b) => {
        const pct = max === 0 ? 0 : Math.round((b.value / max) * 100);
        return (
          <div key={b.label} className="flex flex-1 flex-col items-center">
            <div className="flex w-full flex-1 items-end">
              <div
                className="w-full rounded-t bg-gold"
                style={{ height: `${pct}%` }}
              />
            </div>
            <p className="mt-1 truncate text-body-xs text-mist">{b.label}</p>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: TypeScript + lint check**

```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/admin && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts" | grep -v "\.next/types" | grep -v "packages/auth/src/middleware"
cd /Users/alialajme/Projects/Luna/e-luna/apps/admin && npx next lint 2>&1 | tail -5
```
Expected: tsc empty; lint clean.

- [ ] **Step 4: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git add "apps/admin/app/(dashboard)/components/LineChart.tsx" "apps/admin/app/(dashboard)/components/BarChart.tsx" && git commit -m "feat: inline-SVG LineChart and BarChart server components"
```

---

## Task 4: Analytics page — `/analytics`

**Files:**
- Create: `apps/admin/app/(dashboard)/analytics/page.tsx`

- [ ] **Step 1: Create the analytics page**

```tsx
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

  // Top vendors by GMV (item-level attribution)
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
```

- [ ] **Step 2: TypeScript + lint check**

```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/admin && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts" | grep -v "\.next/types" | grep -v "packages/auth/src/middleware"
cd /Users/alialajme/Projects/Luna/e-luna/apps/admin && npx next lint 2>&1 | tail -5
```
Expected: tsc empty; lint clean.

- [ ] **Step 3: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git add "apps/admin/app/(dashboard)/analytics/page.tsx" && git commit -m "feat: admin analytics dashboard with KPIs, GMV chart, top vendors, category breakdown"
```

---

## Task 5: Final verification

**Files:** None (verification only)

- [ ] **Step 1: Full repo typecheck (exact CI command)**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && pnpm --filter "@e-luna/*" exec tsc --noEmit; echo "EXIT: $?"
```
Expected: `EXIT: 0`.

- [ ] **Step 2: Full repo lint (exact CI command)**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && pnpm lint 2>&1 | tail -6
```
Expected: `Tasks: 3 successful, 3 total`, admin `✔ No ESLint warnings or errors`.

- [ ] **Step 3: Confirm files + git log**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && ls "apps/admin/app/(dashboard)/analytics/page.tsx" "apps/admin/app/(dashboard)/components/PeriodToggle.tsx" "apps/admin/app/(dashboard)/components/LineChart.tsx" "apps/admin/app/(dashboard)/components/BarChart.tsx" && git log --oneline -5
```
Expected files present. Expected commits (newest first):
- feat: admin analytics dashboard with KPIs, GMV chart, top vendors, category breakdown
- feat: inline-SVG LineChart and BarChart server components
- feat: admin PeriodToggle client component
- feat: add Analytics nav to admin sidebar and topbar

Report the actual SHAs.
