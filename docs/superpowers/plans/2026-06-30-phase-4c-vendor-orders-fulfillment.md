# Phase 4c: Vendor Orders & Fulfillment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Phase 4a `/orders` stub with a working order management experience — vendors see incoming orders grouped by order ID, can view order details scoped to their items, and can advance fulfillment status (PENDING → PROCESSING → SHIPPED → DELIVERED).

**Architecture:** Four new files in the vendor Next.js 15 app (RSC pages + one client component + one server action). Data is fetched by querying `OrderItem` by `vendorId` — no changes to the shared `Order` model. FulfillmentPanel is a client island inside the otherwise-RSC detail page, calling the server action via `useTransition`.

**Tech Stack:** Next.js 15 (App Router, RSC, server actions), Prisma, TypeScript, Tailwind CSS (Warm Oud tokens).

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/vendor/app/actions/order.ts` | Create | `updateFulfillmentStatus` server action |
| `apps/vendor/app/(dashboard)/orders/page.tsx` | Overwrite stub | Order list RSC — groups items by orderId, status filter |
| `apps/vendor/app/(dashboard)/orders/components/FulfillmentPanel.tsx` | Create | Client component — advances status for eligible items |
| `apps/vendor/app/(dashboard)/orders/[id]/page.tsx` | Create | Order detail RSC — items table + FulfillmentPanel + sidebar |

---

## Codebase Context

**Must-know patterns (read before implementing):**

- `safeCurrentUser()` is in `apps/vendor/app/lib/auth.ts` — wraps Clerk `currentUser()` in try/catch, returns null in dev
- `getVendorByUserId(userId)` is in `apps/vendor/app/lib/vendor.ts` — returns `VendorWithStatus | null`
- All RSC pages that need vendor context call both and return null if either is missing
- Next.js 15: `params` and `searchParams` in page components are `Promise<{...}>` — must `await` them
- All server action files are `"use server"` at the top — all exports must be async
- Prisma `Decimal` fields (like `unitPrice`) must be converted via `Number()` before arithmetic
- Design tokens: `text-ink` (primary), `text-mist` (secondary), `text-gold` (CTA/active), `bg-sand` (borders), `text-coral` (error), `text-sage` (success)

**Relevant schema:**
```prisma
model OrderItem {
  id                String            @id @default(cuid())
  orderId           String
  variantId         String
  vendorId          String
  quantity          Int
  unitPrice         Decimal           @db.Decimal(10, 2)
  fulfillmentStatus FulfillmentStatus @default(PENDING)
  order             Order             @relation(...)
  variant           ProductVariant    @relation(...)
}

enum FulfillmentStatus { PENDING PROCESSING SHIPPED DELIVERED RETURNED }

model Order {
  id            String        @id @default(cuid())
  createdAt     DateTime      @default(now())
  paymentMethod PaymentMethod
  address       Address       @relation(...)
}

model Address {
  fullName     String
  addressLine1 String
  addressLine2 String?
  city         String
  emirate      String?
  country      String @default("AE")
}

enum PaymentMethod { CARD LUNA_WALLET TABBY TAMARA }
```

---

## Task 1: Order Server Action

**Files:**
- Create: `apps/vendor/app/actions/order.ts`

- [ ] **Step 1: Create the file**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../lib/auth";
import { getVendorByUserId } from "../lib/vendor";

const STATUS_ORDER = ["PENDING", "PROCESSING", "SHIPPED", "DELIVERED"] as const;
type ForwardStatus = "PROCESSING" | "SHIPPED" | "DELIVERED";

export async function updateFulfillmentStatus(
  orderItemId: string,
  status: ForwardStatus
): Promise<{ success: boolean; error?: string }> {
  const user = await safeCurrentUser();
  if (!user) return { success: false, error: "Not signed in" };

  const vendor = await getVendorByUserId(user.id);
  if (!vendor) return { success: false, error: "Vendor not found" };

  const item = await prisma.orderItem
    .findUnique({
      where: { id: orderItemId },
      select: { vendorId: true, fulfillmentStatus: true, orderId: true },
    })
    .catch(() => null);

  if (!item) return { success: false, error: "Order item not found" };
  if (item.vendorId !== vendor.id) return { success: false, error: "Unauthorized" };

  const currentIndex = STATUS_ORDER.indexOf(
    item.fulfillmentStatus as (typeof STATUS_ORDER)[number]
  );
  const nextIndex = STATUS_ORDER.indexOf(status);
  if (nextIndex <= currentIndex) {
    return { success: false, error: "Invalid status transition" };
  }

  try {
    await prisma.orderItem.update({
      where: { id: orderItemId },
      data: { fulfillmentStatus: status },
    });
    revalidatePath("/orders");
    revalidatePath(`/orders/${item.orderId}`);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to update status" };
  }
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/vendor && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts"
```

