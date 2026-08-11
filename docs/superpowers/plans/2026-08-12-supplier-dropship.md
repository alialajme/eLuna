# Supplier Dropship → Customer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a vendor mark a product as dropshipped by a supplier; the supplier fulfils + ships directly to the customer via the courier gateway, invisible to the customer, with the vendor's own ship control disabled for those items.

**Architecture:** Add `Product.dropshipSupplierId` + `Shipment.supplierId`. Extract the customer-order fulfilment state machine (`recomputeOrderStatus` + `applyShipmentStatus`) into `@e-luna/db` so both vendor and supplier share one source of truth. The supplier gets a Customer-fulfilment queue and a ship action that reuses `@e-luna/courier` + the existing `Shipment` model. Checkout, payout, and the customer order view are untouched.

**Tech Stack:** Turborepo + pnpm, Next.js 15 App Router, Prisma + PostgreSQL (`db push`, no migration files), TypeScript. Verification = `db:generate` + `tsc --noEmit` + `pnpm lint` + gitleaks (no test suite).

**Conventions:** server actions resolve the scope id (supplierId/vendorId) from the Clerk session, never a client param; ownership + state guards on every mutation; DB reads `.catch`-guarded. Commit trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: Extract order-status helpers to `@e-luna/db` + repoint vendor

**Files:**
- Create: `packages/db/src/order-status.ts`
- Modify: `packages/db/src/index.ts`
- Delete: `apps/vendor/app/lib/order-status.ts`, `apps/vendor/app/lib/courier/apply-status.ts`
- Modify: `apps/vendor/app/actions/shipment.ts`, `apps/vendor/app/api/webhooks/courier/[courier]/route.ts`

- [ ] **Step 1: `packages/db/src/order-status.ts`** (moves both helpers; note internal import is `./client`)
```ts
import { prisma } from "./client";
import type { ShipmentStatus } from "@prisma/client";

const AGGREGATE_RANGE = ["CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"];

/** Aggregate a customer order's status from its items' fulfillment. Never touches PENDING/CANCELLED/REFUNDED. */
export async function recomputeOrderStatus(orderId: string): Promise<void> {
  const order = await prisma.order
    .findUnique({
      where: { id: orderId },
      select: { status: true, items: { select: { fulfillmentStatus: true } } },
    })
    .catch(() => null);
  if (!order) return;
  if (!AGGREGATE_RANGE.includes(order.status)) return;

  const s = order.items.map((i) => i.fulfillmentStatus);
  const next =
    s.length > 0 && s.every((x) => x === "RETURNED")
      ? "REFUNDED"
      : s.length > 0 && s.every((x) => x === "DELIVERED" || x === "RETURNED")
        ? "DELIVERED"
        : s.some((x) => x === "SHIPPED" || x === "DELIVERED")
          ? "SHIPPED"
          : s.some((x) => x === "PROCESSING")
            ? "PROCESSING"
            : "CONFIRMED";

  if (next !== order.status) {
    await prisma.order.update({ where: { id: orderId }, data: { status: next } }).catch(() => null);
  }
}

/** Idempotently apply a shipment status; DELIVERED also flips items + timestamps and recomputes the order. */
export async function applyShipmentStatus(shipmentId: string, status: ShipmentStatus): Promise<void> {
  const shipment = await prisma.shipment
    .findUnique({ where: { id: shipmentId }, select: { orderId: true, status: true } })
    .catch(() => null);
  if (!shipment || shipment.status === status) return;

  if (status === "DELIVERED") {
    await prisma
      .$transaction(async (tx) => {
        await tx.shipment.update({ where: { id: shipmentId }, data: { status: "DELIVERED", deliveredAt: new Date() } });
        await tx.orderItem.updateMany({ where: { shipmentId }, data: { fulfillmentStatus: "DELIVERED" } });
      })
      .catch(() => null);
  } else {
    await prisma.shipment.update({ where: { id: shipmentId }, data: { status } }).catch(() => null);
  }
  await recomputeOrderStatus(shipment.orderId);
}
```

