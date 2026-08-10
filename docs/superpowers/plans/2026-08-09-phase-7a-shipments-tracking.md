# Phase 7a: Shipments & Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `Shipment` model real — vendors create per-vendor shipments (courier + tracking number) that move items to SHIPPED, mark them delivered, and `Order.status` auto-aggregates to SHIPPED/DELIVERED; customers get a per-shipment tracking timeline with a courier deep-link.

**Architecture:** Additive schema (`Shipment.vendorId`, `OrderItem.shipmentId`); a shared courier registry at `@e-luna/ui/couriers`; vendor server actions (`createShipment`, `markShipmentDelivered`, `recomputeOrderStatus`); vendor `FulfillmentPanel` gains a shipment UI; the customer order page renders multiple shipments via a `TrackingTimeline` component.

**Tech Stack:** Next.js 15 (App Router, async params), Prisma + PostgreSQL (`prisma db push`, no migration files), TypeScript (`noUncheckedIndexedAccess` on), Clerk.

---

## Context for the implementer (read once)

- **No automated test suite.** "Tests" = `npx tsc --noEmit` and `npx next lint`. Do NOT add a test runner.
- **`noUncheckedIndexedAccess` is ON.** Array index reads are `T | undefined` (`arr[0]?.x`, `?? fallback`).
- **Prisma `Decimal`** → `Number(...)` before arithmetic/JSON.
- **Schema uses `prisma db push`** (no migration files). After editing `schema.prisma`, run `pnpm --filter @e-luna/db db:generate` to regenerate the client types offline (this is what makes new fields/relations type-check). Applying to a live DB (`db push`) is an operator step.
- **Verified current state:**
  - `Shipment { id, orderId, courier String, trackingNumber String?, status ShipmentStatus @default(CREATED), estimatedDelivery?, deliveredAt?, cost Decimal, createdAt, updatedAt, order Order @relation(...) }` (schema lines ~358-375). No vendor link, no item link.
  - `OrderItem { id, orderId, variantId, vendorId, quantity, unitPrice, fulfillmentStatus FulfillmentStatus @default(PENDING), ...relations... returns Return[] }`.
  - `Vendor` relations: `user, products, orderItems, payouts, studioUploads` (lines ~200-204).
  - `ShipmentStatus = CREATED | PICKED_UP | IN_TRANSIT | OUT_FOR_DELIVERY | DELIVERED | FAILED | RETURNED`. `FulfillmentStatus = PENDING | PROCESSING | SHIPPED | DELIVERED | RETURNED`. `OrderStatus = PENDING | CONFIRMED | PROCESSING | SHIPPED | DELIVERED | CANCELLED | REFUNDED`.
  - Vendor `apps/vendor/app/actions/order.ts` → `updateFulfillmentStatus(orderItemId, status)`, auth via `safeCurrentUser` + `getVendorByUserId` (from `../lib/vendor`), returns `{ success, error? }`.
  - Vendor order page `apps/vendor/app/(dashboard)/orders/[id]/page.tsx` fetches the vendor's `orderItem`s (with `include`, so all scalar fields incl. the new `shipmentId` come back) and renders `<FulfillmentPanel items={...} />`.
  - Vendor `FulfillmentPanel` is a client component taking `items: {id, fulfillmentStatus}[]`.
  - Customer order page `apps/customer/app/orders/[id]/page.tsx` already fetches `shipments: { orderBy: { createdAt: "desc" }, take: 1 }` and renders an inline 5-stage timeline (`CREATED→PICKED_UP→IN_TRANSIT→OUT_FOR_DELIVERY→DELIVERED`) showing `shipment.courier · shipment.trackingNumber` as plain text (no deep-link). Ownership-checked. `order.items` include `variant.product {title, slug, aiImages}`.
  - `packages/ui/package.json` `exports` = `{ ".": "./src/index.ts" }` (barrel of client components).

---

## File Structure

