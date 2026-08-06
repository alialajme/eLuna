# Phase 6b: Admin Console — Orders + Products Moderation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add read-only platform order oversight (`/orders`, `/orders/[id]`) and product-catalog moderation (`/products` with inline Reject/Reinstate) to the admin console.

**Architecture:** Three RSC routes under the existing `apps/admin/app/(dashboard)/` group (which already enforces the ADMIN role in its layout). Reuse the 6a patterns: status-filtered lists, status-badge maps, a hardened `"use server"` actions file, and a client actions component. Generalize the 6a `StatusFilter` to be reusable across sellers/orders/products. No schema changes.

**Tech Stack:** Next.js 15 App Router (RSC + server actions), Prisma (`@e-luna/db`), Clerk auth (`getAuthUser` from `@e-luna/auth`), Tailwind (Warm Oud tokens).

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/admin/app/(dashboard)/components/StatusFilter.tsx` | Modify | Accept `options` prop (generalize) |
| `apps/admin/app/(dashboard)/sellers/page.tsx` | Modify | Pass vendor `options` to StatusFilter |
| `apps/admin/app/(dashboard)/components/Sidebar.tsx` | Modify | Add Orders + Products nav items |
| `apps/admin/app/(dashboard)/components/TopBar.tsx` | Modify | Add page titles |
| `apps/admin/app/(dashboard)/orders/page.tsx` | Create | Orders list + status filter |
| `apps/admin/app/(dashboard)/orders/[id]/page.tsx` | Create | Order detail |
| `apps/admin/app/actions/products.ts` | Create | rejectProduct / reinstateProduct |
| `apps/admin/app/(dashboard)/components/ProductActions.tsx` | Create | Client Reject/Reinstate buttons |
| `apps/admin/app/(dashboard)/products/page.tsx` | Create | Products list + inline moderation |

---

## Shared Context

**Working dir:** `/Users/alialajme/Projects/Luna/e-luna`

**DB:** `import { prisma } from "@e-luna/db"`. Enums (`OrderStatus`, `ProductStatus`) import from `@e-luna/db` (re-exports `@prisma/client`); if a `type` import errors, fall back to `@prisma/client`.

**Auth:** ADMIN role is enforced centrally by `(dashboard)/layout.tsx` (built in 6a) via `getAuthUser()`. Pages only need a null-user check with `safeCurrentUser()` from `../../lib/auth` (or `../../../lib/auth` at deeper nesting). Server actions independently re-check ADMIN via `getAuthUser()`.

**Next.js 15:** `params` and `searchParams` are Promises — always `await`.

**Verified schema facts:**
- `Order`: `id, customerId, addressId, status (OrderStatus), subtotal, discount, shippingFee, total, paymentMethod (PaymentMethod), notes?, createdAt`. Relations: `customer (CustomerProfile)`, `address (Address)`, `items (OrderItem[])`, `shipments (Shipment[])`.
- `OrderItem`: `id, orderId, variantId, vendorId, quantity, unitPrice (Decimal)`. Relation: `variant (ProductVariant)`.
- `ProductVariant`: `id, productId, size, color, sku, stock, price?`. Relation: `product (Product)`.
- `Product`: `id, vendorId, title, slug, description?, price (Decimal), category, aiImages (Json = string[]), status (ProductStatus), createdAt`. Relation: `vendor (Vendor)`.
- `CustomerProfile`: has NO name — `user (User)` relation carries `email`.
- `Address`: `fullName, phone, addressLine1, addressLine2?, city, emirate?, country`.
- `Shipment`: `courier, trackingNumber?, status (ShipmentStatus), estimatedDelivery?, deliveredAt?, cost (Decimal)`.
- `OrderStatus`: `PENDING | CONFIRMED | PROCESSING | SHIPPED | DELIVERED | CANCELLED | REFUNDED`.
- `ProductStatus`: `DRAFT | ACTIVE | ARCHIVED | REJECTED`.
- `PaymentMethod`: `CARD | LUNA_WALLET | TABBY | TAMARA | CASH_ON_DELIVERY`.

**Decimals:** convert with `Number()` before arithmetic.

**Warm Oud tokens:** `text-ink/mist/gold`, `bg-ink`, `bg-sand`/`border-sand`, `bg-white`, `bg-sage/20 text-sage`, `bg-gold/20 text-gold`, `bg-coral/20 text-coral`, `bg-sand text-mist`. Typography: `font-display`, `text-display-sm/md`, `text-body-xs/sm/md`.

**Lint conventions (enforced by CI):** internal navigation uses `next/link` `<Link>` (never raw `<a href>`); escape JSX entities (`&apos;`, `&quot;`); add `// eslint-disable-next-line @next/next/no-img-element` above raw `<img>` tags.