- [ ] **Step 2: Export from `packages/db/src/index.ts`** — add after the existing exports:
```ts
export * from "./order-status";
```

- [ ] **Step 3: Delete the vendor-local copies**
```bash
git rm apps/vendor/app/lib/order-status.ts apps/vendor/app/lib/courier/apply-status.ts
```

- [ ] **Step 4: Repoint `apps/vendor/app/actions/shipment.ts`.** It currently imports:
```ts
import { recomputeOrderStatus } from "../lib/order-status";
import { getCourierGateway } from "@e-luna/courier";
import { applyShipmentStatus } from "../lib/courier/apply-status";
```
Replace those three lines with:
```ts
import { recomputeOrderStatus, applyShipmentStatus } from "@e-luna/db";
import { getCourierGateway } from "@e-luna/courier";
```

- [ ] **Step 5: Repoint the vendor courier webhook** `apps/vendor/app/api/webhooks/courier/[courier]/route.ts`. Change:
```ts
import { applyShipmentStatus } from "../../../../lib/courier/apply-status";
```
to (merge into the existing `@e-luna/db` import line, which currently imports `prisma, type ShipmentStatus`):
```ts
import { prisma, type ShipmentStatus, applyShipmentStatus } from "@e-luna/db";
```
and remove the now-duplicate `import { prisma, type ShipmentStatus } from "@e-luna/db";` line if separate. (Net: one import line from `@e-luna/db` bringing `prisma`, `ShipmentStatus`, `applyShipmentStatus`; keep the `CourierStatusEvent`/`getCourierGateway` imports from `@e-luna/courier`.)