```
packages/ui/src/couriers.ts                                        — CREATE: courier registry (pure data)
packages/ui/package.json                                            — MODIFY: add "./couriers" subpath export
packages/db/prisma/schema.prisma                                    — MODIFY: Shipment.vendorId/vendor/items+idx; OrderItem.shipmentId/shipment+idx; Vendor.shipments
apps/vendor/app/actions/shipment.ts                                 — CREATE: createShipment, markShipmentDelivered, recomputeOrderStatus
apps/vendor/app/(dashboard)/orders/components/FulfillmentPanel.tsx  — MODIFY: shipment UI (rewrite)
apps/vendor/app/(dashboard)/orders/[id]/page.tsx                    — MODIFY: fetch shipments, pass to panel
apps/customer/app/orders/components/TrackingTimeline.tsx            — CREATE: milestone timeline component
apps/customer/app/orders/[id]/page.tsx                             — MODIFY: multi-shipment tracking + deep-link + grouped items
```

---

## Task 1: Schema + courier registry + client regen

**Files:** Modify `packages/db/prisma/schema.prisma`; Create `packages/ui/src/couriers.ts`; Modify `packages/ui/package.json`.

- [ ] **Step 1: Add `vendorId` + relations to the `Shipment` model**

In `packages/db/prisma/schema.prisma`, inside `model Shipment`, add these fields alongside the existing ones (place the scalar `vendorId` near `orderId`, the relations near the existing `order` relation, and the index near the existing `@@index` lines):
```prisma
  vendorId          String
```
```prisma
  vendor Vendor      @relation(fields: [vendorId], references: [id])
  items  OrderItem[]
```
```prisma
  @@index([vendorId])
```

- [ ] **Step 2: Add `shipmentId` + relation to `OrderItem`**

In `model OrderItem`, add the scalar field (near `vendorId`), the relation (near the existing relations), and an index:
```prisma
  shipmentId        String?
```
```prisma
  shipment Shipment? @relation(fields: [shipmentId], references: [id])
```
```prisma
  @@index([shipmentId])
```

- [ ] **Step 3: Add the back-relation to `Vendor`**

In `model Vendor`, add to the relations block (after `studioUploads StudioUpload[]`):
```prisma
  shipments     Shipment[]
```

- [ ] **Step 4: Create `packages/ui/src/couriers.ts`**

```ts
export type Courier = { id: string; name: string; trackingUrl: (tn: string) => string };

export const COURIERS: Courier[] = [
  { id: "aramex",        name: "Aramex",        trackingUrl: (t) => `https://www.aramex.com/us/en/track/results?ShipmentNumber=${encodeURIComponent(t)}` },
  { id: "fetchr",        name: "Fetchr",        trackingUrl: (t) => `https://www.fetchr.us/track/${encodeURIComponent(t)}` },
  { id: "quiqup",        name: "Quiqup",        trackingUrl: (t) => `https://www.quiqup.com/track?tracking=${encodeURIComponent(t)}` },
  { id: "emirates_post", name: "Emirates Post", trackingUrl: (t) => `https://www.epg.gov.ae/en/track?trackingNumber=${encodeURIComponent(t)}` },
  { id: "dhl",           name: "DHL",           trackingUrl: (t) => `https://www.dhl.com/ae-en/home/tracking.html?tracking-id=${encodeURIComponent(t)}` },
];

export function getCourier(id: string): Courier | undefined {
  return COURIERS.find((c) => c.id === id);
}

export function courierName(id: string): string {
  return getCourier(id)?.name ?? id;
}

export function trackingUrl(id: string, tn: string): string | null {
  const c = getCourier(id);
  return c ? c.trackingUrl(tn) : null;
}
```

- [ ] **Step 5: Add the subpath export in `packages/ui/package.json`**

Change the `exports` block from:
```json
  "exports": {
    ".": "./src/index.ts"
  },
```
to:
```json
  "exports": {
    ".": "./src/index.ts",
    "./couriers": "./src/couriers.ts"
  },