**Verification commands (run in every task):**
```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/admin && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts" | grep -v "\.next/types" | grep -v "packages/auth/src/middleware"
cd /Users/alialajme/Projects/Luna/e-luna/apps/admin && npx next lint 2>&1 | tail -5
```
tsc expected: empty. lint expected: `✔ No ESLint warnings or errors` (or only `<img>` warnings, no errors).

---

## Task 1: Generalize StatusFilter + update sellers page

**Files:**
- Modify: `apps/admin/app/(dashboard)/components/StatusFilter.tsx`
- Modify: `apps/admin/app/(dashboard)/sellers/page.tsx`

- [ ] **Step 1: Rewrite `StatusFilter.tsx` to accept an `options` prop**

Replace the full file with:

```tsx
"use client";

import { useRouter, usePathname } from "next/navigation";

export type FilterOption = { label: string; value: string };

type Props = { status: string; options: FilterOption[] };

export function StatusFilter({ status, options }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(({ label, value }) => {
        const active = status === value;
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

- [ ] **Step 2: Update `sellers/page.tsx` to pass options**

Read the file. Add a `SELLER_FILTERS` constant near the top (after the `STATUS_BADGE` record):

```tsx
const SELLER_FILTERS = [
  { label: "All", value: "all" },
  { label: "Pending", value: "PENDING" },
  { label: "Active", value: "ACTIVE" },
  { label: "Suspended", value: "SUSPENDED" },
  { label: "Rejected", value: "REJECTED" },
];
```

Then change the render from `<StatusFilter status={raw} />` to:

```tsx
<StatusFilter status={raw} options={SELLER_FILTERS} />
```

- [ ] **Step 3: TypeScript + lint check**

```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/admin && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts" | grep -v "\.next/types" | grep -v "packages/auth/src/middleware"
cd /Users/alialajme/Projects/Luna/e-luna/apps/admin && npx next lint 2>&1 | tail -5
```
Expected: tsc empty; lint clean.

- [ ] **Step 4: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git add "apps/admin/app/(dashboard)/components/StatusFilter.tsx" "apps/admin/app/(dashboard)/sellers/page.tsx" && git commit -m "refactor: generalize StatusFilter to accept options prop"
```

---

## Task 2: Sidebar + TopBar nav additions

**Files:**
- Modify: `apps/admin/app/(dashboard)/components/Sidebar.tsx`
- Modify: `apps/admin/app/(dashboard)/components/TopBar.tsx`

- [ ] **Step 1: Add nav items to `Sidebar.tsx`**

Read the file. In the `NAV_ITEMS` array, add two entries after the Approvals item:

```tsx
{ icon: "📋", label: "Orders", href: "/orders" },
{ icon: "🛍️", label: "Products", href: "/products" },
```

Then extend the `isActive` computation so Orders and Products highlight on their sub-routes. Replace the existing `isActive` assignment with:

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
          : pathname === href;
```

- [ ] **Step 2: Add page titles to `TopBar.tsx`**

Read the file. Add to the `PAGE_TITLES` record:

```tsx
"/orders": "Orders",
"/products": "Products",
```

Then update the fallback line so order detail shows "Order Detail". The current fallback is:
```tsx
    (pathname.startsWith("/sellers/") ? "Seller Detail" : "Luna Ops");