- [ ] **Step 6: Regenerate + type-check**
```bash
pnpm --filter @e-luna/db db:generate
pnpm --filter @e-luna/vendor exec tsc --noEmit
```
Expected: exit 0. (`@e-luna/db` has no separate tsc script; it's covered by the workspace typecheck in Task 7.)

- [ ] **Step 7: Commit**
```bash
git add packages/db/src/order-status.ts packages/db/src/index.ts apps/vendor/app/lib \
  apps/vendor/app/actions/shipment.ts "apps/vendor/app/api/webhooks/courier/[courier]/route.ts"
git commit -m "refactor(db): extract recomputeOrderStatus + applyShipmentStatus to @e-luna/db"
```

---

### Task 2: Prisma — Product.dropshipSupplierId + Shipment.supplierId

**Files:** Modify `packages/db/prisma/schema.prisma`

- [ ] **Step 1: `Product.dropshipSupplierId`** — in `model Product`, add a field alongside `vendorId` and a relation + index. Add the field line:
```prisma
  dropshipSupplierId String?
```
Add the relation (in the relations block of `model Product`, alongside `vendor Vendor @relation(...)`):
```prisma
  dropshipSupplier Supplier? @relation("SupplierDropshipProducts", fields: [dropshipSupplierId], references: [id])
```
Add an index (with the other `@@index` lines of `model Product`):
```prisma
  @@index([dropshipSupplierId])
```

- [ ] **Step 2: `Shipment.supplierId`** — in `model Shipment`, add the field:
```prisma
  supplierId String?
```
Add the relation (alongside the existing `vendor`/`order` relations of `model Shipment`):
```prisma
  supplier Supplier? @relation("SupplierCustomerShipments", fields: [supplierId], references: [id])
```
Add an index:
```prisma
  @@index([supplierId])
```

- [ ] **Step 3: Back-relations on `model Supplier`** — add both:
```prisma
  dropshipProducts  Product[]  @relation("SupplierDropshipProducts")
  customerShipments Shipment[] @relation("SupplierCustomerShipments")
```

- [ ] **Step 4: Generate + push**
```bash
pnpm --filter @e-luna/db db:generate && pnpm --filter @e-luna/db db:push
```
Expected: "Your database is now in sync with your Prisma schema."

- [ ] **Step 5: Commit**
```bash
git add packages/db/prisma/schema.prisma
git commit -m "feat(db): Product.dropshipSupplierId + Shipment.supplierId"
```

---

### Task 3: Vendor product form — assign a dropship supplier

**Files:** Modify `apps/vendor/app/actions/product.ts`, `apps/vendor/app/(dashboard)/products/components/ProductForm.tsx`, `apps/vendor/app/(dashboard)/products/new/page.tsx`, `apps/vendor/app/(dashboard)/products/[id]/page.tsx`

- [ ] **Step 1: `ProductData` gains the field.** In `apps/vendor/app/actions/product.ts`, in the `ProductData` type add:
```ts
  dropshipSupplierId?: string | null;
```

- [ ] **Step 2: A shared validator.** In `product.ts`, add a helper above `createProduct`:
```ts
async function resolveDropshipSupplierId(raw: string | null | undefined): Promise<{ id: string | null } | { error: string }> {
  if (!raw) return { id: null };
  const supplier = await prisma.supplier
    .findFirst({ where: { id: raw, status: "ACTIVE" }, select: { id: true } })
    .catch(() => null);
  if (!supplier) return { error: "Selected supplier is not available" };
  return { id: supplier.id };
}
```

- [ ] **Step 3: Use it in `createProduct`.** After the category validation block (before `try {`), add:
```ts
  const ds = await resolveDropshipSupplierId(data.dropshipSupplierId);
  if ("error" in ds) return { success: false, error: ds.error };
```
In the `prisma.product.create({ data: { ... } })` object, add after `vendorId: vendor.id,`:
```ts
        dropshipSupplierId: ds.id,
```

- [ ] **Step 4: Use it in `updateProduct`.** After the category validation block (before `try {`), add:
```ts
  const ds = await resolveDropshipSupplierId(data.dropshipSupplierId);
  if ("error" in ds) return { success: false, error: ds.error };
```
In the `prisma.product.update({ where: { id }, data: { ... } })` object, add after `status: data.status,`:
```ts
        dropshipSupplierId: ds.id,
```

- [ ] **Step 5: `ProductForm` accepts suppliers + a picker.** In `ProductForm.tsx`:
  - Add to the `InitialData` type: `dropshipSupplierId?: string | null;`
  - Add to `Props`: `suppliers: { id: string; companyName: string }[];`
  - Update the signature: `export function ProductForm({ productId, initialData, categories, suppliers }: Props) {`
  - Add state (near the other `useState` calls):
```tsx
  const [dropshipSupplierId, setDropshipSupplierId] = useState<string>(initialData?.dropshipSupplierId ?? "");
```
  - Render the picker (place near the category `<select>` in the form JSX):
```tsx
        <div className="space-y-1">
          <label htmlFor="dropship" className="text-body-xs text-mist">Fulfilment</label>
          <select id="dropship" value={dropshipSupplierId} onChange={(e) => setDropshipSupplierId(e.target.value)}
            className="w-full rounded-lg border border-sand px-3 py-2 text-body-sm text-ink bg-ivory">
            <option value="">In-house (I ship this)</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>Dropship — {s.companyName}</option>
            ))}
          </select>
          <p className="text-body-xs text-mist">Choose a supplier to have them ship this product directly to the customer.</p>
        </div>
```
  - In the object passed to `createProduct`/`updateProduct` (the `ProductData` payload the submit handler builds), add:
```tsx
      dropshipSupplierId: dropshipSupplierId || null,
```

- [ ] **Step 6: Feed suppliers into both pages.** In `apps/vendor/app/(dashboard)/products/new/page.tsx` and `.../products/[id]/page.tsx`, fetch ACTIVE suppliers and pass them. Add near the existing `getCategories()` call:
```tsx
  const suppliers = await prisma.supplier
    .findMany({ where: { status: "ACTIVE" }, select: { id: true, companyName: true }, orderBy: { companyName: "asc" } })
    .catch(() => []);
```
Pass `suppliers={suppliers}` to `<ProductForm ... />`. In the `[id]` (edit) page, also include `dropshipSupplierId: product.dropshipSupplierId` in the `initialData` object built for `ProductForm`, and ensure the product query selects/returns `dropshipSupplierId` (it does by default with `findUnique`/no `select`, or add it to the `select`). If `prisma` isn't already imported in these pages, add `import { prisma } from "@e-luna/db";`.

- [ ] **Step 7: Type-check + lint**
```bash
pnpm --filter @e-luna/vendor exec tsc --noEmit && pnpm --filter @e-luna/vendor lint
```
Expected: clean.

- [ ] **Step 8: Commit**
```bash
git add apps/vendor/app/actions/product.ts "apps/vendor/app/(dashboard)/products"
git commit -m "feat(vendor): assign a dropship supplier to a product"
```

---

### Task 4: Vendor fulfilment — exclude dropship items, show read-only group

**Files:** Modify `apps/vendor/app/actions/shipment.ts`, `apps/vendor/app/(dashboard)/orders/[id]/page.tsx`, `apps/vendor/app/(dashboard)/orders/components/FulfillmentPanel.tsx`

- [ ] **Step 1: `createShipment` excludes dropship items.** In `apps/vendor/app/actions/shipment.ts`, the shippable-items query is `prisma.orderItem.findMany({ where: { orderId, vendorId, fulfillmentStatus: { in: ["PENDING","PROCESSING"] } }, ... })`. Add a dropship exclusion to that `where`:
```ts
      where: {
        orderId: input.orderId,
        vendorId: vendor.id,
        fulfillmentStatus: { in: ["PENDING", "PROCESSING"] },
        variant: { product: { dropshipSupplierId: null } },
      },
```

- [ ] **Step 2: Order-detail computes dropship info.** In `apps/vendor/app/(dashboard)/orders/[id]/page.tsx`, the items query includes `variant: { include: { product: { select: { title: true } } } }`. Extend the product select to include the dropship supplier:
```ts
        variant: { include: { product: { select: { title: true, dropshipSupplierId: true, dropshipSupplier: { select: { companyName: true } } } } } },
```
Then, where the page maps items for `FulfillmentPanel`, pass a per-item dropship name. Change the `items` prop mapping to:
```tsx
            items={items.map((i) => ({
              id: i.id,
              fulfillmentStatus: i.fulfillmentStatus,
              shipmentId: i.shipmentId,
              dropshipSupplierName: i.variant.product.dropshipSupplierId ? (i.variant.product.dropshipSupplier?.companyName ?? "supplier") : null,
            }))}
```

- [ ] **Step 3: `FulfillmentPanel` renders the read-only dropship group + excludes those items from shipping.** In `FulfillmentPanel.tsx`:
  - Extend the `Item` type:
```ts
type Item = { id: string; fulfillmentStatus: string; shipmentId: string | null; dropshipSupplierName: string | null };
```
  - Split dropship items out and exclude them from `unshipped`. Replace the `const unshipped = ...` line with:
```tsx
  const dropshipItems = items.filter((i) => i.dropshipSupplierName);
  const unshipped = items.filter(
    (i) => !i.dropshipSupplierName && !i.shipmentId && (i.fulfillmentStatus === "PENDING" || i.fulfillmentStatus === "PROCESSING"),
  );
```
  - Render a read-only note (place just under the `<h3>Fulfillment</h3>`):
```tsx
      {dropshipItems.length > 0 && (
        <p className="text-body-xs text-mist">
          {dropshipItems.length} item(s) fulfilled by {dropshipItems[0]!.dropshipSupplierName} (dropship) — the supplier ships these directly.
        </p>
      )}
```
  (The existing `allDelivered` / shipments rendering is unchanged; dropship items still flow through the normal shipment display once the supplier ships them, since they get a `shipmentId`.)

- [ ] **Step 4: Type-check + lint**
```bash
pnpm --filter @e-luna/vendor exec tsc --noEmit && pnpm --filter @e-luna/vendor lint
```
Expected: clean.

- [ ] **Step 5: Commit**
```bash
git add apps/vendor/app/actions/shipment.ts "apps/vendor/app/(dashboard)/orders"
git commit -m "feat(vendor): exclude dropship items from vendor fulfilment (supplier ships them)"
```

---

### Task 5: Supplier dropship actions

**Files:** Create `apps/supplier/app/actions/dropship.ts`

- [ ] **Step 1: Write the actions**
```ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma, recomputeOrderStatus, applyShipmentStatus } from "@e-luna/db";
import { getCourier } from "@e-luna/ui/couriers";
import { getCourierGateway } from "@e-luna/courier";
import { safeCurrentUser } from "../lib/auth";
import { getSupplierByUserId } from "../lib/supplier";

async function resolveActiveSupplier(): Promise<{ id: string } | { error: string }> {
  const user = await safeCurrentUser();
  if (!user) return { error: "Not signed in" };
  const supplier = await getSupplierByUserId(user.id);
  if (!supplier) return { error: "Not a supplier" };
  if (supplier.status !== "ACTIVE") return { error: "Your supplier account is not active" };
  return { id: supplier.id };
}

const PAID = ["CONFIRMED", "PROCESSING"];

export async function shipDropshipItems(input: {
  orderId: string;
  vendorId: string;
  courier: string;
  trackingNumber?: string;
  trackingNote?: string;
}): Promise<{ success: boolean; error?: string }> {
  const auth = await resolveActiveSupplier();
  if ("error" in auth) return { success: false, error: auth.error };
  if (!getCourier(input.courier)) return { success: false, error: "Unknown courier" };

  const order = await prisma.order
    .findUnique({
      where: { id: input.orderId },
      select: {
        status: true,
        address: { select: { fullName: true, addressLine1: true, city: true, emirate: true } },
        items: {
          where: {
            vendorId: input.vendorId,
            fulfillmentStatus: { in: ["PENDING", "PROCESSING"] },
            shipmentId: null,
            variant: { product: { dropshipSupplierId: auth.id } },
          },
          select: { id: true },
        },
      },
    })
    .catch(() => null);
  if (!order) return { success: false, error: "Not found" };
  if (!PAID.includes(order.status)) return { success: false, error: "Order is not ready to fulfil" };
  if (order.items.length === 0) return { success: false, error: "No items to fulfil for this order" };

  const result = await getCourierGateway(input.courier).createShipment({
    reference: input.orderId,
    courier: input.courier,
    destination: {
      name: order.address.fullName,
      addressLine1: order.address.addressLine1,
      city: order.address.city,
      emirate: order.address.emirate,
    },
  });
  if (result.status === "failed") return { success: false, error: result.error };

  let trackingNumber: string;
  let externalRef: string | null = null;
  let labelUrl: string | null = null;
  if (result.status === "created") {
    trackingNumber = result.trackingNumber;
    externalRef = result.externalRef;
    labelUrl = result.labelUrl ?? null;
  } else {
    if (!input.trackingNumber?.trim()) return { success: false, error: "Tracking number is required" };
    trackingNumber = input.trackingNumber.trim();
  }

  const itemIds = order.items.map((i) => i.id);
  try {
    await prisma.$transaction(async (tx) => {
      const shipment = await tx.shipment.create({
        data: {
          orderId: input.orderId,
          vendorId: input.vendorId,
          supplierId: auth.id,
          courier: input.courier,
          trackingNumber,
          externalRef,
          labelUrl,
          status: "IN_TRANSIT",
        },
      });
      await tx.orderItem.updateMany({
        where: { id: { in: itemIds } },
        data: { shipmentId: shipment.id, fulfillmentStatus: "SHIPPED" },
      });
    });
    await recomputeOrderStatus(input.orderId);
    revalidatePath("/fulfilment");
    revalidatePath("/");
    return { success: true };
  } catch {
    return { success: false, error: "Failed to create shipment" };
  }
}

export async function markDropshipDelivered(shipmentId: string): Promise<{ success: boolean; error?: string }> {
  const auth = await resolveActiveSupplier();
  if ("error" in auth) return { success: false, error: auth.error };

  const shipment = await prisma.shipment
    .findUnique({ where: { id: shipmentId }, select: { supplierId: true, status: true } })
    .catch(() => null);
  if (!shipment || shipment.supplierId !== auth.id) return { success: false, error: "Not found" };
  if (shipment.status === "DELIVERED") return { success: false, error: "Already delivered" };

  try {
    await applyShipmentStatus(shipmentId, "DELIVERED");
    revalidatePath("/fulfilment");
    revalidatePath("/");
    return { success: true };
  } catch {
    return { success: false, error: "Failed to mark delivered" };
  }
}
```

- [ ] **Step 2: Type-check** (the page + island in Task 6 consume these; if tsc errors only on a missing `/fulfilment` page import, that's expected until Task 6)
```bash
pnpm --filter @e-luna/supplier exec tsc --noEmit
```
Defer the commit to the end of Task 6 (they ship together).

---

### Task 6: Supplier Customer-fulfilment queue + nav

**Files:** Create `apps/supplier/app/(dashboard)/fulfilment/page.tsx`, `apps/supplier/app/(dashboard)/fulfilment/FulfilmentActions.tsx`; modify `apps/supplier/app/(dashboard)/components/Sidebar.tsx`, `apps/supplier/app/(dashboard)/page.tsx` (dashboard card — optional if a card grid exists)

- [ ] **Step 1: `FulfilmentActions.tsx` island** (ship a group + mark delivered)
```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { COURIERS } from "@e-luna/ui/couriers";
import { shipDropshipItems, markDropshipDelivered } from "../../actions/dropship";

const primaryBtn =
  "rounded-full bg-ink px-5 py-2.5 text-body-sm font-medium text-ivory hover:bg-ink/90 transition-colors disabled:opacity-50";

export function ShipGroup({ orderId, vendorId }: { orderId: string; vendorId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [courier, setCourier] = useState(COURIERS[0]?.id ?? "");
  const [trackingNumber, setTrackingNumber] = useState("");

  function ship() {
    setError(null);
    startTransition(async () => {
      const r = await shipDropshipItems({ orderId, vendorId, courier, trackingNumber: trackingNumber || undefined });
      if (!r.success) { setError(r.error ?? "Something went wrong"); return; }
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <select value={courier} onChange={(e) => setCourier(e.target.value)}
        className="w-full rounded-xl border border-sand px-4 py-2.5 text-body-sm text-ink bg-white focus:outline-none focus:border-ink">
        {COURIERS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <input value={trackingNumber} maxLength={100} onChange={(e) => setTrackingNumber(e.target.value)}
        placeholder="Tracking number (required unless auto-generated)"
        className="w-full rounded-xl border border-sand px-4 py-2.5 text-body-sm text-ink bg-white focus:outline-none focus:border-ink" />
      <button type="button" disabled={isPending || !courier} className={primaryBtn} onClick={ship}>Ship to customer</button>
      {error && <p className="text-body-xs text-coral">{error}</p>}
    </div>
  );
}

export function DeliverButton({ shipmentId }: { shipmentId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function deliver() {
    setError(null);
    startTransition(async () => {
      const r = await markDropshipDelivered(shipmentId);
      if (!r.success) { setError(r.error ?? "Something went wrong"); return; }
      router.refresh();
    });
  }

  return (
    <div className="space-y-1">
      <button type="button" disabled={isPending} className={primaryBtn} onClick={deliver}>Mark delivered</button>
      {error && <p className="text-body-xs text-coral">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: `fulfilment/page.tsx`** — the queue (to-ship groups) + shipped list
```tsx
import { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@e-luna/db";
import { courierName, trackingUrl } from "@e-luna/ui/couriers";
import { safeCurrentUser } from "../../lib/auth";
import { getSupplierByUserId } from "../../lib/supplier";
import { ShipGroup, DeliverButton } from "./FulfilmentActions";

export const metadata: Metadata = { title: "Customer Orders — Luna Supplier" };

export default async function FulfilmentPage() {
  const user = await safeCurrentUser();
  if (!user) redirect("/");
  const supplier = await getSupplierByUserId(user.id);
  if (!supplier) redirect("/");

  // To-ship: unshipped dropship items for this supplier on paid orders, grouped by (order, vendor).
  const items = await prisma.orderItem
    .findMany({
      where: {
        fulfillmentStatus: { in: ["PENDING", "PROCESSING"] },
        shipmentId: null,
        order: { status: { in: ["CONFIRMED", "PROCESSING"] } },
        variant: { product: { dropshipSupplierId: supplier.id } },
      },
      select: {
        id: true, quantity: true, orderId: true, vendorId: true,
        variant: { select: { size: true, color: true, product: { select: { title: true } } } },
        order: { select: { createdAt: true, address: { select: { fullName: true, addressLine1: true, city: true, emirate: true } } } },
        vendor: { select: { storeName: true } },
      },
      orderBy: { order: { createdAt: "asc" } },
    })
    .catch(() => []);

  const groups = new Map<string, { orderId: string; vendorId: string; vendorName: string; createdAt: Date; address: { fullName: string; addressLine1: string; city: string; emirate: string | null }; lines: { id: string; title: string; size: string; color: string; quantity: number }[] }>();
  for (const it of items) {
    const key = `${it.orderId}:${it.vendorId}`;
    const g = groups.get(key) ?? {
      orderId: it.orderId, vendorId: it.vendorId, vendorName: it.vendor.storeName,
      createdAt: it.order.createdAt, address: it.order.address,
      lines: [],
    };
    g.lines.push({ id: it.id, title: it.variant.product.title, size: it.variant.size, color: it.variant.color, quantity: it.quantity });
    groups.set(key, g);
  }

  const shipments = await prisma.shipment
    .findMany({
      where: { supplierId: supplier.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, courier: true, trackingNumber: true, status: true, orderId: true },
    })
    .catch(() => []);

  const fmt = (d: Date) => new Date(d).toLocaleDateString("en-AE", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="max-w-3xl space-y-8">
      <h2 className="font-display text-display-md text-ink">Customer Orders</h2>

      <section className="space-y-4">
        <p className="text-label text-mist">TO SHIP</p>
        {groups.size === 0 ? (
          <div className="rounded-2xl border border-dashed border-sand bg-ivory py-12 text-center">
            <p className="text-body-md text-ink">Nothing to fulfil</p>
            <p className="text-body-sm text-mist mt-1">Dropship orders assigned to you appear here.</p>
          </div>
        ) : (
          [...groups.values()].map((g) => (
            <div key={`${g.orderId}:${g.vendorId}`} className="rounded-2xl border border-sand bg-ivory p-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-body-md font-medium text-ink">Order #{g.orderId.slice(-8).toUpperCase()}</p>
                <p className="text-body-xs text-mist">{fmt(g.createdAt)} · for {g.vendorName}</p>
              </div>
              <div className="text-body-sm text-mist">
                <p className="text-ink">Ship to: {g.address.fullName}</p>
                <p>{g.address.addressLine1}, {g.address.city}{g.address.emirate ? `, ${g.address.emirate}` : ""}, UAE</p>
              </div>
              <ul className="text-body-sm text-ink border-t border-sand pt-2">
                {g.lines.map((l) => (
                  <li key={l.id} className="flex justify-between py-0.5">
                    <span>{l.title} · {l.size}/{l.color}</span>
                    <span className="text-mist">×{l.quantity}</span>
                  </li>
                ))}
              </ul>
              <ShipGroup orderId={g.orderId} vendorId={g.vendorId} />
            </div>
          ))
        )}
      </section>

      {shipments.length > 0 && (
        <section className="space-y-3">
          <p className="text-label text-mist">SHIPPED</p>
          {shipments.map((s) => (
            <div key={s.id} className="rounded-2xl border border-sand bg-ivory p-5 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-body-sm font-medium text-ink">Order #{s.orderId.slice(-8).toUpperCase()}</p>
                <p className="text-body-xs text-mist">
                  {courierName(s.courier)}
                  {s.trackingNumber ? (trackingUrl(s.courier, s.trackingNumber) ? <> · <a href={trackingUrl(s.courier, s.trackingNumber)!} target="_blank" rel="noopener noreferrer" className="text-gold hover:underline">{s.trackingNumber}</a></> : ` · ${s.trackingNumber}`) : ""}
                  {" · "}{s.status.replace(/_/g, " ").toLowerCase()}
                </p>
              </div>
              {s.status !== "DELIVERED" && <DeliverButton shipmentId={s.id} />}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Sidebar nav.** In `apps/supplier/app/(dashboard)/components/Sidebar.tsx` `NAV_ITEMS`, add after "Incoming Orders":
```tsx
  { icon: "📦", label: "Customer Orders", href: "/fulfilment" },
```

- [ ] **Step 4: Type-check + lint the supplier app**
```bash
pnpm --filter @e-luna/supplier exec tsc --noEmit && pnpm --filter @e-luna/supplier lint
```
Expected: clean.

- [ ] **Step 5: Commit Tasks 5–6 together**
```bash
git add apps/supplier/app/actions/dropship.ts "apps/supplier/app/(dashboard)/fulfilment" \
  "apps/supplier/app/(dashboard)/components/Sidebar.tsx"
git commit -m "feat(supplier): customer dropship fulfilment queue + ship/deliver actions"
```

---

### Task 7: Docs + full-workspace verification

**Files:** Modify `docs/deployment/couriers.md`

- [ ] **Step 1: Document the dropship path.** Append to `docs/deployment/couriers.md`:
```markdown

## Supplier dropship → customer

A vendor can set `Product.dropshipSupplierId` so a supplier fulfils that product directly to the customer.
The supplier's **Customer Orders** queue lists paid orders' dropship items (grouped by order + listing
vendor) with the customer's shipping address; the supplier ships via the same `@e-luna/courier` gateway
(Simulated → manual tracking with no keys), creating a `Shipment { vendorId, supplierId }`. Delivery is
marked manually by the supplier this phase; real-courier webhook auto-delivery for dropship shipments is a
later operator step (the customer never sees the supplier — only courier + tracking).
```

- [ ] **Step 2: Full typecheck**
```bash
pnpm --filter "@e-luna/*" exec tsc --noEmit
```
Expected: exit 0.

- [ ] **Step 3: Full lint**
```bash
pnpm lint
```
Expected: 4/4 apps pass (only the pre-existing customer `<img>` warnings).

- [ ] **Step 4: Sanity — no stale order-status imports**
```bash
grep -rn --include="*.ts" --include="*.tsx" "lib/order-status\|lib/courier/apply-status" apps/ || echo "no stale imports — clean"
```
Expected: "no stale imports — clean".

- [ ] **Step 5: Commit**
```bash
git add docs/deployment/couriers.md
git commit -m "docs: document supplier dropship fulfilment path"
```

---

## Notes for the implementer

- **`db push`, never migrations.**
- **Extraction (Task 1) is the foundation:** both `recomputeOrderStatus` and `applyShipmentStatus` now live in
  `@e-luna/db` (internal import is `./client`, not `@e-luna/db`). Vendor + supplier both import from `@e-luna/db`.
- **Tasks 5–6 commit together** (the actions and the page/island that call them).
- **Customer stays invisible:** no customer-app changes. A dropship `Shipment` renders on the customer order
  page via the existing generic shipment list (courier + tracking only); `supplierId` is never read there.
- **One shipment per (order, vendor) group** keeps 1 tracking# : 1 `Shipment` (so the courier webhook match stays unambiguous).
- Security: `supplierId`/`vendorId` server-resolved; `shipDropshipItems` only touches items that are this
  supplier's dropship items on a paid order; `markDropshipDelivered` ownership-checks `shipment.supplierId`.