```

- [ ] **Step 6: Regenerate the Prisma client (offline)**

Run: `cd /Users/alialajme/Projects/Luna/e-luna && pnpm --filter @e-luna/db db:generate`
Expected: "Generated Prisma Client" success.

- [ ] **Step 7: Type-check both apps + ui**

Run:
```bash
cd /Users/alialajme/Projects/Luna/e-luna
npx tsc --noEmit -p packages/ui/tsconfig.json 2>&1 | tail -5 || true
cd apps/vendor && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts" | tail -5
cd ../customer && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts" | tail -5
```
Expected: all clean (nothing consumes the new fields/registry yet; the courier module is standalone).

- [ ] **Step 8: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna
git add packages/db/prisma/schema.prisma packages/ui/src/couriers.ts packages/ui/package.json
git commit -m "feat(logistics): shipment schema (vendorId/shipmentId) + courier registry

Add Shipment.vendorId + OrderItem.shipmentId (per-vendor shipments) and a
shared courier registry exported at @e-luna/ui/couriers.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Vendor shipment actions

**Files:** Create `apps/vendor/app/actions/shipment.ts`.

- [ ] **Step 1: Create `apps/vendor/app/actions/shipment.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@e-luna/db";
import { getCourier } from "@e-luna/ui/couriers";
import { safeCurrentUser } from "../lib/auth";
import { getVendorByUserId } from "../lib/vendor";

const FULFILLMENT_RANGE = ["CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"];

async function recomputeOrderStatus(orderId: string): Promise<void> {
  const order = await prisma.order
    .findUnique({
      where: { id: orderId },
      select: { status: true, items: { select: { fulfillmentStatus: true } } },
    })
    .catch(() => null);
  if (!order) return;
  if (!FULFILLMENT_RANGE.includes(order.status)) return; // never touch PENDING/CANCELLED/REFUNDED

  const statuses = order.items.map((i) => i.fulfillmentStatus);
  const next =
    statuses.length > 0 && statuses.every((s) => s === "DELIVERED")
      ? "DELIVERED"
      : statuses.some((s) => s === "SHIPPED" || s === "DELIVERED")
        ? "SHIPPED"
        : statuses.some((s) => s === "PROCESSING")
          ? "PROCESSING"
          : "CONFIRMED";

  if (next !== order.status) {
    await prisma.order.update({ where: { id: orderId }, data: { status: next } }).catch(() => null);
  }
}

export async function createShipment(input: {
  orderId: string;
  courier: string;
  trackingNumber: string;
  estimatedDelivery?: string;
}): Promise<{ success: boolean; error?: string; shipmentId?: string }> {
  const user = await safeCurrentUser();
  if (!user) return { success: false, error: "Not signed in" };
  const vendor = await getVendorByUserId(user.id);
  if (!vendor) return { success: false, error: "Vendor not found" };

  if (!input.trackingNumber.trim()) return { success: false, error: "Tracking number is required" };
  if (!getCourier(input.courier)) return { success: false, error: "Unknown courier" };

  const items = await prisma.orderItem
    .findMany({
      where: {
        orderId: input.orderId,
        vendorId: vendor.id,
        fulfillmentStatus: { in: ["PENDING", "PROCESSING"] },
      },
      select: { id: true },
    })
    .catch(() => []);
  if (items.length === 0) return { success: false, error: "No items available to ship for this order" };

  try {
    const shipment = await prisma.$transaction(async (tx) => {
      const created = await tx.shipment.create({
        data: {
          orderId: input.orderId,
          vendorId: vendor.id,
          courier: input.courier,
          trackingNumber: input.trackingNumber.trim(),
          status: "IN_TRANSIT",
          estimatedDelivery: input.estimatedDelivery ? new Date(input.estimatedDelivery) : null,
        },
      });
      await tx.orderItem.updateMany({
        where: { id: { in: items.map((i) => i.id) } },
        data: { shipmentId: created.id, fulfillmentStatus: "SHIPPED" },
      });
      return created;
    });
    await recomputeOrderStatus(input.orderId);
    revalidatePath("/orders");
    revalidatePath(`/orders/${input.orderId}`);
    return { success: true, shipmentId: shipment.id };
  } catch {
    return { success: false, error: "Failed to create shipment" };
  }
}

