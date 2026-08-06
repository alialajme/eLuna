# Phase 6a: Admin Console — Core Dashboard + Seller Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the bare admin app into a working ops console with a KPI dashboard and full vendor approval/management workflow.

**Architecture:** Mirror the vendor app's `(dashboard)` route-group structure — an RSC layout with Sidebar + TopBar guarding on `safeCurrentUser()` (ADMIN role already enforced by middleware), a dashboard page computing 4 KPIs from existing tables, and a sellers section (list, approvals queue, detail) backed by four status-transition server actions. No schema changes.

**Tech Stack:** Next.js 15 App Router (RSC + server actions), Prisma (`@e-luna/db`), Clerk auth, Tailwind (Warm Oud tokens, sage admin accent).

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/admin/app/page.tsx` | Delete | Old "coming soon" — replaced by `(dashboard)/page.tsx` |
| `apps/admin/app/lib/auth.ts` | Create | `safeCurrentUser()` helper |
| `apps/admin/app/(dashboard)/layout.tsx` | Create | Auth guard + Sidebar + TopBar |
| `apps/admin/app/(dashboard)/components/Sidebar.tsx` | Create | Nav: Overview, Sellers, Approvals |
| `apps/admin/app/(dashboard)/components/TopBar.tsx` | Create | Page-title header |
| `apps/admin/app/(dashboard)/components/StatusFilter.tsx` | Create | Client status-filter pills |
| `apps/admin/app/(dashboard)/components/VendorActions.tsx` | Create | Client status action buttons |
| `apps/admin/app/(dashboard)/page.tsx` | Create | Dashboard — 4 KPI cards |
| `apps/admin/app/(dashboard)/sellers/page.tsx` | Create | Vendor list + status filter |
| `apps/admin/app/(dashboard)/sellers/approvals/page.tsx` | Create | PENDING queue + inline approve/reject |
| `apps/admin/app/(dashboard)/sellers/[id]/page.tsx` | Create | Vendor detail + actions |
| `apps/admin/app/actions/sellers.ts` | Create | approve/reject/suspend/reactivate |

---

## Shared Context

**Working dir:** `/Users/alialajme/Projects/Luna/e-luna`

**DB:** `import { prisma } from "@e-luna/db"`. Enums (`VendorStatus`) import from `@e-luna/db` too (it re-exports `@prisma/client`).

**Auth:** `import { safeCurrentUser } from "../lib/auth"` (path depth varies per file). Admin ADMIN-role enforcement is handled by `apps/admin/middleware.ts` (`createLunaMiddleware("ADMIN")`) — pages/actions only need a null-user check, not a role check.

**Next.js 15:** `params` and `searchParams` are Promises — always `await`.

**Vendor model fields:** `id, userId, storeName, storeSlug, description?, logoUrl?, bannerUrl?, status (VendorStatus), commissionRate (Decimal, default 0.15), ibanNumber?, mfaVerifiedAt?, createdAt, updatedAt`.

**VendorStatus enum:** `PENDING | ACTIVE | SUSPENDED | REJECTED`.

**OrderStatus enum:** `PENDING | CONFIRMED | PROCESSING | SHIPPED | DELIVERED | CANCELLED | REFUNDED`.

**Order fields used:** `total (Decimal)`, `status (OrderStatus)`. **OrderItem fields used:** `vendorId, unitPrice (Decimal), quantity, orderId`.

**Decimals:** Convert with `Number()` before arithmetic.

**Warm Oud tokens:** `text-ink`, `text-mist`, `text-gold`, `bg-ink`, `bg-sand`/`border-sand`, `bg-ivory`, `bg-sage/20 text-sage` (ACTIVE / approve), `bg-gold/20 text-gold` (PENDING), `bg-coral/20 text-coral` (SUSPENDED / reject/suspend), `bg-sand text-mist` (REJECTED). Typography: `font-display`, `text-display-sm/md/lg`, `text-body-xs/sm/md`.

**TypeScript check command (used throughout):**
```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/admin && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts"
```
Expected: empty (no output). Any other error must be fixed.

---

## Task 1: Shared scaffold (auth, layout, Sidebar, TopBar)

**Files:**
- Delete: `apps/admin/app/page.tsx`
- Create: `apps/admin/app/lib/auth.ts`
- Create: `apps/admin/app/(dashboard)/layout.tsx`
- Create: `apps/admin/app/(dashboard)/components/Sidebar.tsx`
- Create: `apps/admin/app/(dashboard)/components/TopBar.tsx`

- [ ] **Step 1: Create `apps/admin/app/lib/auth.ts`**

```ts
import { currentUser } from "@clerk/nextjs/server";
import type { User } from "@clerk/nextjs/server";

