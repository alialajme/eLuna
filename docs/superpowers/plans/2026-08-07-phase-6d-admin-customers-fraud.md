# Phase 6d: Admin Customers + Fraud Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only customers directory (`/customers` list + `/customers/[id]` detail) and a heuristic fraud review queue (`/fraud`) to the admin console — no schema changes.

**Architecture:** Three RSC routes under `apps/admin/app/(dashboard)/` (ADMIN gated by the layout). All read-only — no client components, no server actions, no schema changes. Metrics derive in-memory from existing tables. Reuses established list/detail patterns and the order status-badge map.

**Tech Stack:** Next.js 15 App Router (RSC), Prisma (`@e-luna/db`), Tailwind (Warm Oud tokens).

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `(dashboard)/components/Sidebar.tsx` | Modify | Add Customers + Fraud nav |
| `(dashboard)/components/TopBar.tsx` | Modify | Add page titles + Customer Detail fallback |
| `(dashboard)/customers/page.tsx` | Create | Customer list |
| `(dashboard)/customers/[id]/page.tsx` | Create | Customer detail |
| `(dashboard)/fraud/page.tsx` | Create | Heuristic fraud review queue |

---

## Shared Context

**Working dir:** `/Users/alialajme/Projects/Luna/e-luna`

**DB:** `import { prisma } from "@e-luna/db"`.

**Auth:** ADMIN enforced centrally by `(dashboard)/layout.tsx`. Pages need only a null-user check via `safeCurrentUser()` (from `../../lib/auth`, or `../../../lib/auth` at deeper nesting).

**Next.js 15:** `params` is a Promise — always `await`.

**Verified schema facts:**
- `User`: `id, email, role` — **no name field**.
- `CustomerProfile`: `id, userId, loyaltyPoints (Int), walletBalance (Decimal), createdAt`. Relations: `user`, `sizeProfile?`, `orders[]`, `wishlists[]`, `reviews[]`.
- `Order`: `id, customerId, total (Decimal), status (OrderStatus), createdAt`. Relations: `customer`, `address (has fullName)`, `paymentTransactions[]`.
- `PaymentTransaction`: `status (PaymentStatus)`. FAILED is the value used for the fraud rule.
- `OrderStatus`: PENDING | CONFIRMED | PROCESSING | SHIPPED | DELIVERED | CANCELLED | REFUNDED.

**Decimals** → `Number()` before arithmetic. **`noUncheckedIndexedAccess` is ON** — array index reads are `T | undefined`; use `?? 0` for accumulation, or `!` only where a loop bound guarantees the index.

**Warm Oud tokens:** `text-ink/mist/gold`, `bg-white`, `bg-sand`/`border-sand`, `bg-sage/20 text-sage`, `bg-gold/20 text-gold`, `bg-coral/20 text-coral`, `bg-sand text-mist`. Typography: `font-display`, `text-display-sm/md`, `text-body-xs/sm/md`.

**Order-status badge map (used on customer detail):**
```tsx
const ORDER_STATUS_BADGE: Record<string, string> = {
  DELIVERED: "bg-sage/20 text-sage",
  CONFIRMED: "bg-gold/20 text-gold",
  PROCESSING: "bg-gold/20 text-gold",
  SHIPPED: "bg-gold/20 text-gold",
  PENDING: "bg-sand text-mist",
  CANCELLED: "bg-coral/20 text-coral",
  REFUNDED: "bg-coral/20 text-coral",
};
```

**Lint conventions:** `next/link` `<Link>` for internal nav; escape JSX entities (`&apos;`, `&mdash;`). No raw `<a>`.

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

- [ ] **Step 1: Add nav items to `Sidebar.tsx`**

Read the file. In `NAV_ITEMS`, add after the Analytics item:
```tsx
{ icon: "👥", label: "Customers", href: "/customers" },
{ icon: "🛡️", label: "Fraud", href: "/fraud" },
```

Then replace the existing `isActive` assignment with this expanded version (adds `/customers` and `/fraud` branches before the final fallback):
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
                : href === "/customers"
                  ? pathname === "/customers" || pathname.startsWith("/customers/")
                  : href === "/fraud"
                    ? pathname === "/fraud"
                    : pathname === href;