export async function markShipmentDelivered(
  shipmentId: string,
): Promise<{ success: boolean; error?: string }> {
  const user = await safeCurrentUser();
  if (!user) return { success: false, error: "Not signed in" };
  const vendor = await getVendorByUserId(user.id);
  if (!vendor) return { success: false, error: "Vendor not found" };

  const shipment = await prisma.shipment
    .findUnique({ where: { id: shipmentId }, select: { vendorId: true, orderId: true, status: true } })
    .catch(() => null);
  if (!shipment) return { success: false, error: "Shipment not found" };
  if (shipment.vendorId !== vendor.id) return { success: false, error: "Unauthorized" };
  if (shipment.status === "DELIVERED") return { success: false, error: "Already delivered" };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.shipment.update({
        where: { id: shipmentId },
        data: { status: "DELIVERED", deliveredAt: new Date() },
      });
      await tx.orderItem.updateMany({ where: { shipmentId }, data: { fulfillmentStatus: "DELIVERED" } });
    });
    await recomputeOrderStatus(shipment.orderId);
    revalidatePath("/orders");
    revalidatePath(`/orders/${shipment.orderId}`);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to mark delivered" };
  }
}
```

- [ ] **Step 2: Type-check the vendor app**

Run: `cd /Users/alialajme/Projects/Luna/e-luna/apps/vendor && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts" | tail -5`
Expected: clean. (`@e-luna/ui/couriers` resolves via the subpath export from Task 1.)

- [ ] **Step 3: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna
git add apps/vendor/app/actions/shipment.ts
git commit -m "feat(vendor): createShipment + markShipmentDelivered + order-status aggregation

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Vendor fulfillment UI (shipment form + mark delivered)

**Files:** Modify `apps/vendor/app/(dashboard)/orders/components/FulfillmentPanel.tsx` (rewrite); Modify `apps/vendor/app/(dashboard)/orders/[id]/page.tsx`.

- [ ] **Step 1: Replace `FulfillmentPanel.tsx` entirely**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { COURIERS } from "@e-luna/ui/couriers";
import { updateFulfillmentStatus } from "../../../actions/order";
import { createShipment, markShipmentDelivered } from "../../../actions/shipment";

type Item = { id: string; fulfillmentStatus: string; shipmentId: string | null };
type Shipment = { id: string; courier: string; trackingNumber: string | null; status: string };

type Props = {
  orderId: string;
  items: Item[];
  shipments: Shipment[];
};