export async function safeCurrentUser(): Promise<User | null> {
  try {
    return await currentUser();
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[safeCurrentUser]", err);
    }
    return null;
  }
}
```

- [ ] **Step 2: Create `apps/admin/app/(dashboard)/components/Sidebar.tsx`**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "@clerk/nextjs";

const NAV_ITEMS = [
  { icon: "📊", label: "Overview", href: "/" },
  { icon: "🏬", label: "Sellers", href: "/sellers" },
  { icon: "✅", label: "Approvals", href: "/sellers/approvals" },
] as const;

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-56 shrink-0 flex-col bg-ink min-h-screen">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-white/10">
        <p className="font-display text-display-sm text-sage">✦ Luna</p>
        <p className="text-body-xs text-mist mt-0.5">Ops Console</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map(({ icon, label, href }) => {
          const isActive =
            href === "/"
              ? pathname === "/"
              : href === "/sellers"
                ? pathname === "/sellers" || pathname.startsWith("/sellers/") && pathname !== "/sellers/approvals"
                : pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-body-md transition-colors ${
                isActive
                  ? "bg-sage/20 text-sage"
                  : "text-mist hover:text-ivory hover:bg-white/5"
              }`}
            >
              <span className="text-base">{icon}</span>
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-white/10">
        <SignOutButton>
          <button className="text-body-xs text-mist hover:text-ivory transition-colors">
            Sign out
          </button>
        </SignOutButton>
      </div>
    </aside>
  );
}
```

- [ ] **Step 3: Create `apps/admin/app/(dashboard)/components/TopBar.tsx`**

```tsx
"use client";

import { usePathname } from "next/navigation";

const PAGE_TITLES: Record<string, string> = {
  "/": "Overview",
  "/sellers": "Sellers",
  "/sellers/approvals": "Pending Approvals",
};

export function TopBar() {
  const pathname = usePathname();
  const title =
    PAGE_TITLES[pathname] ??
    (pathname.startsWith("/sellers/") ? "Seller Detail" : "Luna Ops");

  return (
    <header className="flex h-14 items-center justify-between border-b border-sand bg-ivory px-6">
      <h1 className="font-display text-display-sm text-ink">{title}</h1>
      <span className="rounded-full bg-sage/20 px-3 py-1 text-body-sm text-sage">
        Admin
      </span>
    </header>
  );
}
```

- [ ] **Step 4: Create `apps/admin/app/(dashboard)/layout.tsx`**

```tsx
import { safeCurrentUser } from "../lib/auth";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await safeCurrentUser();

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ivory">
        <div className="text-center">
          <p className="font-display text-display-md text-ink mb-4">
            Sign in to access the admin console
          </p>
          <a
            href="/sign-in"
            className="inline-flex rounded-full bg-ink px-6 py-3 text-body-md font-medium text-ivory"
          >
            Sign in
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-ivory">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Delete the old `apps/admin/app/page.tsx`**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && rm apps/admin/app/page.tsx
```

The `(dashboard)/page.tsx` created in Task 2 becomes the new `/` route. (Do not run the tsc check yet — `/` has no page until Task 2, but Next.js only errors on this at build/runtime, and `tsc --noEmit` will pass.)

- [ ] **Step 6: TypeScript check**

```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/admin && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts"
```
Expected: empty.

- [ ] **Step 7: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git add apps/admin/app/lib/auth.ts "apps/admin/app/(dashboard)/layout.tsx" "apps/admin/app/(dashboard)/components/Sidebar.tsx" "apps/admin/app/(dashboard)/components/TopBar.tsx" && git rm apps/admin/app/page.tsx && git commit -m "feat: admin dashboard scaffold — auth, layout, sidebar, topbar"
```