Expected: no output (clean).

- [ ] **Step 3: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git add apps/vendor/app/actions/order.ts && git commit -m "feat: updateFulfillmentStatus server action with ownership + forward-only validation"
```

---

## Task 2: Order List Page

**Files:**
- Overwrite: `apps/vendor/app/(dashboard)/orders/page.tsx`

- [ ] **Step 1: Overwrite the stub**

```typescript
import { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../../lib/auth";
import { getVendorByUserId } from "../../lib/vendor";

export const metadata: Metadata = { title: "Orders — Luna Vendor" };

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  PROCESSING: "Processing",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
};

const STATUS_CLASSES: Record<string, string> = {
  PENDING: "bg-sand text-mist",
  PROCESSING: "bg-gold/20 text-gold",
  SHIPPED: "bg-gold/40 text-ink",
  DELIVERED: "bg-sage/20 text-sage",
};

const STATUS_PRECEDENCE = ["PENDING", "PROCESSING", "SHIPPED", "DELIVERED", "RETURNED"];

function worstStatus(statuses: string[]): string {
  let worst = "DELIVERED";
  for (const s of statuses) {
    if (STATUS_PRECEDENCE.indexOf(s) < STATUS_PRECEDENCE.indexOf(worst)) {
      worst = s;
    }
  }
  return worst;
}

type Props = { searchParams: Promise<{ status?: string }> };