```
Change it to:
```tsx
    pathname.startsWith("/sellers/")
      ? "Seller Detail"
      : pathname.startsWith("/orders/")
        ? "Order Detail"
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
cd /Users/alialajme/Projects/Luna/e-luna && git add "apps/admin/app/(dashboard)/components/Sidebar.tsx" "apps/admin/app/(dashboard)/components/TopBar.tsx" && git commit -m "feat: add Orders and Products nav to admin sidebar and topbar"
```

---

## Task 3: Orders list — `/orders`

**Files:**
- Create: `apps/admin/app/(dashboard)/orders/page.tsx`

- [ ] **Step 1: Create the orders list page**

```tsx
import { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma, type OrderStatus } from "@e-luna/db";
import { safeCurrentUser } from "../../lib/auth";
import { StatusFilter } from "../components/StatusFilter";

export const metadata: Metadata = { title: "Orders — Luna Ops" };

const ORDER_STATUS_BADGE: Record<string, string> = {
  DELIVERED: "bg-sage/20 text-sage",
  CONFIRMED: "bg-gold/20 text-gold",
  PROCESSING: "bg-gold/20 text-gold",
  SHIPPED: "bg-gold/20 text-gold",
  PENDING: "bg-sand text-mist",
  CANCELLED: "bg-coral/20 text-coral",
  REFUNDED: "bg-coral/20 text-coral",
};

const ORDER_FILTERS = [
  { label: "All", value: "all" },
  { label: "Pending", value: "PENDING" },
  { label: "Confirmed", value: "CONFIRMED" },
  { label: "Processing", value: "PROCESSING" },
  { label: "Shipped", value: "SHIPPED" },
  { label: "Delivered", value: "DELIVERED" },
  { label: "Cancelled", value: "CANCELLED" },
  { label: "Refunded", value: "REFUNDED" },
];

const VALID: OrderStatus[] = [
  "PENDING",
  "CONFIRMED",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "REFUNDED",
];

type Props = { searchParams: Promise<{ status?: string }> };