```

- [ ] **Step 2: Add page titles to `TopBar.tsx`**

Read the file. Add to `PAGE_TITLES`:
```tsx
"/customers": "Customers",
"/fraud": "Fraud",
```

Then extend the fallback chain so `/customers/*` shows "Customer Detail". The current fallback looks like:
```tsx
    pathname.startsWith("/sellers/")
      ? "Seller Detail"
      : pathname.startsWith("/orders/")
        ? "Order Detail"
        : "Luna Ops";
```
Change it to:
```tsx
    pathname.startsWith("/sellers/")
      ? "Seller Detail"
      : pathname.startsWith("/orders/")
        ? "Order Detail"
        : pathname.startsWith("/customers/")
          ? "Customer Detail"
          : "Luna Ops";
```

- [ ] **Step 3: TypeScript + lint check**

```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/admin && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts" | grep -v "\.next/types" | grep -v "packages/auth/src/middleware"
cd /Users/alialajme/Projects/Luna/e-luna/apps/admin && npx next lint 2>&1 | tail -5
```
Expected: tsc empty; lint clean.

- [ ] **Step 4: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git add "apps/admin/app/(dashboard)/components/Sidebar.tsx" "apps/admin/app/(dashboard)/components/TopBar.tsx" && git commit -m "feat: add Customers and Fraud nav to admin sidebar and topbar"
```

---

## Task 2: Customers list — `/customers`

**Files:**
- Create: `apps/admin/app/(dashboard)/customers/page.tsx`

- [ ] **Step 1: Create the customers list page**

```tsx
import { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../../lib/auth";

export const metadata: Metadata = { title: "Customers — Luna Ops" };

function fmtAED(n: number): string {
  return `AED ${n.toLocaleString("en-AE", { maximumFractionDigits: 0 })}`;
}

export default async function CustomersPage() {
  const user = await safeCurrentUser();
  if (!user) redirect("/");

  const [customers, orders] = await Promise.all([
    prisma.customerProfile
      .findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          loyaltyPoints: true,
          walletBalance: true,
          createdAt: true,
          user: { select: { email: true } },
        },
      })
      .catch(() => []),
    prisma.order
      .findMany({
        where: { status: { notIn: ["CANCELLED", "REFUNDED"] } },
        select: { customerId: true, total: true },
      })
      .catch(() => []),
  ]);

  const statsByCustomer = new Map<string, { count: number; spent: number }>();
  for (const o of orders) {
    const prev = statsByCustomer.get(o.customerId) ?? { count: 0, spent: 0 };
    statsByCustomer.set(o.customerId, {
      count: prev.count + 1,
      spent: prev.spent + Number(o.total),
    });
  }

  return (
    <div className="max-w-4xl space-y-5">
      <h2 className="font-display text-display-md text-ink">Customers</h2>

      {customers.length === 0 ? (
        <div className="rounded-lg border border-sand bg-white py-16 text-center">
          <p className="text-body-sm text-mist">No customers yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {customers.map((c) => {
            const stats = statsByCustomer.get(c.id) ?? { count: 0, spent: 0 };
            return (
              <Link
                key={c.id}
                href={`/customers/${c.id}`}
                className="flex items-center gap-4 rounded-lg border border-sand bg-white p-4 transition-colors hover:border-gold"
              >
                <div className="flex-1 min-w-0">
                  <p className="truncate text-body-sm font-medium text-ink">
                    {c.user.email}
                  </p>
                  <p className="text-body-xs text-mist">
                    Joined{" "}
                    {new Date(c.createdAt).toLocaleDateString("en-AE", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <p className="shrink-0 text-body-xs text-mist">
                  {stats.count} order{stats.count === 1 ? "" : "s"}
                </p>
                <p className="shrink-0 text-body-sm font-medium text-ink">
                  {fmtAED(stats.spent)}
                </p>
                <div className="shrink-0 text-right">
                  <p className="text-body-xs text-mist">
                    {c.loyaltyPoints} pts · {fmtAED(Number(c.walletBalance))} wallet
                  </p>
                </div>
                <span className="shrink-0 text-body-sm text-gold">View →</span>
              </Link>
            );
          })}
        </div>
      )}
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
cd /Users/alialajme/Projects/Luna/e-luna && git add "apps/admin/app/(dashboard)/customers/page.tsx" && git commit -m "feat: admin customers list with order count, spend, loyalty, wallet"
```

---

## Task 3: Customer detail — `/customers/[id]`

**Files:**
- Create: `apps/admin/app/(dashboard)/customers/[id]/page.tsx`

- [ ] **Step 1: Create the customer detail page**

```tsx
import { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../../../lib/auth";

type Props = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: "Customer — Luna Ops" };

const ORDER_STATUS_BADGE: Record<string, string> = {
  DELIVERED: "bg-sage/20 text-sage",
  CONFIRMED: "bg-gold/20 text-gold",
  PROCESSING: "bg-gold/20 text-gold",
  SHIPPED: "bg-gold/20 text-gold",
  PENDING: "bg-sand text-mist",
  CANCELLED: "bg-coral/20 text-coral",
  REFUNDED: "bg-coral/20 text-coral",
};

function fmtAED(n: number): string {
  return `AED ${n.toLocaleString("en-AE", { maximumFractionDigits: 0 })}`;
}

function fmtDate(d: Date): string {
  return new Date(d).toLocaleDateString("en-AE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function CustomerDetailPage({ params }: Props) {
  const { id } = await params;

  const user = await safeCurrentUser();
  if (!user) redirect("/");

  const customer = await prisma.customerProfile
    .findUnique({
      where: { id },
      select: {
        id: true,
        loyaltyPoints: true,
        walletBalance: true,
        createdAt: true,
        user: { select: { email: true } },
        sizeProfile: { select: { id: true } },
        _count: { select: { wishlists: true, reviews: true } },
        orders: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            total: true,
            status: true,
            createdAt: true,
            address: { select: { fullName: true } },
          },
        },
      },
    })
    .catch(() => null);

  if (!customer) redirect("/customers");

  const displayName = customer.orders[0]?.address.fullName ?? "Customer";
  const totalSpent = customer.orders
    .filter((o) => o.status !== "CANCELLED" && o.status !== "REFUNDED")
    .reduce((s, o) => s + Number(o.total), 0);

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div>
        <h2 className="font-display text-display-md text-ink">{displayName}</h2>
        <p className="mt-1 text-body-xs text-mist">
          {customer.user.email} · Joined {fmtDate(customer.createdAt)}
        </p>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-sand bg-white p-4">
          <p className="text-body-xs text-mist">Total orders</p>
          <p className="mt-1 font-display text-display-sm text-ink">
            {customer.orders.length}
          </p>
        </div>
        <div className="rounded-lg border border-sand bg-white p-4">
          <p className="text-body-xs text-mist">Total spent</p>
          <p className="mt-1 font-display text-display-sm text-ink">
            {fmtAED(totalSpent)}
          </p>
        </div>
        <div className="rounded-lg border border-sand bg-white p-4">
          <p className="text-body-xs text-mist">Loyalty points</p>
          <p className="mt-1 font-display text-display-sm text-ink">
            {customer.loyaltyPoints}
          </p>
        </div>
        <div className="rounded-lg border border-sand bg-white p-4">
          <p className="text-body-xs text-mist">Wallet</p>
          <p className="mt-1 font-display text-display-sm text-ink">
            {fmtAED(Number(customer.walletBalance))}
          </p>
        </div>
      </div>

      {/* Order history */}
      <div className="rounded-lg border border-sand bg-white p-5">
        <p className="mb-3 text-body-xs font-medium uppercase tracking-wide text-mist">
          Order history
        </p>
        {customer.orders.length === 0 ? (
          <p className="text-body-sm text-mist">No orders yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {customer.orders.map((o) => (
              <Link
                key={o.id}
                href={`/orders/${o.id}`}
                className="flex items-center gap-4 rounded-lg border border-sand p-3 transition-colors hover:border-gold"
              >
                <p className="flex-1 truncate text-body-sm text-ink">
                  #{o.id.slice(-8).toUpperCase()}
                </p>
                <p className="shrink-0 text-body-xs text-mist">
                  {fmtDate(o.createdAt)}
                </p>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-body-xs font-medium ${ORDER_STATUS_BADGE[o.status] ?? "bg-sand text-mist"}`}
                >
                  {o.status.charAt(0) + o.status.slice(1).toLowerCase()}
                </span>
                <p className="shrink-0 text-body-sm font-medium text-ink">
                  {fmtAED(Number(o.total))}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Info row */}
      <p className="text-body-xs text-mist">
        {customer._count.wishlists} wishlist items · {customer._count.reviews}{" "}
        reviews · Size profile {customer.sizeProfile ? "on file" : "not set"}
      </p>
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
cd /Users/alialajme/Projects/Luna/e-luna && git add "apps/admin/app/(dashboard)/customers/[id]/page.tsx" && git commit -m "feat: admin customer detail with stats, order history, profile info"
```

---

## Task 4: Fraud review queue — `/fraud`

**Files:**
- Create: `apps/admin/app/(dashboard)/fraud/page.tsx`

- [ ] **Step 1: Create the fraud page**

```tsx
import { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../../lib/auth";

export const metadata: Metadata = { title: "Fraud — Luna Ops" };

const DAY_MS = 24 * 60 * 60 * 1000;

function fmtAED(n: number): string {
  return `AED ${n.toLocaleString("en-AE", { maximumFractionDigits: 0 })}`;
}

// Customer-level: true if any 3 of the (ascending) timestamps fall within 24h.
function hasRapidRepeat(times: number[]): boolean {
  for (let i = 0; i + 2 < times.length; i++) {
    if (times[i + 2]! - times[i]! <= DAY_MS) return true;
  }
  return false;
}

const REASON_BADGE: Record<string, string> = {
  "Failed payment": "bg-coral/20 text-coral",
  "High value": "bg-gold/20 text-gold",
  "Rapid repeat": "bg-gold/20 text-gold",
};

export default async function FraudPage() {
  const user = await safeCurrentUser();
  if (!user) redirect("/");

  const windowStart = new Date(Date.now() - 90 * DAY_MS);
  const orders = await prisma.order
    .findMany({
      where: { createdAt: { gte: windowStart } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        total: true,
        createdAt: true,
        customerId: true,
        customer: { select: { user: { select: { email: true } } } },
        paymentTransactions: { select: { status: true } },
      },
    })
    .catch(() => []);

  const meanOrderValue =
    orders.length === 0
      ? 0
      : orders.reduce((s, o) => s + Number(o.total), 0) / orders.length;

  // Per-customer ascending timestamps → which customers have a rapid-repeat run.
  const timesByCustomer = new Map<string, number[]>();
  for (const o of orders) {
    const arr = timesByCustomer.get(o.customerId) ?? [];
    arr.push(o.createdAt.getTime());
    timesByCustomer.set(o.customerId, arr);
  }
  const rapidCustomers = new Set<string>();
  for (const [customerId, times] of timesByCustomer) {
    const sorted = [...times].sort((a, b) => a - b);
    if (hasRapidRepeat(sorted)) rapidCustomers.add(customerId);
  }

  const flagged = orders
    .map((o) => {
      const reasons: string[] = [];
      if (o.paymentTransactions.some((t) => t.status === "FAILED")) {
        reasons.push("Failed payment");
      }
      if (meanOrderValue > 0 && Number(o.total) >= 3 * meanOrderValue) {
        reasons.push("High value");
      }
      if (rapidCustomers.has(o.customerId)) {
        reasons.push("Rapid repeat");
      }
      return { ...o, reasons };
    })
    .filter((o) => o.reasons.length > 0);

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-baseline gap-3">
        <h2 className="font-display text-display-md text-ink">Fraud review</h2>
        <span className="text-body-sm text-mist">
          {flagged.length} flagged order{flagged.length === 1 ? "" : "s"}
        </span>
      </div>

      {flagged.length === 0 ? (
        <div className="rounded-lg border border-sand bg-white py-16 text-center">
          <p className="text-body-sm text-mist">
            No flagged orders — nothing suspicious right now.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {flagged.map((o) => (
            <div
              key={o.id}
              className="flex items-center gap-4 rounded-lg border border-sand bg-white p-4"
            >
              <div className="flex-1 min-w-0">
                <p className="truncate text-body-sm font-medium text-ink">
                  #{o.id.slice(-8).toUpperCase()}
                </p>
                <p className="truncate text-body-xs text-mist">
                  {o.customer.user.email}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-1.5">
                {o.reasons.map((r) => (
                  <span
                    key={r}
                    className={`rounded-full px-2 py-0.5 text-body-xs font-medium ${REASON_BADGE[r] ?? "bg-sand text-mist"}`}
                  >
                    {r}
                  </span>
                ))}
              </div>
              <p className="shrink-0 text-body-sm font-medium text-ink">
                {fmtAED(Number(o.total))}
              </p>
              <Link
                href={`/orders/${o.id}`}
                className="shrink-0 text-body-sm text-gold hover:underline"
              >
                View order →
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: TypeScript + lint check**

```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/admin && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts" | grep -v "\.next/types" | grep -v "packages/auth/src/middleware"
cd /Users/alialajme/Projects/Luna/e-luna/apps/admin && npx next lint 2>&1 | tail -5
```
Expected: tsc empty; lint clean. (The `times[i + 2]!` / `times[i]!` non-null assertions are safe because the loop bound `i + 2 < times.length` guarantees both indices exist; `next/core-web-vitals` does not forbid non-null assertions.)

- [ ] **Step 3: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git add "apps/admin/app/(dashboard)/fraud/page.tsx" && git commit -m "feat: admin fraud review queue (failed payment / high value / rapid repeat)"
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
cd /Users/alialajme/Projects/Luna/e-luna && ls "apps/admin/app/(dashboard)/customers/page.tsx" "apps/admin/app/(dashboard)/customers/[id]/page.tsx" "apps/admin/app/(dashboard)/fraud/page.tsx" && git log --oneline -5
```
Expected files present. Expected commits (newest first):
- feat: admin fraud review queue (failed payment / high value / rapid repeat)
- feat: admin customer detail with stats, order history, profile info
- feat: admin customers list with order count, spend, loyalty, wallet
- feat: add Customers and Fraud nav to admin sidebar and topbar

Report the actual SHAs.