export function FulfillmentPanel({ orderId, items, shipments }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [courier, setCourier] = useState<string>(COURIERS[0]?.id ?? "");
  const [tracking, setTracking] = useState("");
  const [eta, setEta] = useState("");

  const unshipped = items.filter(
    (i) => !i.shipmentId && (i.fulfillmentStatus === "PENDING" || i.fulfillmentStatus === "PROCESSING"),
  );
  const pendingItems = unshipped.filter((i) => i.fulfillmentStatus === "PENDING");
  const allDelivered = items.length > 0 && items.every((i) => i.fulfillmentStatus === "DELIVERED");

  const markProcessing = () => {
    setError(null);
    startTransition(async () => {
      for (const i of pendingItems) {
        const r = await updateFulfillmentStatus(i.id, "PROCESSING");
        if (!r.success) {
          setError(r.error ?? "Failed to update");
          return;
        }
      }
      router.refresh();
    });
  };

  const submitShipment = () => {
    setError(null);
    if (!tracking.trim()) {
      setError("Enter a tracking number");
      return;
    }
    startTransition(async () => {
      const r = await createShipment({
        orderId,
        courier,
        trackingNumber: tracking,
        estimatedDelivery: eta || undefined,
      });
      if (!r.success) {
        setError(r.error ?? "Failed to create shipment");
        return;
      }
      setTracking("");
      setEta("");
      router.refresh();
    });
  };

  const deliver = (shipmentId: string) => {
    setError(null);
    startTransition(async () => {
      const r = await markShipmentDelivered(shipmentId);
      if (!r.success) {
        setError(r.error ?? "Failed to mark delivered");
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="rounded-lg border border-sand bg-ivory p-4 mt-4 space-y-4">
      <h3 className="text-body-xs font-medium text-ink">Fulfillment</h3>

      {allDelivered && <p className="text-body-sm text-sage font-medium">Fulfilled ✓</p>}

      {shipments.map((s) => {
        const name = COURIERS.find((c) => c.id === s.courier)?.name ?? s.courier;
        return (
          <div key={s.id} className="rounded-md border border-sand p-3 space-y-2">
            <p className="text-body-sm text-ink">
              {name}
              {s.trackingNumber ? ` · ${s.trackingNumber}` : ""}
            </p>
            <p className="text-body-xs text-mist capitalize">{s.status.replace(/_/g, " ").toLowerCase()}</p>
            {s.status !== "DELIVERED" && (
              <button
                type="button"
                onClick={() => deliver(s.id)}
                disabled={isPending}
                className="rounded-full bg-ink px-4 py-2 text-body-sm font-medium text-ivory hover:bg-gold hover:text-ink disabled:opacity-50 transition-colors"
              >
                {isPending ? "Updating…" : "Mark Delivered"}
              </button>
            )}
          </div>
        );
      })}

      {unshipped.length > 0 && (
        <div className="space-y-2">
          {pendingItems.length > 0 && (
            <button
              type="button"
              onClick={markProcessing}
              disabled={isPending}
              className="text-body-xs text-mist hover:text-gold transition-colors disabled:opacity-50"
            >
              Mark {pendingItems.length} item(s) as processing
            </button>
          )}
          <p className="text-body-sm text-ink font-medium">Ship {unshipped.length} item(s)</p>
          <select
            value={courier}
            onChange={(e) => setCourier(e.target.value)}
            className="w-full rounded-lg border border-sand px-3 py-2 text-body-sm text-ink bg-ivory"
          >
            {COURIERS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            value={tracking}
            onChange={(e) => setTracking(e.target.value)}
            placeholder="Tracking number"
            className="w-full rounded-lg border border-sand px-3 py-2 text-body-sm text-ink bg-ivory placeholder:text-mist"
          />
          <input
            type="date"
            value={eta}
            onChange={(e) => setEta(e.target.value)}
            className="w-full rounded-lg border border-sand px-3 py-2 text-body-sm text-ink bg-ivory"
          />
          <button
            type="button"
            onClick={submitShipment}
            disabled={isPending}
            className="rounded-full bg-ink px-4 py-2 text-body-sm font-medium text-ivory hover:bg-gold hover:text-ink disabled:opacity-50 transition-colors"
          >
            {isPending ? "Creating…" : "Create Shipment"}
          </button>
        </div>
      )}

      {error && <p className="text-body-xs text-coral">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Update the vendor order page to fetch shipments and pass new props**

In `apps/vendor/app/(dashboard)/orders/[id]/page.tsx`, after the `items` query + the `if (items.length === 0) redirect("/orders");` line (around line 41), add a shipments query:
```tsx
  const shipments = await prisma.shipment
    .findMany({
      where: { orderId: id, vendorId: vendor.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, courier: true, trackingNumber: true, status: true },
    })
    .catch(() => []);
```
Then replace the existing `<FulfillmentPanel ... />` usage (around lines 95-100):
```tsx
          <FulfillmentPanel
            items={items.map((i) => ({
              id: i.id,
              fulfillmentStatus: i.fulfillmentStatus,
            }))}
          />
```
with:
```tsx
          <FulfillmentPanel
            orderId={id}
            items={items.map((i) => ({
              id: i.id,
              fulfillmentStatus: i.fulfillmentStatus,
              shipmentId: i.shipmentId,
            }))}
            shipments={shipments}
          />
```

- [ ] **Step 3: Type-check + lint the vendor app**

Run:
```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/vendor
npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts" | tail -5
npx next lint 2>&1 | tail -5
```
Expected: tsc clean; no new lint errors from the two files.

- [ ] **Step 4: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna
git add "apps/vendor/app/(dashboard)/orders/components/FulfillmentPanel.tsx" "apps/vendor/app/(dashboard)/orders/[id]/page.tsx"
git commit -m "feat(vendor): shipment creation + mark-delivered UI in FulfillmentPanel

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Customer tracking (multi-shipment + deep-link + grouped items)

**Files:** Create `apps/customer/app/orders/components/TrackingTimeline.tsx`; Modify `apps/customer/app/orders/[id]/page.tsx`.

- [ ] **Step 1: Create `apps/customer/app/orders/components/TrackingTimeline.tsx`**

```tsx
const SHIPMENT_STAGES = ["CREATED", "PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED"] as const;

export function TrackingTimeline({ status }: { status: string }) {
  if (status === "FAILED" || status === "RETURNED") {
    return (
      <p className="text-body-sm text-coral capitalize">
        {status.toLowerCase()}
      </p>
    );
  }
  const currentStageIndex = SHIPMENT_STAGES.indexOf(status as (typeof SHIPMENT_STAGES)[number]);
  return (
    <div className="flex items-start">
      {SHIPMENT_STAGES.map((stage, idx) => (
        <div key={stage} className="flex flex-1 flex-col items-center">
          <div className="flex w-full items-center">
            <div className={`h-3 w-3 shrink-0 rounded-full ${idx <= currentStageIndex ? "bg-ink" : "bg-sand"}`} />
            {idx < SHIPMENT_STAGES.length - 1 && (
              <div className={`h-0.5 flex-1 ${idx < currentStageIndex ? "bg-ink" : "bg-sand"}`} />
            )}
          </div>
          <p className={`mt-1 text-body-xs text-center ${idx <= currentStageIndex ? "text-ink" : "text-mist"}`}>
            {stage.replace(/_/g, " ")}
          </p>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Update the customer order query to fetch all shipments**

In `apps/customer/app/orders/[id]/page.tsx`, change the shipments include (line 52) from:
```tsx
      shipments: { orderBy: { createdAt: "desc" }, take: 1 },
```
to:
```tsx
      shipments: { orderBy: { createdAt: "asc" } },
```

- [ ] **Step 3: Replace the imports + top-of-file constant**

Change the imports at the top of the file (lines 1-5) to add the registry and the timeline component, and REMOVE the now-unused inline `SHIPMENT_STAGES` constant (lines 14-20). New imports block:
```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { Metadata } from "next";
import { prisma } from "@e-luna/db";
import { courierName, trackingUrl } from "@e-luna/ui/couriers";
import { safeCurrentUser } from "../../lib/auth";
import { TrackingTimeline } from "../components/TrackingTimeline";
```
Delete the `const SHIPMENT_STAGES = [...] as const;` block (lines 14-20) entirely.

- [ ] **Step 4: Replace the shipment-derived locals**

Replace these lines (currently around 66-73):
```tsx
  const shipment = order.shipments[0] ?? null;
  const paymentTx = order.paymentTransactions[0] ?? null;

  const currentStageIndex = shipment
    ? SHIPMENT_STAGES.indexOf(
        shipment.status as (typeof SHIPMENT_STAGES)[number]
      )
    : -1;
```
with:
```tsx
  const paymentTx = order.paymentTransactions[0] ?? null;

  // Group items by shipment for the tracking display.
  const itemsByShipment = new Map<string, typeof order.items>();
  const unshippedItems: typeof order.items = [];
  for (const item of order.items) {
    if (item.shipmentId) {
      const arr = itemsByShipment.get(item.shipmentId) ?? [];
      arr.push(item);
      itemsByShipment.set(item.shipmentId, arr);
    } else {
      unshippedItems.push(item);
    }
  }

  const fmtDate = (d: Date) =>
    new Date(d).toLocaleDateString("en-AE", { day: "numeric", month: "short", year: "numeric" });
```

- [ ] **Step 5: Add an `ItemRow` helper component at the bottom of the file**

After the closing `}` of `OrderDetailPage`, append:
```tsx
function ItemRow({
  item,
}: {
  item: {
    id: string;
    quantity: number;
    unitPrice: unknown;
    variant: { size: string; color: string; product: { title: string; slug: string; aiImages: unknown } };
  };
}) {
  const images = Array.isArray(item.variant.product.aiImages)
    ? (item.variant.product.aiImages as string[])
    : [];
  return (
    <li className="flex gap-4 py-4">
      <div className="h-16 w-12 shrink-0 overflow-hidden rounded-lg bg-sand/40">
        {images[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={images[0]} alt={item.variant.product.title} className="h-full w-full object-cover" />
        ) : (
          <div className="h-full bg-sand" />
        )}
      </div>
      <div className="flex-1">
        <Link
          href={`/p/${item.variant.product.slug}`}
          className="text-body-md font-medium text-ink hover:text-gold transition-colors"
        >
          {item.variant.product.title}
        </Link>
        <p className="text-body-sm text-mist">
          {item.variant.size} · {item.variant.color}
        </p>
        <p className="text-body-sm text-mist">Qty: {item.quantity}</p>
      </div>
      <p className="font-display text-body-md text-gold whitespace-nowrap">
        AED {(Number(item.unitPrice) * item.quantity).toLocaleString("en-AE", { minimumFractionDigits: 2 })}
      </p>
    </li>
  );
}
```

- [ ] **Step 6: Replace the "Shipment timeline" + "Items" sections with grouped shipment cards**

Replace the entire block from the `{/* Shipment timeline */}` comment through the end of the `{/* Items */}` section (currently lines 111-194 — the `{shipment && (...)}` block AND the following Items `<div>`) with:
```tsx
      {/* Shipments & tracking */}
      {order.shipments.map((s) => {
        const url = s.trackingNumber ? trackingUrl(s.courier, s.trackingNumber) : null;
        const shipmentItems = itemsByShipment.get(s.id) ?? [];
        return (
          <div key={s.id} className="rounded-2xl border border-sand bg-ivory p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-display-sm text-ink">
                {courierName(s.courier)}
              </h2>
              {s.trackingNumber &&
                (url ? (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-body-sm text-gold hover:underline"
                  >
                    Track {s.trackingNumber} →
                  </a>
                ) : (
                  <span className="text-body-sm text-mist">{s.trackingNumber}</span>
                ))}
            </div>
            <TrackingTimeline status={s.status} />
            <div className="mt-3 flex justify-between text-body-sm text-mist">
              {s.estimatedDelivery && <span>Est. delivery {fmtDate(s.estimatedDelivery)}</span>}
              {s.deliveredAt && <span className="text-sage">Delivered {fmtDate(s.deliveredAt)}</span>}
            </div>
            {shipmentItems.length > 0 && (
              <ul className="mt-4 divide-y divide-sand border-t border-sand">
                {shipmentItems.map((item) => (
                  <ItemRow key={item.id} item={item} />
                ))}
              </ul>
            )}
          </div>
        );
      })}

      {/* Items not yet shipped */}
      {unshippedItems.length > 0 && (
        <div className="rounded-2xl border border-sand bg-ivory p-6">
          <h2 className="font-display text-display-sm text-ink mb-1">
            {order.shipments.length > 0 ? "Preparing your order" : "Items"}
          </h2>
          {order.shipments.length > 0 && (
            <p className="text-body-sm text-mist mb-3">These items haven&apos;t shipped yet.</p>
          )}
          <ul className="divide-y divide-sand">
            {unshippedItems.map((item) => (
              <ItemRow key={item.id} item={item} />
            ))}
          </ul>
        </div>
      )}
```

- [ ] **Step 7: Type-check + lint the customer app**

Run:
```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/customer
npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts" | tail -8
npx next lint 2>&1 | tail -6
```
Expected: tsc clean; no new lint errors (the `<img>` in `ItemRow` carries an eslint-disable comment; the apostrophe in "haven't" is escaped as `&apos;`).

- [ ] **Step 8: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna
git add apps/customer/app/orders/components/TrackingTimeline.tsx "apps/customer/app/orders/[id]/page.tsx"
git commit -m "feat(customer): per-shipment tracking with courier deep-link + grouped items

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Repo-wide green check

**Files:** none (verification only).

- [ ] **Step 1: Frozen install (mirror CI)**

Run: `cd /Users/alialajme/Projects/Luna/e-luna && pnpm install --frozen-lockfile 2>&1 | tail -3`
Expected: no lockfile change (no new dependencies added this phase — the `"./couriers"` export is just a new entry point in an existing package).

- [ ] **Step 2: Regenerate the Prisma client (in case the checkout was clean)**

Run: `cd /Users/alialajme/Projects/Luna/e-luna && pnpm --filter @e-luna/db db:generate 2>&1 | tail -2`
Expected: success.

- [ ] **Step 3: Repo-wide lint**

Run: `cd /Users/alialajme/Projects/Luna/e-luna && pnpm lint 2>&1 | tail -15`
Expected: all apps pass (pre-existing `<img>` warnings elsewhere are acceptable; no new errors).

- [ ] **Step 4: Repo-wide type check**

Run: `cd /Users/alialajme/Projects/Luna/e-luna && pnpm --filter "@e-luna/*" exec tsc --noEmit 2>&1 | tail -15`
Expected: clean.

- [ ] **Step 5: Confirm the 8b loop closes (inspection)**

Run: `grep -n "next !== order.status" apps/vendor/app/actions/shipment.ts && grep -n 'status === "DELIVERED"' packages/ai/src/agents/payment.ts`
Expected: one match each — `recomputeOrderStatus` writes `Order.status`, and the 8b `refund_eligibility` reads `Order.status === "DELIVERED"`. The vendor delivering all items now makes that order refund-eligible.

- [ ] **Step 6: Final commit (only if Steps 3-4 required fixes; otherwise skip)**

```bash
cd /Users/alialajme/Projects/Luna/e-luna
git add -A
git commit -m "chore(logistics): lint/type fixes for 7a

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 7: Manual smoke note (not automated)**

Needs a running app + DB (and `db push` applied). Flow: vendor opens an order → Create Shipment (courier + tracking) → items become SHIPPED, order → SHIPPED; customer order page shows the shipment card, courier deep-link, and timeline; vendor Mark Delivered → items + order → DELIVERED; the 8b Payment agent's `refund_eligibility` now returns eligible for that order.

---

## Self-Review (completed)

**Spec coverage:**
- `Shipment.vendorId` + `OrderItem.shipmentId` + `Vendor.shipments` → Task 1 ✓
- Courier registry at `@e-luna/ui/couriers` → Task 1 ✓
- `createShipment` / `markShipmentDelivered` / `recomputeOrderStatus` → Task 2 ✓
- Order status aggregation closing the 8b loop → Task 2 + Task 5 Step 5 ✓
- Vendor create-shipment form + mark-delivered → Task 3 ✓
- Customer multi-shipment tracking + deep-link + timeline component + grouped items → Task 4 ✓
- Ownership checks + validation + transactions → Task 2 (actions) ✓
- db:generate/push, tsc, lint → Tasks 1, 3, 4, 5 ✓

**Placeholder scan:** none — every code step is complete.

**Type consistency:** `FulfillmentPanel` props (`orderId`, `items:{id,fulfillmentStatus,shipmentId}`, `shipments:{id,courier,trackingNumber,status}`) match the vendor page's props (Task 3). `createShipment({orderId,courier,trackingNumber,estimatedDelivery?})` and `markShipmentDelivered(shipmentId)` signatures match between the action (Task 2) and the panel calls (Task 3). `TrackingTimeline({status})` matches its usage (Task 4). Registry helpers `getCourier`/`courierName`/`trackingUrl`/`COURIERS` are used consistently (Tasks 1-4). Shipment created with `status:"IN_TRANSIT"`, which the customer timeline highlights correctly.
```
