# Phase 7a: Shipments & Tracking — Design Spec

## Goal

Turn the unused `Shipment` model into a real, per-vendor shipment + customer-tracking flow: vendors create shipments (courier + tracking number) for their items in an order, mark them delivered, and `Order.status` auto-aggregates to `SHIPPED`/`DELIVERED` — closing the loop with the 8b Payment agent's `DELIVERED`-based refund eligibility. Customers see a per-shipment tracking timeline with a deep-link to the courier's own site. Live courier-API integration stays deferred (tracking numbers are entered manually).

---

## Scope

**In scope:**
- Per-vendor-per-order `Shipment` records (schema: `Shipment.vendorId`, `OrderItem.shipmentId`).
- Vendor actions: `createShipment`, `markShipmentDelivered`, and a `recomputeOrderStatus` aggregation helper.
- Vendor `FulfillmentPanel` gains a Create-Shipment form + Mark-Delivered.
- Customer order-detail tracking section (status milestones, ETA, delivered date, courier deep-link).
- A shared courier registry (`@e-luna/ui/couriers`).

**Out of scope (later phases):**
- Returns + refund/restock (7b).
- Live courier-API integration, label generation, and webhook status updates (deferred — tracking numbers are manual; intermediate in-transit events are not fabricated).
- The Logistics *agent* (8c).
- Changes to `LUNA_WALLET`/`CASH_ON_DELIVERY`/payment behavior.

---

## Architecture

### Current state (verified)
- `Shipment { id, orderId, courier String, trackingNumber String?, status ShipmentStatus @default(CREATED), estimatedDelivery?, deliveredAt?, cost, ... }` — **no `vendorId`, no link to `OrderItem`, and nothing creates rows.**
- `OrderItem { fulfillmentStatus FulfillmentStatus @default(PENDING), vendorId, orderId, ... }`.
- `ShipmentStatus = CREATED | PICKED_UP | IN_TRANSIT | OUT_FOR_DELIVERY | DELIVERED | FAILED | RETURNED`.
- `FulfillmentStatus = PENDING | PROCESSING | SHIPPED | DELIVERED | RETURNED`.
- Vendor `updateFulfillmentStatus(orderItemId, status)` advances a single item PENDING→PROCESSING→SHIPPED→DELIVERED with an ownership check (`item.vendorId === vendor.id`); no shipment created.
- `Order.status` is set to `CONFIRMED` at checkout and **never advances** afterward.
- Customer `orders/[id]/page.tsx` renders items + address + totals; no tracking.
- `packages/ui` exports a single barrel (`".": "./src/index.ts"`) of mostly client components; both apps depend on it.

### Schema changes (additive, applied via `prisma db push`)
```prisma
model Shipment {
  // ...existing fields...
  vendorId String
  vendor   Vendor      @relation(fields: [vendorId], references: [id])
  items    OrderItem[]
  @@index([vendorId])
}

model OrderItem {
  // ...existing fields...
  shipmentId String?
  shipment   Shipment? @relation(fields: [shipmentId], references: [id])
  @@index([shipmentId])
}

model Vendor {
  // ...existing fields...
  shipments Shipment[]
}
```
`courier` stays a `String`, constrained by the UI to the courier registry ids. Optional `OrderItem.shipment` relation defaults to `onDelete: SetNull` (shipments are not deleted in practice). Apply with `pnpm --filter @e-luna/db db:push` (operator/dev step); `db:generate` regenerates types offline.

### Courier registry — `packages/ui/src/couriers.ts`
Pure-data module (no React, no `"use client"`), exported as an **isolated subpath** so it never pulls the client-component barrel into server components:
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
`packages/ui/package.json` `exports` gains `"./couriers": "./src/couriers.ts"`. Both apps import via `@e-luna/ui/couriers`.

### Files
```
packages/ui/src/couriers.ts                                        — CREATE registry
packages/ui/package.json                                            — add "./couriers" export
packages/db/prisma/schema.prisma                                    — Shipment.vendorId/vendor/items+idx; OrderItem.shipmentId/shipment+idx; Vendor.shipments
apps/vendor/app/actions/shipment.ts                                 — CREATE createShipment, markShipmentDelivered, recomputeOrderStatus
apps/vendor/app/(dashboard)/orders/components/FulfillmentPanel.tsx  — MODIFY: shipment form + mark delivered
apps/vendor/app/(dashboard)/orders/[id]/page.tsx                    — MODIFY: pass shipment/courier data to the panel
apps/customer/app/orders/[id]/page.tsx                             — MODIFY: tracking section
apps/customer/app/orders/components/TrackingTimeline.tsx            — CREATE: milestone timeline
```

---

## Order status aggregation — `recomputeOrderStatus(orderId)`

Lives in `apps/vendor/app/actions/shipment.ts`, called after every shipment mutation.
```ts
async function recomputeOrderStatus(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { status: true, items: { select: { fulfillmentStatus: true } } },
  });
  if (!order) return;
  // Only aggregate within the fulfillment range; never touch PENDING/CANCELLED/REFUNDED.
  if (!["CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"].includes(order.status)) return;

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
    await prisma.order.update({ where: { id: orderId }, data: { status: next } });
  }
}
```
This is what advances an order to `DELIVERED`, which the **8b Payment agent's `refund_eligibility`** already keys on. (7b will refine handling for `RETURNED` items.)

---

## Vendor actions — `apps/vendor/app/actions/shipment.ts`

`"use server"`. Auth via `safeCurrentUser` + `getVendorByUserId` (same pattern as the existing `order.ts`). Courier validated against `getCourier(...)` from `@e-luna/ui/couriers`.