export default async function OrdersPage({ searchParams }: Props) {
  const user = await safeCurrentUser();
  if (!user) redirect("/");

  const raw = (await searchParams).status ?? "all";
  const where = VALID.includes(raw as OrderStatus)
    ? { status: raw as OrderStatus }
    : {};

  const orders = await prisma.order
    .findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        address: { select: { fullName: true } },
        items: { select: { id: true } },
      },
    })
    .catch(() => []);

  return (
    <div className="max-w-4xl space-y-5">
      <h2 className="font-display text-display-md text-ink">Orders</h2>

      <StatusFilter status={raw} options={ORDER_FILTERS} />

      {orders.length === 0 ? (
        <div className="rounded-lg border border-sand bg-white py-16 text-center">
          <p className="text-body-sm text-mist">No orders found for this filter.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {orders.map((order) => (
            <Link
              key={order.id}
              href={`/orders/${order.id}`}
              className="flex items-center gap-4 rounded-lg border border-sand bg-white p-4 transition-colors hover:border-gold"
            >
              <div className="flex-1 min-w-0">
                <p className="truncate text-body-sm font-medium text-ink">
                  #{order.id.slice(-8).toUpperCase()}
                </p>
                <p className="text-body-xs text-mist">{order.address.fullName}</p>
              </div>
              <p className="shrink-0 text-body-xs text-mist">
                {order.items.length} item{order.items.length === 1 ? "" : "s"}
              </p>
              <p className="shrink-0 text-body-xs text-mist">
                {new Date(order.createdAt).toLocaleDateString("en-AE", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>
              <p className="shrink-0 text-body-sm font-medium text-ink">
                AED {Number(order.total).toLocaleString("en-AE", { maximumFractionDigits: 0 })}
              </p>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-body-xs font-medium ${ORDER_STATUS_BADGE[order.status] ?? "bg-sand text-mist"}`}
              >
                {order.status.charAt(0) + order.status.slice(1).toLowerCase()}
              </span>
            </Link>
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
Expected: tsc empty; lint clean.

- [ ] **Step 3: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git add "apps/admin/app/(dashboard)/orders/page.tsx" && git commit -m "feat: admin orders list with status filter"
```

---

## Task 4: Order detail — `/orders/[id]`

**Files:**
- Create: `apps/admin/app/(dashboard)/orders/[id]/page.tsx`

- [ ] **Step 1: Create the order detail page**

```tsx
import { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../../../lib/auth";

type Props = { params: Promise<{ id: string }> };

const ORDER_STATUS_BADGE: Record<string, string> = {
  DELIVERED: "bg-sage/20 text-sage",
  CONFIRMED: "bg-gold/20 text-gold",
  PROCESSING: "bg-gold/20 text-gold",
  SHIPPED: "bg-gold/20 text-gold",
  PENDING: "bg-sand text-mist",
  CANCELLED: "bg-coral/20 text-coral",
  REFUNDED: "bg-coral/20 text-coral",
};

const PAYMENT_LABELS: Record<string, string> = {
  CARD: "Card",
  LUNA_WALLET: "Luna Wallet",
  TABBY: "Tabby",
  TAMARA: "Tamara",
  CASH_ON_DELIVERY: "Cash on Delivery",
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: `Order #${id.slice(-8).toUpperCase()} — Luna Ops` };
}

function fmtAED(n: number): string {
  return `AED ${n.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function OrderDetailPage({ params }: Props) {
  const { id } = await params;

  const user = await safeCurrentUser();
  if (!user) redirect("/");

  const order = await prisma.order
    .findUnique({
      where: { id },
      include: {
        address: true,
        customer: { include: { user: { select: { email: true } } } },
        items: {
          include: {
            variant: {
              include: {
                product: {
                  select: { title: true, vendor: { select: { storeName: true } } },
                },
              },
            },
          },
        },
        shipments: true,
      },
    })
    .catch(() => null);

  if (!order) redirect("/orders");

  // Group items by vendor for the per-vendor breakdown
  const vendorTotals = new Map<string, number>();
  for (const item of order.items) {
    const vendorName = item.variant.product.vendor.storeName;
    const line = Number(item.unitPrice) * item.quantity;
    vendorTotals.set(vendorName, (vendorTotals.get(vendorName) ?? 0) + line);
  }

  const statusLabel =
    order.status.charAt(0) + order.status.slice(1).toLowerCase();

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-display-md text-ink">
            Order #{order.id.slice(-8).toUpperCase()}
          </h2>
          <p className="mt-1 text-body-xs text-mist">
            Placed{" "}
            {new Date(order.createdAt).toLocaleDateString("en-AE", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}{" "}
            · {PAYMENT_LABELS[order.paymentMethod] ?? order.paymentMethod}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-body-sm font-medium ${ORDER_STATUS_BADGE[order.status] ?? "bg-sand text-mist"}`}
        >
          {statusLabel}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
        {/* Left: items + per-vendor breakdown */}
        <div className="space-y-5">
          <div className="rounded-lg border border-sand bg-white p-5">
            <p className="mb-3 text-body-xs font-medium uppercase tracking-wide text-mist">
              Items
            </p>
            <div className="flex flex-col gap-3">
              {order.items.map((item) => (
                <div key={item.id} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-body-sm text-ink">
                      {item.variant.product.title}
                    </p>
                    <p className="text-body-xs text-mist">
                      {item.variant.product.vendor.storeName} · {item.variant.size} /{" "}
                      {item.variant.color}
                    </p>
                  </div>
                  <p className="shrink-0 text-body-xs text-mist">×{item.quantity}</p>
                  <p className="shrink-0 text-body-sm text-ink">
                    {fmtAED(Number(item.unitPrice) * item.quantity)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-sand bg-white p-5">
            <p className="mb-3 text-body-xs font-medium uppercase tracking-wide text-mist">
              Per-vendor breakdown
            </p>
            <div className="flex flex-col gap-2">
              {[...vendorTotals.entries()].map(([vendorName, subtotal]) => (
                <div key={vendorName} className="flex items-center justify-between">
                  <p className="text-body-sm text-ink">{vendorName}</p>
                  <p className="text-body-sm text-mist">{fmtAED(subtotal)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: customer, address, totals, shipments */}
        <div className="space-y-5">
          <div className="rounded-lg border border-sand bg-white p-5">
            <p className="mb-2 text-body-xs font-medium uppercase tracking-wide text-mist">
              Customer
            </p>
            <p className="text-body-sm text-ink">{order.address.fullName}</p>
            <p className="text-body-xs text-mist">{order.customer.user.email}</p>
            <p className="text-body-xs text-mist">{order.address.phone}</p>
          </div>

          <div className="rounded-lg border border-sand bg-white p-5">
            <p className="mb-2 text-body-xs font-medium uppercase tracking-wide text-mist">
              Shipping address
            </p>
            <p className="text-body-sm text-ink">{order.address.addressLine1}</p>
            {order.address.addressLine2 && (
              <p className="text-body-sm text-ink">{order.address.addressLine2}</p>
            )}
            <p className="text-body-sm text-ink">
              {order.address.city}
              {order.address.emirate ? `, ${order.address.emirate}` : ""}
            </p>
            <p className="text-body-xs text-mist">{order.address.country}</p>
          </div>

          <div className="rounded-lg border border-sand bg-white p-5">
            <p className="mb-3 text-body-xs font-medium uppercase tracking-wide text-mist">
              Totals
            </p>
            <div className="flex flex-col gap-1.5 text-body-sm">
              <div className="flex justify-between">
                <span className="text-mist">Subtotal</span>
                <span className="text-ink">{fmtAED(Number(order.subtotal))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-mist">Discount</span>
                <span className="text-ink">{fmtAED(Number(order.discount))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-mist">Shipping</span>
                <span className="text-ink">{fmtAED(Number(order.shippingFee))}</span>
              </div>
              <div className="mt-1 flex justify-between border-t border-sand pt-2 font-medium">
                <span className="text-ink">Total</span>
                <span className="text-ink">{fmtAED(Number(order.total))}</span>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-sand bg-white p-5">
            <p className="mb-3 text-body-xs font-medium uppercase tracking-wide text-mist">
              Shipments
            </p>
            {order.shipments.length === 0 ? (
              <p className="text-body-sm text-mist">No shipments yet.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {order.shipments.map((s) => (
                  <div key={s.id} className="text-body-sm">
                    <p className="text-ink">{s.courier}</p>
                    <p className="text-body-xs text-mist">
                      {s.trackingNumber ?? "—"} ·{" "}
                      {s.status.charAt(0) + s.status.slice(1).toLowerCase()}
                    </p>
                    {s.estimatedDelivery && (
                      <p className="text-body-xs text-mist">
                        Est.{" "}
                        {new Date(s.estimatedDelivery).toLocaleDateString("en-AE", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
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
cd /Users/alialajme/Projects/Luna/e-luna && git add "apps/admin/app/(dashboard)/orders/[id]/page.tsx" && git commit -m "feat: admin order detail with items, per-vendor breakdown, and shipments"
```

---

## Task 5: Product server actions

**Files:**
- Create: `apps/admin/app/actions/products.ts`

- [ ] **Step 1: Create the actions file**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma, type ProductStatus } from "@e-luna/db";
import { getAuthUser } from "@e-luna/auth";

type ActionResult = { success: true } | { error: string };

async function setProductStatus(
  id: string,
  status: ProductStatus
): Promise<ActionResult> {
  // Defense-in-depth: verify the ADMIN role in the action itself, not just in
  // middleware. Server actions are directly-invocable POST endpoints.
  const user = await getAuthUser();
  if (!user) return { error: "Unauthorized" };
  if (user.role !== "ADMIN") return { error: "Forbidden" };

  try {
    await prisma.product.update({ where: { id }, data: { status } });
    revalidatePath("/products");
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Update failed" };
  }
}

export async function rejectProduct(id: string): Promise<ActionResult> {
  return setProductStatus(id, "REJECTED");
}

export async function reinstateProduct(id: string): Promise<ActionResult> {
  return setProductStatus(id, "ACTIVE");
}
```

**Note:** all exports are async functions; `setProductStatus` is non-exported (required by `"use server"`). If `type ProductStatus` from `@e-luna/db` errors, use `import { prisma } from "@e-luna/db"; import type { ProductStatus } from "@prisma/client";`.

- [ ] **Step 2: TypeScript + lint check**

```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/admin && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts" | grep -v "\.next/types" | grep -v "packages/auth/src/middleware"
cd /Users/alialajme/Projects/Luna/e-luna/apps/admin && npx next lint 2>&1 | tail -5
```
Expected: tsc empty; lint clean.

- [ ] **Step 3: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git add "apps/admin/app/actions/products.ts" && git commit -m "feat: product moderation server actions (reject/reinstate) with ADMIN check"
```

---

## Task 6: ProductActions client component

**Files:**
- Create: `apps/admin/app/(dashboard)/components/ProductActions.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProductStatus } from "@e-luna/db";
import { rejectProduct, reinstateProduct } from "../../actions/products";

type Props = {
  productId: string;
  status: ProductStatus;
};

type ActionResult = { success: true } | { error: string };

export function ProductActions({ productId, status }: Props) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: (id: string) => Promise<ActionResult>) {
    setIsLoading(true);
    setError(null);
    const result = await action(productId);
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
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-2">
        {status === "REJECTED" && (
          <button
            onClick={() => run(reinstateProduct)}
            disabled={isLoading}
            className={approveBtn}
          >
            Reinstate
          </button>
        )}

        {(status === "ACTIVE" || status === "DRAFT") && (
          <button
            onClick={() => run(rejectProduct)}
            disabled={isLoading}
            className={dangerBtn}
          >
            Reject
          </button>
        )}
      </div>

      {error && <p className="text-body-xs text-coral">{error}</p>}
    </div>
  );
}
```

**Note:** if `import type { ProductStatus } from "@e-luna/db"` errors, use `@prisma/client`.

- [ ] **Step 2: TypeScript + lint check**

```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/admin && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts" | grep -v "\.next/types" | grep -v "packages/auth/src/middleware"
cd /Users/alialajme/Projects/Luna/e-luna/apps/admin && npx next lint 2>&1 | tail -5
```
Expected: tsc empty; lint clean.

- [ ] **Step 3: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git add "apps/admin/app/(dashboard)/components/ProductActions.tsx" && git commit -m "feat: ProductActions client component with reject/reinstate buttons"
```

---

## Task 7: Products list — `/products`

**Files:**
- Create: `apps/admin/app/(dashboard)/products/page.tsx`

- [ ] **Step 1: Create the products list page**

```tsx
import { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma, type ProductStatus } from "@e-luna/db";
import { safeCurrentUser } from "../../lib/auth";
import { StatusFilter } from "../components/StatusFilter";
import { ProductActions } from "../components/ProductActions";

export const metadata: Metadata = { title: "Products — Luna Ops" };

const PRODUCT_STATUS_BADGE: Record<string, string> = {
  ACTIVE: "bg-sage/20 text-sage",
  DRAFT: "bg-gold/20 text-gold",
  REJECTED: "bg-coral/20 text-coral",
  ARCHIVED: "bg-sand text-mist",
};

const PRODUCT_FILTERS = [
  { label: "All", value: "all" },
  { label: "Draft", value: "DRAFT" },
  { label: "Active", value: "ACTIVE" },
  { label: "Rejected", value: "REJECTED" },
  { label: "Archived", value: "ARCHIVED" },
];

const VALID: ProductStatus[] = ["DRAFT", "ACTIVE", "REJECTED", "ARCHIVED"];

type Props = { searchParams: Promise<{ status?: string }> };

export default async function ProductsPage({ searchParams }: Props) {
  const user = await safeCurrentUser();
  if (!user) redirect("/");

  const raw = (await searchParams).status ?? "all";
  const where = VALID.includes(raw as ProductStatus)
    ? { status: raw as ProductStatus }
    : {};

  const products = await prisma.product
    .findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { vendor: { select: { storeName: true } } },
    })
    .catch(() => []);

  return (
    <div className="max-w-4xl space-y-5">
      <h2 className="font-display text-display-md text-ink">Products</h2>

      <StatusFilter status={raw} options={PRODUCT_FILTERS} />

      {products.length === 0 ? (
        <div className="rounded-lg border border-sand bg-white py-16 text-center">
          <p className="text-body-sm text-mist">No products found for this filter.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {products.map((product) => {
            const imgs = product.aiImages as string[];
            const thumb = Array.isArray(imgs) ? imgs[0] : undefined;

            return (
              <div
                key={product.id}
                className="flex items-center gap-4 rounded-lg border border-sand bg-white p-4"
              >
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded bg-sand">
                  {thumb && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumb}
                      alt={product.title}
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="truncate text-body-sm font-medium text-ink">
                    {product.title}
                  </p>
                  <p className="text-body-xs text-mist">
                    {product.vendor.storeName} · {product.category}
                  </p>
                </div>

                <p className="shrink-0 text-body-sm text-ink">
                  AED {Number(product.price).toLocaleString("en-AE", { maximumFractionDigits: 0 })}
                </p>

                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-body-xs font-medium ${PRODUCT_STATUS_BADGE[product.status] ?? "bg-sand text-mist"}`}
                >
                  {product.status.charAt(0) + product.status.slice(1).toLowerCase()}
                </span>

                <ProductActions productId={product.id} status={product.status} />
              </div>
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
Expected: tsc empty; lint clean (the product `<img>` has the eslint-disable comment, so no error).

- [ ] **Step 3: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git add "apps/admin/app/(dashboard)/products/page.tsx" && git commit -m "feat: admin products list with status filter and inline moderation"
```

---

## Task 8: Final verification

**Files:** None (verification only)

- [ ] **Step 1: Full TypeScript check**

```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/admin && rm -rf .next/types && npx tsc --noEmit 2>&1
```
Expected: only the known pre-existing errors — `tailwind.config.ts` (tailwindcss) and `packages/auth/src/middleware.ts` (next/server). No errors in any Phase 6b file.

- [ ] **Step 2: Full repo lint (the exact CI command)**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && pnpm lint 2>&1 | tail -8
```
Expected: `Tasks: 3 successful, 3 total`, exit 0. Admin shows `✔ No ESLint warnings or errors`.

- [ ] **Step 3: Confirm route files + git log**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && find "apps/admin/app/(dashboard)/orders" "apps/admin/app/(dashboard)/products" -name "*.tsx" | sort && ls apps/admin/app/actions/products.ts "apps/admin/app/(dashboard)/components/ProductActions.tsx" && git log --oneline -7
```
Expected files:
- `orders/page.tsx`, `orders/[id]/page.tsx`, `products/page.tsx`, `components/ProductActions.tsx`, `actions/products.ts`

Expected commits (newest first):
- feat: admin products list with status filter and inline moderation
- feat: ProductActions client component with reject/reinstate buttons
- feat: product moderation server actions (reject/reinstate) with ADMIN check
- feat: admin order detail with items, per-vendor breakdown, and shipments
- feat: admin orders list with status filter
- feat: add Orders and Products nav to admin sidebar and topbar
- refactor: generalize StatusFilter to accept options prop

Report the actual SHAs.