---

## Task 2: Dashboard KPIs — `/`

**Files:**
- Create: `apps/admin/app/(dashboard)/page.tsx`

- [ ] **Step 1: Create the dashboard page**

```tsx
import { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../lib/auth";

export const metadata: Metadata = { title: "Overview — Luna Ops" };

function fmtAED(n: number): string {
  return `AED ${n.toLocaleString("en-AE", { maximumFractionDigits: 0 })}`;
}

export default async function OverviewPage() {
  const user = await safeCurrentUser();
  if (!user) redirect("/");

  const [gmvAgg, orderCount, activeVendors, pendingVendors] = await Promise.all([
    prisma.order
      .aggregate({
        _sum: { total: true },
        where: { status: { notIn: ["CANCELLED", "REFUNDED"] } },
      })
      .catch(() => ({ _sum: { total: null } })),
    prisma.order
      .count({ where: { status: { notIn: ["CANCELLED", "REFUNDED"] } } })
      .catch(() => 0),
    prisma.vendor.count({ where: { status: "ACTIVE" } }).catch(() => 0),
    prisma.vendor.count({ where: { status: "PENDING" } }).catch(() => 0),
  ]);

  const gmv = Number(gmvAgg._sum.total ?? 0);

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h2 className="font-display text-display-md text-ink">Platform Overview</h2>
        <p className="mt-1 text-body-sm text-mist">
          Live snapshot of marketplace activity.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Platform GMV */}
        <div className="rounded-lg border border-sand bg-white p-5">
          <p className="text-body-xs text-mist">Platform GMV</p>
          <p className="mt-1 font-display text-display-sm text-ink">{fmtAED(gmv)}</p>
        </div>

        {/* Total Orders */}
        <div className="rounded-lg border border-sand bg-white p-5">
          <p className="text-body-xs text-mist">Total Orders</p>
          <p className="mt-1 font-display text-display-sm text-ink">
            {orderCount.toLocaleString("en-AE")}
          </p>
        </div>

        {/* Active Vendors */}
        <div className="rounded-lg border border-sand bg-white p-5">
          <p className="text-body-xs text-mist">Active Vendors</p>
          <p className="mt-1 font-display text-display-sm text-ink">{activeVendors}</p>
        </div>

        {/* Pending Approvals */}
        <Link
          href="/sellers/approvals"
          className="rounded-lg border border-sand bg-white p-5 transition-colors hover:border-gold"
        >
          <p className="text-body-xs text-mist">Pending Approvals</p>
          <p className="mt-1 font-display text-display-sm text-gold">{pendingVendors}</p>
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/admin && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts"
```
Expected: empty.

- [ ] **Step 3: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git add "apps/admin/app/(dashboard)/page.tsx" && git commit -m "feat: admin dashboard with 4 platform KPI cards"
```

---

## Task 3: Server actions — `app/actions/sellers.ts`

**Files:**
- Create: `apps/admin/app/actions/sellers.ts`

- [ ] **Step 1: Create the server actions file**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma, type VendorStatus } from "@e-luna/db";
import { safeCurrentUser } from "../lib/auth";

type ActionResult = { success: true } | { error: string };

async function setVendorStatus(
  id: string,
  status: VendorStatus
): Promise<ActionResult> {
  const user = await safeCurrentUser();
  if (!user) return { error: "Unauthorized" };

  try {
    await prisma.vendor.update({ where: { id }, data: { status } });
    revalidatePath("/");
    revalidatePath("/sellers");
    revalidatePath("/sellers/approvals");
    revalidatePath(`/sellers/${id}`);
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Update failed" };
  }
}

export async function approveVendor(id: string): Promise<ActionResult> {
  return setVendorStatus(id, "ACTIVE");
}

export async function rejectVendor(id: string): Promise<ActionResult> {
  return setVendorStatus(id, "REJECTED");
}

export async function suspendVendor(id: string): Promise<ActionResult> {
  return setVendorStatus(id, "SUSPENDED");
}

export async function reactivateVendor(id: string): Promise<ActionResult> {
  return setVendorStatus(id, "ACTIVE");
}
```