### `createShipment`
```ts
export async function createShipment(input: {
  orderId: string;
  courier: string;
  trackingNumber: string;
  estimatedDelivery?: string; // ISO date (optional)
}): Promise<{ success: boolean; error?: string; shipmentId?: string }> {
  const user = await safeCurrentUser();
  if (!user) return { success: false, error: "Not signed in" };
  const vendor = await getVendorByUserId(user.id);
  if (!vendor) return { success: false, error: "Vendor not found" };

  if (!input.trackingNumber.trim()) return { success: false, error: "Tracking number is required" };
  if (!getCourier(input.courier)) return { success: false, error: "Unknown courier" };

  // The vendor's un-shipped items in this order.
  const items = await prisma.orderItem.findMany({
    where: { orderId: input.orderId, vendorId: vendor.id, fulfillmentStatus: { in: ["PENDING", "PROCESSING"] } },
    select: { id: true },
  }).catch(() => []);
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
```

### `markShipmentDelivered`
```ts
export async function markShipmentDelivered(
  shipmentId: string
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
      await tx.shipment.update({ where: { id: shipmentId }, data: { status: "DELIVERED", deliveredAt: new Date() } });
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

The existing `updateFulfillmentStatus` is kept for the `PENDING → PROCESSING` pre-ship step; `SHIPPED`/`DELIVERED` now flow exclusively through shipments (the FulfillmentPanel no longer offers per-item SHIPPED/DELIVERED buttons).

---

## Vendor UI — `FulfillmentPanel`

Given the vendor's items in the order, grouped by state:
- **Un-shipped items** (`PENDING`/`PROCESSING`): show a **Create Shipment** form — a courier `<select>` populated from `COURIERS`, a tracking-number `<input>`, an optional estimated-delivery `<input type="date">`, and a submit button calling `createShipment({ orderId, courier, trackingNumber, estimatedDelivery })`. One shipment covers all the vendor's currently-un-shipped items in the order. (The existing "Mark Processing" control for `PENDING → PROCESSING` stays.)
- **Shipped, not delivered** (a shipment exists, `status !== DELIVERED`): show courier + tracking number and a **Mark Delivered** button → `markShipmentDelivered(shipmentId)`.
- **Delivered**: show a delivered state with `deliveredAt`.

Errors from the actions render inline (reuse the panel's existing error display pattern). It remains a client component using `useTransition` like the current panel.

---

## Customer tracking — `orders/[id]/page.tsx` + `TrackingTimeline`

The order-detail server component additionally fetches `shipments` and each item's `shipmentId`, then renders a **Shipments** section. Items are grouped by `shipmentId`:
- For each shipment: `courierName(courier)`, the tracking number as a **deep-link** (`trackingUrl(courier, trackingNumber)`, `target="_blank" rel="noopener noreferrer"`; plain text if the builder returns `null`), a `<TrackingTimeline status={shipment.status} />`, `estimatedDelivery`, and `deliveredAt` when present.
- Items **not yet in a shipment** are listed under a "Preparing your order" group.

`TrackingTimeline` (server component, `apps/customer/app/orders/components/TrackingTimeline.tsx`) renders the honest milestone ladder from `ShipmentStatus`:
```
Created → In Transit → Out for Delivery → Delivered
```
It highlights milestones up to and including the current status; `FAILED`/`RETURNED` render a distinct terminal state. It fabricates no timestamps beyond what the shipment carries (`createdAt`, `deliveredAt`). No `ShipmentEvent` table — the courier deep-link is the source of fine-grained live detail.

---

## Error Handling

- **Ownership:** `createShipment` only touches `OrderItem`s where `vendorId === vendor.id`; `markShipmentDelivered` checks `shipment.vendorId === vendor.id`. The customer page keeps its existing order-ownership check.
- **Validation:** empty tracking number → error; unknown courier id → error; no shippable items → error; delivering an already-delivered shipment → error.
- **Atomicity:** shipment creation + item linking, and delivery + item updates, each run in a `prisma.$transaction`.
- **Aggregation safety:** `recomputeOrderStatus` never moves an order out of `PENDING`/`CANCELLED`/`REFUNDED`; guards empty item sets.
- All Prisma reads `.catch()`-guarded; actions return `{ success, error }`.

---

## Testing

No automated suite (repo-consistent). Per task:
```bash
pnpm --filter @e-luna/db db:generate                                      # regenerate client for new relations (offline)
cd apps/vendor && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts"     # clean
cd apps/customer && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts"   # clean
cd apps/vendor && npx next lint 2>&1 | tail -3                             # no new errors
cd apps/customer && npx next lint 2>&1 | tail -3                           # no new errors
```
Final task runs repo-wide `pnpm lint` + `pnpm --filter "@e-luna/*" exec tsc --noEmit`.

**Manual smoke (documented, needs a running app + DB):** vendor opens an order → Create Shipment (courier + tracking) → items become `SHIPPED`, order → `SHIPPED`; customer order page shows the shipment + tracking deep-link + timeline; vendor Mark Delivered → items + order → `DELIVERED`; the 8b Payment agent's `refund_eligibility` now returns eligible for that order.

**Operator note:** applying the schema (`db push`) against the live database is an operator step, matching the payments phase.

---

## Boundary with 7b (Returns)

7a establishes the `DELIVERED` order/shipment state that returns depend on. 7b will add the customer return-request flow, vendor/admin approval, Stripe refund (reusing `StripeGateway.refund`), restock, and refine `recomputeOrderStatus`/status display for `RETURNED` items. No return UI or `Return`-model writes are in 7a.