export default async function OrdersPage({ searchParams }: Props) {
  const { status: statusParam } = await searchParams;

  const user = await safeCurrentUser();
  if (!user) return null;

  const vendor = await getVendorByUserId(user.id);
  if (!vendor) return null;

  const items = await prisma.orderItem
    .findMany({
      where: { vendorId: vendor.id },
      include: {
        order: { include: { address: true } },
        variant: { include: { product: { select: { title: true } } } },
      },
      orderBy: { createdAt: "desc" },
    })
    .catch(() => []);

  // Group by orderId
  const grouped = new Map<string, typeof items>();
  for (const item of items) {
    const arr = grouped.get(item.orderId) ?? [];
    arr.push(item);
    grouped.set(item.orderId, arr);
  }

  type OrderGroup = {
    orderId: string;
    createdAt: Date;
    city: string;
    itemCount: number;
    subtotal: number;
    status: string;
  };

  const validStatuses = ["PENDING", "PROCESSING", "SHIPPED", "DELIVERED"];
  const statusFilter = validStatuses.includes(statusParam ?? "") ? statusParam : undefined;

  const orders: OrderGroup[] = [];
  for (const [orderId, groupItems] of grouped) {
    const ws = worstStatus(groupItems.map((i) => i.fulfillmentStatus));
    if (statusFilter && ws !== statusFilter) continue;
    orders.push({
      orderId,
      createdAt: groupItems[0].order.createdAt,
      city: groupItems[0].order.address.city,
      itemCount: groupItems.length,
      subtotal: groupItems.reduce(
        (sum, i) => sum + Number(i.unitPrice) * i.quantity,
        0
      ),
      status: ws,
    });
  }

  const tabs = [
    { label: "All", value: undefined },
    { label: "Pending", value: "PENDING" },
    { label: "Processing", value: "PROCESSING" },
    { label: "Shipped", value: "SHIPPED" },
    { label: "Delivered", value: "DELIVERED" },
  ] as const;

  return (
    <div className="max-w-4xl space-y-5">
      <h2 className="font-display text-display-md text-ink">Orders</h2>

      <div className="flex gap-1 border-b border-sand">
        {tabs.map((tab) => {
          const href = tab.value ? `/orders?status=${tab.value}` : "/orders";
          const isActive = statusFilter === tab.value;
          return (
            <Link
              key={tab.label}
              href={href}
              className={`px-4 py-2 text-body-sm transition-colors ${
                isActive
                  ? "border-b-2 border-gold text-gold"
                  : "text-mist hover:text-ink"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {orders.length === 0 ? (
        <p className="text-body-md text-mist py-10">No orders yet.</p>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="border-b border-sand text-left">
              <th className="pb-2 text-body-xs font-medium text-mist">Order #</th>
              <th className="pb-2 text-body-xs font-medium text-mist">Date</th>
              <th className="pb-2 text-body-xs font-medium text-mist">Ship to</th>
              <th className="pb-2 text-body-xs font-medium text-mist">Items</th>
              <th className="pb-2 text-body-xs font-medium text-mist">Your subtotal</th>
              <th className="pb-2 text-body-xs font-medium text-mist">Status</th>
              <th className="pb-2"></th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr
                key={o.orderId}
                className="border-b border-sand/50 hover:bg-sand/30 transition-colors"
              >
                <td className="py-3 pr-4">
                  <span className="font-mono text-body-sm text-ink">
                    {o.orderId.slice(-8).toUpperCase()}
                  </span>
                </td>
                <td className="py-3 pr-4 text-body-sm text-mist">
                  {new Date(o.createdAt).toLocaleDateString("en-AE")}
                </td>
                <td className="py-3 pr-4 text-body-sm text-mist">{o.city}</td>
                <td className="py-3 pr-4 text-body-sm text-ink">{o.itemCount}</td>
                <td className="py-3 pr-4 text-body-sm text-ink">
                  AED{" "}
                  {o.subtotal.toLocaleString("en-AE", {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })}
                </td>
                <td className="py-3 pr-4">
                  <span
                    className={`rounded-full px-2 py-0.5 text-body-xs font-medium ${
                      STATUS_CLASSES[o.status] ?? "bg-sand text-mist"
                    }`}
                  >
                    {STATUS_LABELS[o.status] ?? o.status}
                  </span>
                </td>
                <td className="py-3">
                  <Link
                    href={`/orders/${o.orderId}`}
                    className="text-body-xs text-gold hover:underline"
                  >
                    View →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
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
cd /Users/alialajme/Projects/Luna/e-luna && git add "apps/vendor/app/(dashboard)/orders/page.tsx" && git commit -m "feat: vendor order list page with status filter and grouped view"
```

---

## Task 3: FulfillmentPanel Component

**Files:**
- Create: `apps/vendor/app/(dashboard)/orders/components/FulfillmentPanel.tsx`

Create the `components/` directory first if it doesn't exist.

- [ ] **Step 1: Create the file**

```typescript
"use client";

import { useState, useTransition } from "react";
import { updateFulfillmentStatus } from "../../../actions/order";

type ItemStatus = {
  id: string;
  fulfillmentStatus: string;
};

type Props = {
  items: ItemStatus[];
};

type ForwardStatus = "PROCESSING" | "SHIPPED" | "DELIVERED";

const STATUS_PRECEDENCE = ["PENDING", "PROCESSING", "SHIPPED", "DELIVERED", "RETURNED"];

const NEXT_STATUS: Record<string, ForwardStatus | null> = {
  PENDING: "PROCESSING",
  PROCESSING: "SHIPPED",
  SHIPPED: "DELIVERED",
  DELIVERED: null,
};

const BUTTON_LABELS: Record<string, string> = {
  PENDING: "Mark as Processing",
  PROCESSING: "Mark as Shipped",
  SHIPPED: "Mark as Delivered",
};

function worstStatus(statuses: string[]): string {
  let worst = "DELIVERED";
  for (const s of statuses) {
    if (STATUS_PRECEDENCE.indexOf(s) < STATUS_PRECEDENCE.indexOf(worst)) {
      worst = s;
    }
  }
  return worst;
}

export function FulfillmentPanel({ items }: Props) {
  const [statuses, setStatuses] = useState<Record<string, string>>(
    Object.fromEntries(items.map((i) => [i.id, i.fulfillmentStatus]))
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const currentStatuses = Object.values(statuses);
  const current = worstStatus(currentStatuses);
  const allDelivered = currentStatuses.every((s) => s === "DELIVERED");
  const nextStatus = NEXT_STATUS[current];

  const handleAdvance = () => {
    if (!nextStatus) return;
    setError(null);

    const eligibleItems = items.filter((i) => statuses[i.id] === current);

    startTransition(async () => {
      const updates: Record<string, string> = {};
      let firstError: string | null = null;

      for (const item of eligibleItems) {
        const result = await updateFulfillmentStatus(item.id, nextStatus);
        if (result.success) {
          updates[item.id] = nextStatus;
        } else if (!firstError) {
          firstError = result.error ?? "Failed to update";
        }
      }

      if (Object.keys(updates).length > 0) {
        setStatuses((prev) => ({ ...prev, ...updates }));
      }
      if (firstError) {
        setError(firstError);
      }
    });
  };

  return (
    <div className="rounded-lg border border-sand bg-ivory p-4 mt-4">
      <h3 className="text-body-xs font-medium text-ink mb-2">Fulfillment</h3>
      {allDelivered ? (
        <p className="text-body-sm text-sage font-medium">Fulfilled ✓</p>
      ) : (
        <div className="space-y-3">
          <p className="text-body-sm text-mist">
            Status:{" "}
            <span className="text-ink font-medium capitalize">
              {current.toLowerCase()}
            </span>
          </p>
          {nextStatus && (
            <button
              type="button"
              onClick={handleAdvance}
              disabled={isPending}
              className="rounded-full bg-ink px-4 py-2 text-body-sm font-medium text-ivory hover:bg-gold hover:text-ink disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isPending ? "Updating…" : BUTTON_LABELS[current]}
            </button>
          )}
          {error && <p className="text-body-xs text-coral">{error}</p>}
        </div>
      )}
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
cd /Users/alialajme/Projects/Luna/e-luna && git add "apps/vendor/app/(dashboard)/orders/components/FulfillmentPanel.tsx" && git commit -m "feat: FulfillmentPanel component with forward-only status advancement"
```

---

## Task 4: Order Detail Page

**Files:**
- Create: `apps/vendor/app/(dashboard)/orders/[id]/page.tsx`

Create the `[id]/` directory first if it doesn't exist.

- [ ] **Step 1: Create the file**

```typescript
import { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../../../lib/auth";
import { getVendorByUserId } from "../../../lib/vendor";
import { FulfillmentPanel } from "../components/FulfillmentPanel";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: `Order #${id.slice(-8).toUpperCase()} — Luna Vendor` };
}

const PAYMENT_LABELS: Record<string, string> = {
  CARD: "Card",
  LUNA_WALLET: "Luna Wallet",
  TABBY: "Tabby",
  TAMARA: "Tamara",
};

export default async function OrderDetailPage({ params }: Props) {
  const { id } = await params;

  const user = await safeCurrentUser();
  if (!user) redirect("/");

  const vendor = await getVendorByUserId(user.id);
  if (!vendor) redirect("/");

  const items = await prisma.orderItem
    .findMany({
      where: { orderId: id, vendorId: vendor.id },
      include: {
        order: { include: { address: true } },
        variant: { include: { product: { select: { title: true } } } },
      },
    })
    .catch(() => []);

  if (items.length === 0) redirect("/orders");

  const order = items[0].order;
  const address = order.address;
  const subtotal = items.reduce(
    (sum, i) => sum + Number(i.unitPrice) * i.quantity,
    0
  );

  return (
    <div className="max-w-4xl space-y-5">
      <h2 className="font-display text-display-md text-ink">
        Order #{id.slice(-8).toUpperCase()}
      </h2>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_260px]">
        {/* Left: items table + fulfillment panel */}
        <div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-sand text-left">
                <th className="pb-2 text-body-xs font-medium text-mist">Product</th>
                <th className="pb-2 text-body-xs font-medium text-mist">Variant</th>
                <th className="pb-2 text-body-xs font-medium text-mist">Qty</th>
                <th className="pb-2 text-body-xs font-medium text-mist">Unit price</th>
                <th className="pb-2 text-body-xs font-medium text-mist">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-sand/50">
                  <td className="py-3 pr-3 text-body-sm text-ink">
                    {item.variant.product.title}
                  </td>
                  <td className="py-3 pr-3 text-body-sm text-mist">
                    {item.variant.size} / {item.variant.color}
                  </td>
                  <td className="py-3 pr-3 text-body-sm text-ink">
                    {item.quantity}
                  </td>
                  <td className="py-3 pr-3 text-body-sm text-ink">
                    AED {Number(item.unitPrice).toLocaleString("en-AE")}
                  </td>
                  <td className="py-3 text-body-sm text-ink">
                    AED{" "}
                    {(Number(item.unitPrice) * item.quantity).toLocaleString(
                      "en-AE"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <FulfillmentPanel
            items={items.map((i) => ({
              id: i.id,
              fulfillmentStatus: i.fulfillmentStatus,
            }))}
          />
        </div>

        {/* Right: order info sidebar */}
        <div className="rounded-lg border border-sand bg-ivory p-4 space-y-4 h-fit">
          <div>
            <p className="text-body-xs text-mist mb-0.5">Order</p>
            <p className="font-mono text-body-sm text-ink">
              {id.slice(-8).toUpperCase()}
            </p>
          </div>
          <div>
            <p className="text-body-xs text-mist mb-0.5">Placed</p>
            <p className="text-body-sm text-ink">
              {new Date(order.createdAt).toLocaleDateString("en-AE", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </p>
          </div>
          <div>
            <p className="text-body-xs text-mist mb-0.5">Payment</p>
            <p className="text-body-sm text-ink">
              {PAYMENT_LABELS[order.paymentMethod] ?? order.paymentMethod}
            </p>
          </div>
          <div className="border-t border-sand pt-4">
            <p className="text-body-xs text-mist mb-1">Ship to</p>
            <p className="text-body-sm text-ink leading-relaxed">
              {address.fullName}
              <br />
              {address.addressLine1}
              <br />
              {address.city}
              {address.emirate ? `, ${address.emirate}` : ""}
              <br />
              UAE
            </p>
          </div>
          <div className="border-t border-sand pt-4">
            <p className="text-body-xs text-mist mb-0.5">Your subtotal</p>
            <p className="text-body-md font-medium text-ink">
              AED{" "}
              {subtotal.toLocaleString("en-AE", {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              })}
            </p>
          </div>
        </div>
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
cd /Users/alialajme/Projects/Luna/e-luna && git add "apps/vendor/app/(dashboard)/orders/[id]/page.tsx" && git commit -m "feat: order detail page with items table, fulfillment panel, and order info sidebar"
```

---

## Task 5: Final TypeScript Check

**Files:** No changes — verification only.

- [ ] **Step 1: Full TypeScript check**

```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/vendor && npx tsc --noEmit 2>&1
```

Expected output (only):
```
tailwind.config.ts(1,29): error TS2307: Cannot find module 'tailwindcss' or its corresponding type declarations.
```

Any other errors must be fixed before this task is marked complete.

- [ ] **Step 2: Confirm all 4 commits landed**

```bash
git log --oneline -5
```

Expected: commits for order action, list page, FulfillmentPanel, and detail page.