**Note on `"use server"`:** Every export in this file is an async function (the four wrappers). `setVendorStatus` is a non-exported helper — allowed. If TypeScript complains that `type VendorStatus` cannot be imported from `@e-luna/db`, change the import to `import { prisma } from "@e-luna/db"; import type { VendorStatus } from "@prisma/client";`.

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/admin && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts"
```
Expected: empty.

- [ ] **Step 3: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git add "apps/admin/app/actions/sellers.ts" && git commit -m "feat: vendor status server actions (approve/reject/suspend/reactivate)"
```

---

## Task 4: VendorActions client component

**Files:**
- Create: `apps/admin/app/(dashboard)/components/VendorActions.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { VendorStatus } from "@e-luna/db";
import {
  approveVendor,
  rejectVendor,
  suspendVendor,
  reactivateVendor,
} from "../../actions/sellers";

type Props = {
  vendorId: string;
  status: VendorStatus;
};

type ActionResult = { success: true } | { error: string };

export function VendorActions({ vendorId, status }: Props) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: (id: string) => Promise<ActionResult>) {
    setIsLoading(true);
    setError(null);
    const result = await action(vendorId);
    if ("error" in result) {
      setError(result.error);
      setIsLoading(false);
      return;
    }
    router.refresh();
    setIsLoading(false);
  }

  const approveBtn =
    "rounded-full bg-sage/20 px-4 py-2 text-body-sm font-medium text-sage hover:bg-sage/30 disabled:opacity-50";
  const dangerBtn =
    "rounded-full bg-coral/20 px-4 py-2 text-body-sm font-medium text-coral hover:bg-coral/30 disabled:opacity-50";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {status === "PENDING" && (
          <>
            <button
              onClick={() => run(approveVendor)}
              disabled={isLoading}
              className={approveBtn}
            >
              Approve
            </button>
            <button
              onClick={() => run(rejectVendor)}
              disabled={isLoading}
              className={dangerBtn}
            >
              Reject
            </button>
          </>
        )}

        {status === "ACTIVE" && (
          <button
            onClick={() => run(suspendVendor)}
            disabled={isLoading}
            className={dangerBtn}
          >
            Suspend
          </button>
        )}

        {status === "SUSPENDED" && (
          <button
            onClick={() => run(reactivateVendor)}
            disabled={isLoading}
            className={approveBtn}
          >
            Reactivate
          </button>
        )}

        {status === "REJECTED" && (
          <button
            onClick={() => run(approveVendor)}
            disabled={isLoading}
            className={approveBtn}
          >
            Approve
          </button>
        )}
      </div>

      {error && <p className="text-body-xs text-coral">{error}</p>}
    </div>
  );
}
```

**Note:** If `import type { VendorStatus } from "@e-luna/db"` errors, use `import type { VendorStatus } from "@prisma/client"`.

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/admin && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts"
```
Expected: empty.

- [ ] **Step 3: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git add "apps/admin/app/(dashboard)/components/VendorActions.tsx" && git commit -m "feat: VendorActions client component with status-aware buttons"
```

---

## Task 5: StatusFilter client component + Sellers list

**Files:**
- Create: `apps/admin/app/(dashboard)/components/StatusFilter.tsx`
- Create: `apps/admin/app/(dashboard)/sellers/page.tsx`

- [ ] **Step 1: Create `StatusFilter.tsx`**

```tsx
"use client";

import { useRouter, usePathname } from "next/navigation";

const FILTERS = [
  { label: "All", value: "all" },
  { label: "Pending", value: "PENDING" },
  { label: "Active", value: "ACTIVE" },
  { label: "Suspended", value: "SUSPENDED" },
  { label: "Rejected", value: "REJECTED" },
] as const;

type Props = { status: string };

export function StatusFilter({ status }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div className="flex flex-wrap gap-1.5">
      {FILTERS.map(({ label, value }) => {
        const active = status === value || (value === "all" && status === "all");
        return (
          <button
            key={value}
            onClick={() =>
              router.push(value === "all" ? pathname : `${pathname}?status=${value}`)
            }
            className={
              active
                ? "rounded-full bg-ink px-4 py-1.5 text-body-xs font-medium text-sage"
                : "rounded-full px-4 py-1.5 text-body-xs text-mist hover:text-ink"
            }
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Create `sellers/page.tsx`**

```tsx
import { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma, type VendorStatus } from "@e-luna/db";
import { safeCurrentUser } from "../../lib/auth";
import { StatusFilter } from "../components/StatusFilter";

export const metadata: Metadata = { title: "Sellers — Luna Ops" };

const STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-gold/20 text-gold",
  ACTIVE: "bg-sage/20 text-sage",
  SUSPENDED: "bg-coral/20 text-coral",
  REJECTED: "bg-sand text-mist",
};

const VALID: VendorStatus[] = ["PENDING", "ACTIVE", "SUSPENDED", "REJECTED"];

type Props = { searchParams: Promise<{ status?: string }> };

export default async function SellersPage({ searchParams }: Props) {
  const user = await safeCurrentUser();
  if (!user) redirect("/");

  const raw = (await searchParams).status ?? "all";
  const where = VALID.includes(raw as VendorStatus)
    ? { status: raw as VendorStatus }
    : {};

  const vendors = await prisma.vendor
    .findMany({ where, orderBy: { createdAt: "desc" } })
    .catch(() => []);

  return (
    <div className="max-w-4xl space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-display-md text-ink">Sellers</h2>
      </div>

      <StatusFilter status={raw} />

      {vendors.length === 0 ? (
        <div className="rounded-lg border border-sand bg-white py-16 text-center">
          <p className="text-body-sm text-mist">No vendors found for this filter.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {vendors.map((v) => (
            <Link
              key={v.id}
              href={`/sellers/${v.id}`}
              className="flex items-center gap-4 rounded-lg border border-sand bg-white p-4 transition-colors hover:border-gold"
            >
              <div className="flex-1 min-w-0">
                <p className="truncate text-body-sm font-medium text-ink">
                  {v.storeName}
                </p>
                <p className="text-body-xs text-mist">@{v.storeSlug}</p>
              </div>
              <p className="shrink-0 text-body-xs text-mist">
                {new Date(v.createdAt).toLocaleDateString("en-AE", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-body-xs font-medium ${STATUS_BADGE[v.status] ?? "bg-sand text-mist"}`}
              >
                {v.status.charAt(0) + v.status.slice(1).toLowerCase()}
              </span>
              <span className="shrink-0 text-body-sm text-gold">View →</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: TypeScript check**

```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/admin && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts"
```
Expected: empty.

- [ ] **Step 4: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git add "apps/admin/app/(dashboard)/components/StatusFilter.tsx" "apps/admin/app/(dashboard)/sellers/page.tsx" && git commit -m "feat: sellers list page with status filter"
```

---

## Task 6: Approvals queue — `/sellers/approvals`

**Files:**
- Create: `apps/admin/app/(dashboard)/sellers/approvals/page.tsx`

- [ ] **Step 1: Create the approvals page**

```tsx
import { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../../../lib/auth";
import { VendorActions } from "../../components/VendorActions";

export const metadata: Metadata = { title: "Pending Approvals — Luna Ops" };

export default async function ApprovalsPage() {
  const user = await safeCurrentUser();
  if (!user) redirect("/");

  const pending = await prisma.vendor
    .findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" } })
    .catch(() => []);

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-baseline gap-3">
        <h2 className="font-display text-display-md text-ink">Pending Approvals</h2>
        <span className="text-body-sm text-mist">{pending.length} waiting</span>
      </div>

      {pending.length === 0 ? (
        <div className="rounded-lg border border-sand bg-white py-16 text-center">
          <p className="text-body-sm text-mist">
            No pending approvals — you&apos;re all caught up.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {pending.map((v) => (
            <div
              key={v.id}
              className="rounded-lg border border-sand bg-white p-5"
            >
              <div className="mb-3 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-body-md font-medium text-ink">{v.storeName}</p>
                  <p className="text-body-xs text-mist">@{v.storeSlug}</p>
                </div>
                <p className="shrink-0 text-body-xs text-mist">
                  {new Date(v.createdAt).toLocaleDateString("en-AE", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              </div>

              {v.description && (
                <p className="mb-3 text-body-sm text-mist">{v.description}</p>
              )}

              <div className="mb-4 flex flex-wrap gap-2">
                <span className="rounded-full bg-sand px-2 py-0.5 text-body-xs text-ink">
                  {v.ibanNumber ? "IBAN on file" : "No IBAN"}
                </span>
                <span className="rounded-full bg-sand px-2 py-0.5 text-body-xs text-ink">
                  {v.mfaVerifiedAt ? "MFA verified" : "MFA pending"}
                </span>
              </div>

              <VendorActions vendorId={v.id} status={v.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/admin && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts"
```
Expected: empty.

- [ ] **Step 3: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git add "apps/admin/app/(dashboard)/sellers/approvals/page.tsx" && git commit -m "feat: pending approvals queue with inline approve/reject"
```

---

## Task 7: Seller detail — `/sellers/[id]`

**Files:**
- Create: `apps/admin/app/(dashboard)/sellers/[id]/page.tsx`

- [ ] **Step 1: Create the detail page**

```tsx
import { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../../../lib/auth";
import { VendorActions } from "../../components/VendorActions";

type Props = { params: Promise<{ id: string }> };

const STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-gold/20 text-gold",
  ACTIVE: "bg-sage/20 text-sage",
  SUSPENDED: "bg-coral/20 text-coral",
  REJECTED: "bg-sand text-mist",
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const vendor = await prisma.vendor
    .findUnique({ where: { id }, select: { storeName: true } })
    .catch(() => null);
  return { title: `${vendor?.storeName ?? "Seller"} — Luna Ops` };
}

function maskIban(iban: string): string {
  if (iban.length <= 8) return iban;
  return iban.slice(0, 4) + "···" + iban.slice(-4);
}

function fmtAED(n: number): string {
  return `AED ${n.toLocaleString("en-AE", { maximumFractionDigits: 0 })}`;
}

export default async function SellerDetailPage({ params }: Props) {
  const { id } = await params;

  const user = await safeCurrentUser();
  if (!user) redirect("/");

  const vendor = await prisma.vendor.findUnique({ where: { id } }).catch(() => null);
  if (!vendor) redirect("/sellers");

  const orderItems = await prisma.orderItem
    .findMany({
      where: { vendorId: id },
      select: { unitPrice: true, quantity: true, orderId: true },
    })
    .catch(() => []);

  const vendorGmv = orderItems.reduce(
    (s, i) => s + Number(i.unitPrice) * i.quantity,
    0
  );
  const vendorOrderCount = new Set(orderItems.map((i) => i.orderId)).size;

  const statusLabel =
    vendor.status.charAt(0) + vendor.status.slice(1).toLowerCase();

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-sand">
            {vendor.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={vendor.logoUrl}
                alt={vendor.storeName}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="font-display text-display-sm text-mist">
                {vendor.storeName.charAt(0)}
              </span>
            )}
          </div>
          <div>
            <h2 className="font-display text-display-md text-ink">
              {vendor.storeName}
            </h2>
            <p className="text-body-xs text-mist">@{vendor.storeSlug}</p>
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-body-sm font-medium ${STATUS_BADGE[vendor.status] ?? "bg-sand text-mist"}`}
        >
          {statusLabel}
        </span>
      </div>

      {/* Actions */}
      <div className="rounded-lg border border-sand bg-white p-4">
        <p className="mb-3 text-body-xs font-medium uppercase tracking-wide text-mist">
          Actions
        </p>
        <VendorActions vendorId={vendor.id} status={vendor.status} />
      </div>

      {/* Info grid */}
      <div className="rounded-lg border border-sand bg-white p-5">
        <p className="mb-3 text-body-xs font-medium uppercase tracking-wide text-mist">
          Store details
        </p>
        <dl className="grid grid-cols-1 gap-y-3 sm:grid-cols-2">
          <div>
            <dt className="text-body-xs text-mist">Description</dt>
            <dd className="text-body-sm text-ink">
              {vendor.description ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-body-xs text-mist">IBAN</dt>
            <dd className="text-body-sm text-ink">
              {vendor.ibanNumber ? maskIban(vendor.ibanNumber) : "Not provided"}
            </dd>
          </div>
          <div>
            <dt className="text-body-xs text-mist">Commission rate</dt>
            <dd className="text-body-sm text-ink">
              {Math.round(Number(vendor.commissionRate) * 100)}%
            </dd>
          </div>
          <div>
            <dt className="text-body-xs text-mist">MFA verified</dt>
            <dd className="text-body-sm text-ink">
              {vendor.mfaVerifiedAt
                ? new Date(vendor.mfaVerifiedAt).toLocaleDateString("en-AE", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })
                : "Pending"}
            </dd>
          </div>
          <div>
            <dt className="text-body-xs text-mist">Joined</dt>
            <dd className="text-body-sm text-ink">
              {new Date(vendor.createdAt).toLocaleDateString("en-AE", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </dd>
          </div>
        </dl>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-sand bg-white p-5">
          <p className="text-body-xs text-mist">Total Orders</p>
          <p className="mt-1 font-display text-display-sm text-ink">
            {vendorOrderCount}
          </p>
        </div>
        <div className="rounded-lg border border-sand bg-white p-5">
          <p className="text-body-xs text-mist">Vendor GMV</p>
          <p className="mt-1 font-display text-display-sm text-ink">
            {fmtAED(vendorGmv)}
          </p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/admin && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts"
```
Expected: empty.

- [ ] **Step 3: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git add "apps/admin/app/(dashboard)/sellers/[id]/page.tsx" && git commit -m "feat: seller detail page with masked IBAN, stats, and status actions"
```

---

## Task 8: Final verification

**Files:** None (verification only)

- [ ] **Step 1: Full TypeScript check**

```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/admin && npx tsc --noEmit 2>&1
```
Expected: only the known `tailwind.config.ts` module-resolution error (if present). Any other error must be fixed before proceeding.

- [ ] **Step 2: Confirm route files exist**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && find "apps/admin/app/(dashboard)" -name "*.tsx" | sort && ls apps/admin/app/lib/auth.ts apps/admin/app/actions/sellers.ts && test ! -f apps/admin/app/page.tsx && echo "old page.tsx removed"
```
Expected: all 8 `(dashboard)` tsx files, the two lib/action files, and "old page.tsx removed".

- [ ] **Step 3: Confirm git log**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git log --oneline -8
```
Expected commits (newest first):
- feat: seller detail page with masked IBAN, stats, and status actions
- feat: pending approvals queue with inline approve/reject
- feat: sellers list page with status filter
- feat: VendorActions client component with status-aware buttons
- feat: vendor status server actions (approve/reject/suspend/reactivate)
- feat: admin dashboard with 4 platform KPI cards
- feat: admin dashboard scaffold — auth, layout, sidebar, topbar
- (previous Phase 6a spec commit)

Report the actual SHAs.
