# Phase 7b: Returns & Refunds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A vendor-driven returns lifecycle on the existing `Return` model — customer requests a return on a delivered item; vendor approves/rejects, marks received, and issues a refund (real gateway) with optional restock and payout reversal.

**Architecture:** Extract the payment gateway to a shared `@e-luna/payments` package (so the vendor can run refunds); a shared `RETURNED`-aware `recomputeOrderStatus`; customer `requestReturn` + vendor `approve/reject/markReceived/refundReturn` server actions; customer order-page controls + vendor `/returns` queue.

**Tech Stack:** Next.js 15 (App Router), Prisma + PostgreSQL (no migration files — `db push`), Stripe (via `@e-luna/payments`), TypeScript (`noUncheckedIndexedAccess` on), Clerk.

---

## Context for the implementer (read once)

- **No automated test suite.** "Tests" = `npx tsc --noEmit` and `npx next lint`. Do NOT add a test runner.
- **`noUncheckedIndexedAccess` is ON** (`arr[0]?.x`, `?? fallback`). **Prisma `Decimal`** → `Number(...)`.
- **No schema change** in 7b (the `Return` model already exists). `prisma.return` is the model accessor (property access with a reserved word is valid).
- **Verified current state:**
  - `Return { id, orderItemId, variantId, status ReturnStatus @default(REQUESTED), reason, approvalNotes String?, refundAmount Decimal, isRestocked Boolean @default(false) }`; `ReturnStatus = REQUESTED|APPROVED|REJECTED|RECEIVED|REFUNDED`.
  - `ProductVariant.stock Int`. `OrderItem { quantity, unitPrice Decimal, vendorId, variantId, fulfillmentStatus (has RETURNED), shipmentId, order, variant, returns Return[], shipment Shipment? }`. `PaymentStatus` includes `REFUNDED`, `PARTIALLY_REFUNDED`.
  - Payment gateway lib: `apps/customer/app/lib/payment/` — 11 files: `gateway, config, reconcile, stripe, tap, noqodi, neopay, simulated, tabby, tamara, factory`. Their imports of each other are **relative**; `reconcile.ts` imports `@e-luna/db`. `stripe`/`config` are the only files importing the `stripe` npm pkg.
  - Importers: `apps/customer/app/actions/checkout.ts` lines 7/9/10/11 (`../lib/payment/factory` getGateway; `../lib/payment/config` hasStripe; `../lib/payment/stripe` StripeGateway; `../lib/payment/reconcile` applyPaymentResult) and `apps/customer/app/api/webhooks/stripe/route.ts` lines 1/2/3 (`../../../lib/payment/stripe`, `.../reconcile`, `.../config`). `StripePaymentForm.tsx` does NOT import the lib.
  - 7a's `recomputeOrderStatus` is a private helper in `apps/vendor/app/actions/shipment.ts` (with a `const FULFILLMENT_RANGE = [...]`). Vendor actions auth via `safeCurrentUser` (`../lib/auth`) + `getVendorByUserId` (`../lib/vendor`).
  - Customer `orders/[id]/page.tsx`: order query includes `items { variant { product } }`, `shipments { orderBy createdAt asc }` (all), `paymentTransactions take:1`; ownership-checked; has an `ItemRow` helper at file end and renders items grouped by shipment (`shipmentItems.map(... <ItemRow item={item} />)`) + an unshipped group. `order.updatedAt` and each shipment's `deliveredAt` are available.
  - Vendor nav: `apps/vendor/app/(dashboard)/components/Sidebar.tsx` `NAV_ITEMS` array (Dashboard, Products, Orders, Inventory, Analytics, Payouts, Settings).
  - Reference package shape (`packages/ai`): `tsconfig.json` extends `@e-luna/config/tsconfig/base`; `package.json` has `dependencies` (incl. `@e-luna/db: workspace:*`) + `devDependencies` (`@e-luna/config`, `typescript`).

---

## File Structure

```
packages/payments/package.json, tsconfig.json, src/index.ts           — CREATE
packages/payments/src/{11 gateway files}                              — MOVED from apps/customer/app/lib/payment
apps/customer/app/lib/payment/                                         — DELETED
apps/customer/app/actions/checkout.ts, api/webhooks/stripe/route.ts    — MODIFY imports → @e-luna/payments
apps/customer/package.json, apps/vendor/package.json                   — MODIFY add @e-luna/payments
apps/vendor/app/lib/order-status.ts                                   — CREATE shared recomputeOrderStatus
apps/vendor/app/actions/shipment.ts                                  — MODIFY use shared helper
apps/customer/app/actions/returns.ts                                 — CREATE requestReturn
apps/customer/app/orders/components/ReturnButton.tsx                 — CREATE
apps/customer/app/orders/[id]/page.tsx                               — MODIFY return controls
apps/vendor/app/actions/returns.ts                                  — CREATE vendor return actions
apps/vendor/app/(dashboard)/returns/page.tsx                        — CREATE queue
apps/vendor/app/(dashboard)/returns/components/ReturnActions.tsx    — CREATE
apps/vendor/app/(dashboard)/components/Sidebar.tsx                  — MODIFY nav
```

---

## Task 1: Extract payment gateway → `@e-luna/payments`

**Files:** Create `packages/payments/{package.json,tsconfig.json,src/index.ts}`; move 11 files; modify 2 customer importers + 2 app `package.json`; delete old dir.

- [ ] **Step 1: Create `packages/payments/package.json`**

```json
{
  "name": "@e-luna/payments",
  "version": "0.0.1",
  "private": true,
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "@e-luna/db": "workspace:*",
    "stripe": "^22.4.0"
  },
  "devDependencies": {
    "@e-luna/config": "workspace:*",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create `packages/payments/tsconfig.json`**

```json
{
  "extends": "@e-luna/config/tsconfig/base",
  "compilerOptions": {
    "paths": {}
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Move the 11 gateway files (preserving git history + relative imports)**

Run:
```bash
cd /Users/alialajme/Projects/Luna/e-luna
mkdir -p packages/payments/src
for f in gateway config reconcile stripe tap noqodi neopay simulated tabby tamara factory; do
  git mv "apps/customer/app/lib/payment/$f.ts" "packages/payments/src/$f.ts"
done
rmdir apps/customer/app/lib/payment 2>/dev/null || true
```
Expected: 11 files now under `packages/payments/src/`; the old dir is gone.

- [ ] **Step 4: Create `packages/payments/src/index.ts`**

```ts
export * from "./gateway";
export { getGateway } from "./factory";
export { StripeGateway } from "./stripe";
export { applyPaymentResult } from "./reconcile";
export { hasStripe, hasTap, hasNoqodi, hasNeopay, stripeConfig } from "./config";
```

- [ ] **Step 5: Repoint the customer imports**

In `apps/customer/app/actions/checkout.ts`, change the module path on all four payment imports to `@e-luna/payments` (leave the imported names as-is):
- line 7 `from "../lib/payment/factory";` → `from "@e-luna/payments";`
- line 9 `from "../lib/payment/config";` → `from "@e-luna/payments";`
- line 10 `from "../lib/payment/stripe";` → `from "@e-luna/payments";`
- line 11 `from "../lib/payment/reconcile";` → `from "@e-luna/payments";`

In `apps/customer/app/api/webhooks/stripe/route.ts`, lines 1-3:
- `from "../../../lib/payment/stripe";` → `from "@e-luna/payments";`
- `from "../../../lib/payment/reconcile";` → `from "@e-luna/payments";`
- `from "../../../lib/payment/config";` → `from "@e-luna/payments";`

(Multiple `import { ... } from "@e-luna/payments"` lines are valid TS — no need to consolidate.)

- [ ] **Step 6: Add the dependency to both apps**

In `apps/customer/package.json` and `apps/vendor/package.json`, add to `"dependencies"`:
```json
    "@e-luna/payments": "workspace:*",
```

- [ ] **Step 7: Install (updates the lockfile)**

Run: `cd /Users/alialajme/Projects/Luna/e-luna && pnpm install 2>&1 | tail -4`
Expected: success; `pnpm-lock.yaml` updated with the new workspace package.

- [ ] **Step 8: Verify the move is complete + type-check**

Run:
```bash
cd /Users/alialajme/Projects/Luna/e-luna
grep -rn "lib/payment" apps/customer || echo "NO stale lib/payment refs (good)"
cd apps/customer && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts" | tail -8
```
Expected: no stale refs; tsc clean. (`@e-luna/payments` resolves; `getGateway`/`StripeGateway`/`applyPaymentResult`/`hasStripe` all come from the barrel.)

- [ ] **Step 9: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna
git add -A
git commit -m "refactor(payments): extract gateway to @e-luna/payments package

Move apps/customer/app/lib/payment/* into packages/payments so both apps can
use the gateway (vendor refunds in 7b). Customer imports repointed; checkout
+ webhook unchanged in behavior.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Shared `RETURNED`-aware order-status helper

**Files:** Create `apps/vendor/app/lib/order-status.ts`; Modify `apps/vendor/app/actions/shipment.ts`.

- [ ] **Step 1: Create `apps/vendor/app/lib/order-status.ts`**

```ts
import { prisma } from "@e-luna/db";

const AGGREGATE_RANGE = ["CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"];

export async function recomputeOrderStatus(orderId: string): Promise<void> {
  const order = await prisma.order
    .findUnique({
      where: { id: orderId },
      select: { status: true, items: { select: { fulfillmentStatus: true } } },
    })
    .catch(() => null);
  if (!order) return;
  if (!AGGREGATE_RANGE.includes(order.status)) return; // never touch PENDING/CANCELLED/REFUNDED

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
```

- [ ] **Step 2: Use the shared helper in `shipment.ts`**

In `apps/vendor/app/actions/shipment.ts`, DELETE the local `const FULFILLMENT_RANGE = [...]` line and the entire private `async function recomputeOrderStatus(orderId: string) { ... }`. Add an import near the top (after the existing imports):
```ts
import { recomputeOrderStatus } from "../lib/order-status";
```
The existing `await recomputeOrderStatus(...)` calls now resolve to the imported function.

- [ ] **Step 3: Type-check the vendor app**

Run: `cd /Users/alialajme/Projects/Luna/e-luna/apps/vendor && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts" | tail -6`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna
git add apps/vendor/app/lib/order-status.ts apps/vendor/app/actions/shipment.ts
git commit -m "refactor(vendor): extract recomputeOrderStatus + make it RETURNED-aware

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Customer return request (action + button + page)

**Files:** Create `apps/customer/app/actions/returns.ts`, `apps/customer/app/orders/components/ReturnButton.tsx`; Modify `apps/customer/app/orders/[id]/page.tsx`.

- [ ] **Step 1: Create `apps/customer/app/actions/returns.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../lib/auth";

const RETURN_WINDOW_MS = 14 * 86_400_000;

export async function requestReturn(
  orderItemId: string,
  reason: string,
): Promise<{ success: boolean; error?: string }> {
  const user = await safeCurrentUser();
  if (!user) return { success: false, error: "Please sign in" };
  const profile = await prisma.customerProfile
    .findUnique({ where: { userId: user.id }, select: { id: true } })
    .catch(() => null);
  if (!profile) return { success: false, error: "Customer profile not found" };

  if (!reason.trim()) return { success: false, error: "Please provide a reason" };

  const item = await prisma.orderItem
    .findUnique({
      where: { id: orderItemId },
      select: {
        quantity: true,
        unitPrice: true,
        variantId: true,
        fulfillmentStatus: true,
        order: { select: { customerId: true, updatedAt: true } },
        shipment: { select: { deliveredAt: true } },
        returns: { select: { status: true } },
      },
    })
    .catch(() => null);
  if (!item) return { success: false, error: "Item not found" };
  if (item.order.customerId !== profile.id) return { success: false, error: "Not your order" };
  if (item.fulfillmentStatus !== "DELIVERED") {
    return { success: false, error: "Only delivered items can be returned" };
  }

  const deliveredAt = item.shipment?.deliveredAt ?? item.order.updatedAt;
  if (Date.now() - new Date(deliveredAt).getTime() > RETURN_WINDOW_MS) {
    return { success: false, error: "The 14-day return window has passed" };
  }
  if (item.returns.some((r) => r.status !== "REJECTED")) {
    return { success: false, error: "A return already exists for this item" };
  }

  try {
    await prisma.return.create({
      data: {
        orderItemId,
        variantId: item.variantId,
        status: "REQUESTED",
        reason: reason.trim(),
        refundAmount: Number(item.unitPrice) * item.quantity,
        isRestocked: false,
      },
    });
    revalidatePath("/orders");
    return { success: true };
  } catch {
    return { success: false, error: "Could not submit return request" };
  }
}
```

- [ ] **Step 2: Create `apps/customer/app/orders/components/ReturnButton.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requestReturn } from "../../actions/returns";

export function ReturnButton({ orderItemId }: { orderItemId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    if (!reason.trim()) {
      setError("Please add a reason");
      return;
    }
    startTransition(async () => {
      const r = await requestReturn(orderItemId, reason);
      if (!r.success) {
        setError(r.error ?? "Failed to submit");
        return;
      }
      setOpen(false);
      router.refresh();
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 text-body-sm text-gold hover:underline"
      >
        Request return
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason for return"
        rows={2}
        className="w-full rounded-lg border border-sand px-3 py-2 text-body-sm text-ink bg-ivory placeholder:text-mist"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={isPending}
          className="rounded-full bg-ink px-4 py-1.5 text-body-sm font-medium text-ivory hover:bg-ink/90 disabled:opacity-50 transition-colors"
        >
          {isPending ? "Submitting…" : "Submit"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-body-sm text-mist hover:text-ink">
          Cancel
        </button>
      </div>
      {error && <p className="text-body-xs text-coral">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Add `returns` to the item query in `apps/customer/app/orders/[id]/page.tsx`**

In the `order` query's `items.include`, add a `returns` selection next to `variant`. Change:
```tsx
      items: {
        include: {
          variant: {
            include: {
              product: { select: { title: true, slug: true, aiImages: true } },
            },
          },
        },
      },
```
to:
```tsx
      items: {
        include: {
          variant: {
            include: {
              product: { select: { title: true, slug: true, aiImages: true } },
            },
          },
          returns: { select: { id: true, status: true } },
        },
      },
```

- [ ] **Step 4: Add the `ReturnButton` import at the top of the page**

After the existing `import { TrackingTimeline } from "../components/TrackingTimeline";` line, add:
```tsx
import { ReturnButton } from "../components/ReturnButton";
```

- [ ] **Step 5: Pass a return control into the shipment-grouped items**

Find the shipment-group item map:
```tsx
                {shipmentItems.map((item) => (
                  <ItemRow key={item.id} item={item} />
                ))}
```
Replace with:
```tsx
                {shipmentItems.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    returnNode={returnControl(item, s.deliveredAt, order.updatedAt)}
                  />
                ))}
```

- [ ] **Step 6: Extend `ItemRow` to render an optional return control**

In the `ItemRow` helper at the end of the file, change the signature/props to add `returnNode`:
```tsx
function ItemRow({
  item,
  returnNode,
}: {
  item: {
    id: string;
    quantity: number;
    unitPrice: unknown;
    variant: { size: string; color: string; product: { title: string; slug: string; aiImages: unknown } };
  };
  returnNode?: React.ReactNode;
}) {
```
And inside its `<div className="flex-1">`, after the `<p className="text-body-sm text-mist">Qty: {item.quantity}</p>` line, add:
```tsx
        {returnNode}
```

- [ ] **Step 7: Add the `returnControl` helper at the end of the file (after `ItemRow`)**

```tsx
function returnControl(
  item: { id: string; fulfillmentStatus: string; returns: { status: string }[] },
  deliveredAt: Date | null,
  orderUpdatedAt: Date,
) {
  const active = item.returns.find((r) => r.status !== "REJECTED");
  if (active) {
    return <p className="mt-1 text-body-xs text-mist">Return: {active.status.toLowerCase()}</p>;
  }
  if (item.fulfillmentStatus !== "DELIVERED") return null;
  const anchor = deliveredAt ?? orderUpdatedAt;
  if (Date.now() - new Date(anchor).getTime() > 14 * 86_400_000) return null;
  return <ReturnButton orderItemId={item.id} />;
}
```

- [ ] **Step 8: Type-check + lint the customer app**

Run:
```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/customer
npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts" | tail -8
npx next lint 2>&1 | tail -6
```
Expected: tsc clean (the `item` passed to `returnControl` structurally satisfies its param since the query now includes `returns` and `fulfillmentStatus` is a scalar); no new lint errors.

- [ ] **Step 9: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna
git add apps/customer/app/actions/returns.ts apps/customer/app/orders/components/ReturnButton.tsx "apps/customer/app/orders/[id]/page.tsx"
git commit -m "feat(customer): request-return control on delivered items

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Vendor return actions

**Files:** Create `apps/vendor/app/actions/returns.ts`.

- [ ] **Step 1: Create `apps/vendor/app/actions/returns.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@e-luna/db";
import { getGateway } from "@e-luna/payments";
import { safeCurrentUser } from "../lib/auth";
import { getVendorByUserId } from "../lib/vendor";
import { recomputeOrderStatus } from "../lib/order-status";

type Result = { success: boolean; error?: string };

async function resolveVendorId(): Promise<{ vendorId?: string; error?: string }> {
  const user = await safeCurrentUser();
  if (!user) return { error: "Not signed in" };
  const vendor = await getVendorByUserId(user.id);
  if (!vendor) return { error: "Vendor not found" };
  return { vendorId: vendor.id };
}

type OwnedReturn = {
  id: string;
  refundAmount: unknown;
  orderItem: { id: string; orderId: string; variantId: string; quantity: number };
};

async function loadOwnedReturn(
  returnId: string,
  vendorId: string,
  expected: string,
): Promise<{ data?: OwnedReturn; error?: string }> {
  const ret = await prisma.return
    .findUnique({
      where: { id: returnId },
      select: {
        id: true,
        status: true,
        refundAmount: true,
        orderItem: {
          select: { id: true, orderId: true, variantId: true, quantity: true, vendorId: true },
        },
      },
    })
    .catch(() => null);
  if (!ret) return { error: "Return not found" };
  if (ret.orderItem.vendorId !== vendorId) return { error: "Unauthorized" };
  if (ret.status !== expected) return { error: "Invalid status for this action" };
  return {
    data: {
      id: ret.id,
      refundAmount: ret.refundAmount,
      orderItem: {
        id: ret.orderItem.id,
        orderId: ret.orderItem.orderId,
        variantId: ret.orderItem.variantId,
        quantity: ret.orderItem.quantity,
      },
    },
  };
}

export async function approveReturn(returnId: string, notes?: string): Promise<Result> {
  const a = await resolveVendorId();
  if (!a.vendorId) return { success: false, error: a.error };
  const l = await loadOwnedReturn(returnId, a.vendorId, "REQUESTED");
  if (!l.data) return { success: false, error: l.error };
  try {
    await prisma.return.update({ where: { id: returnId }, data: { status: "APPROVED", approvalNotes: notes ?? null } });
    revalidatePath("/returns");
    return { success: true };
  } catch {
    return { success: false, error: "Failed to approve" };
  }
}

export async function rejectReturn(returnId: string, notes?: string): Promise<Result> {
  const a = await resolveVendorId();
  if (!a.vendorId) return { success: false, error: a.error };
  const l = await loadOwnedReturn(returnId, a.vendorId, "REQUESTED");
  if (!l.data) return { success: false, error: l.error };
  try {
    await prisma.return.update({ where: { id: returnId }, data: { status: "REJECTED", approvalNotes: notes ?? null } });
    revalidatePath("/returns");
    return { success: true };
  } catch {
    return { success: false, error: "Failed to reject" };
  }
}

export async function markReturnReceived(returnId: string): Promise<Result> {
  const a = await resolveVendorId();
  if (!a.vendorId) return { success: false, error: a.error };
  const l = await loadOwnedReturn(returnId, a.vendorId, "APPROVED");
  if (!l.data) return { success: false, error: l.error };
  try {
    await prisma.return.update({ where: { id: returnId }, data: { status: "RECEIVED" } });
    revalidatePath("/returns");
    return { success: true };
  } catch {
    return { success: false, error: "Failed to update" };
  }
}

export async function refundReturn(returnId: string, restock: boolean): Promise<Result> {
  const a = await resolveVendorId();
  if (!a.vendorId) return { success: false, error: a.error };
  const l = await loadOwnedReturn(returnId, a.vendorId, "RECEIVED");
  if (!l.data) return { success: false, error: l.error };
  const { id, refundAmount, orderItem } = l.data;

  const order = await prisma.order
    .findUnique({
      where: { id: orderItem.orderId },
      select: {
        paymentMethod: true,
        paymentTransactions: { select: { id: true, externalRef: true }, take: 1 },
        items: { select: { id: true, fulfillmentStatus: true } },
      },
    })
    .catch(() => null);
  if (!order) return { success: false, error: "Order not found" };
  const tx = order.paymentTransactions[0] ?? null;

  // Money first — abort with no state change if the gateway refund fails.
  const gw = getGateway(order.paymentMethod);
  const refund = await gw.refund({ externalRef: tx?.externalRef ?? "", amount: Number(refundAmount) });
  if (!refund.success) return { success: false, error: refund.error ?? "Refund failed" };

  const allReturned = order.items.every(
    (i) => i.id === orderItem.id || i.fulfillmentStatus === "RETURNED",
  );

  try {
    await prisma.$transaction(async (dbtx) => {
      await dbtx.return.update({ where: { id }, data: { status: "REFUNDED", isRestocked: restock } });
      await dbtx.orderItem.update({ where: { id: orderItem.id }, data: { fulfillmentStatus: "RETURNED" } });
      if (restock) {
        await dbtx.productVariant.update({
          where: { id: orderItem.variantId },
          data: { stock: { increment: orderItem.quantity } },
        });
      }
      if (tx) {
        await dbtx.paymentTransaction.update({
          where: { id: tx.id },
          data: { status: allReturned ? "REFUNDED" : "PARTIALLY_REFUNDED" },
        });
      }
    });
    await recomputeOrderStatus(orderItem.orderId);
    revalidatePath("/returns");
    return { success: true };
  } catch {
    return { success: false, error: "Refund issued but records failed to update — contact support" };
  }
}
```

- [ ] **Step 2: Type-check the vendor app**

Run: `cd /Users/alialajme/Projects/Luna/e-luna/apps/vendor && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts" | tail -6`
Expected: clean. (`getGateway` from `@e-luna/payments`; `order.paymentMethod` is a `PaymentMethod` enum, assignable to `getGateway`'s `string` param.)

- [ ] **Step 3: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna
git add apps/vendor/app/actions/returns.ts
git commit -m "feat(vendor): return actions (approve/reject/receive/refund) with gateway refund + restock

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Vendor returns queue + nav

**Files:** Create `apps/vendor/app/(dashboard)/returns/page.tsx`, `apps/vendor/app/(dashboard)/returns/components/ReturnActions.tsx`; Modify `apps/vendor/app/(dashboard)/components/Sidebar.tsx`.

- [ ] **Step 1: Create `apps/vendor/app/(dashboard)/returns/components/ReturnActions.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  approveReturn,
  rejectReturn,
  markReturnReceived,
  refundReturn,
} from "../../../actions/returns";

export function ReturnActions({ returnId, status }: { returnId: string; status: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [restock, setRestock] = useState(true);

  const run = (fn: () => Promise<{ success: boolean; error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.success) {
        setError(r.error ?? "Failed");
        return;
      }
      router.refresh();
    });
  };

  if (status === "REJECTED" || status === "REFUNDED") return null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-sand pt-3">
      {status === "REQUESTED" && (
        <>
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(() => approveReturn(returnId))}
            className="rounded-full bg-ink px-4 py-1.5 text-body-sm font-medium text-ivory hover:bg-gold hover:text-ink disabled:opacity-50 transition-colors"
          >
            Approve
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(() => rejectReturn(returnId))}
            className="rounded-full border border-sand px-4 py-1.5 text-body-sm font-medium text-ink hover:border-coral hover:text-coral disabled:opacity-50 transition-colors"
          >
            Reject
          </button>
        </>
      )}
      {status === "APPROVED" && (
        <button
          type="button"
          disabled={isPending}
          onClick={() => run(() => markReturnReceived(returnId))}
          className="rounded-full bg-ink px-4 py-1.5 text-body-sm font-medium text-ivory hover:bg-gold hover:text-ink disabled:opacity-50 transition-colors"
        >
          Mark Received
        </button>
      )}
      {status === "RECEIVED" && (
        <>
          <label className="flex items-center gap-2 text-body-sm text-ink">
            <input
              type="checkbox"
              checked={restock}
              onChange={(e) => setRestock(e.target.checked)}
              className="accent-ink"
            />
            Restock
          </label>
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(() => refundReturn(returnId, restock))}
            className="rounded-full bg-ink px-4 py-1.5 text-body-sm font-medium text-ivory hover:bg-gold hover:text-ink disabled:opacity-50 transition-colors"
          >
            {isPending ? "Processing…" : "Issue Refund"}
          </button>
        </>
      )}
      {error && <p className="w-full text-body-xs text-coral">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Create `apps/vendor/app/(dashboard)/returns/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { Metadata } from "next";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../../lib/auth";
import { getVendorByUserId } from "../../lib/vendor";
import { ReturnActions } from "./components/ReturnActions";

export const metadata: Metadata = { title: "Returns — Luna Vendor" };

const STATUS_STYLES: Record<string, string> = {
  REQUESTED: "bg-gold/20 text-gold",
  APPROVED: "bg-sage/20 text-sage",
  RECEIVED: "bg-ink/10 text-ink",
  REFUNDED: "bg-sage/20 text-sage",
  REJECTED: "bg-coral/20 text-coral",
};

export default async function ReturnsPage() {
  const user = await safeCurrentUser();
  if (!user) redirect("/");
  const vendor = await getVendorByUserId(user.id);
  if (!vendor) redirect("/");

  const returns = await prisma.return
    .findMany({
      where: { orderItem: { vendorId: vendor.id } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        reason: true,
        refundAmount: true,
        approvalNotes: true,
        orderItem: {
          select: {
            quantity: true,
            order: { select: { id: true } },
            variant: { select: { size: true, color: true, product: { select: { title: true } } } },
          },
        },
      },
    })
    .catch(() => []);

  return (
    <div className="max-w-4xl space-y-5">
      <h2 className="font-display text-display-md text-ink">Returns</h2>
      {returns.length === 0 ? (
        <p className="text-body-md text-mist">No return requests yet.</p>
      ) : (
        <div className="space-y-3">
          {returns.map((r) => (
            <div key={r.id} className="rounded-lg border border-sand bg-ivory p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-body-md font-medium text-ink">{r.orderItem.variant.product.title}</p>
                  <p className="text-body-sm text-mist">
                    {r.orderItem.variant.size} / {r.orderItem.variant.color} · Qty {r.orderItem.quantity}
                  </p>
                  <p className="text-body-sm text-mist mt-1">
                    Order #{r.orderItem.order.id.slice(-8).toUpperCase()}
                  </p>
                  <p className="mt-2 text-body-sm italic text-ink">{r.reason}</p>
                  {r.approvalNotes && <p className="mt-1 text-body-xs text-mist">Note: {r.approvalNotes}</p>}
                </div>
                <div className="shrink-0 text-right">
                  <span
                    className={`rounded-full px-3 py-1 text-label uppercase font-semibold ${
                      STATUS_STYLES[r.status] ?? "bg-sand text-ink"
                    }`}
                  >
                    {r.status}
                  </span>
                  <p className="mt-2 text-body-md font-medium text-ink">
                    AED {Number(r.refundAmount).toLocaleString("en-AE", { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
              <ReturnActions returnId={r.id} status={r.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add the "Returns" nav item in `Sidebar.tsx`**

In `apps/vendor/app/(dashboard)/components/Sidebar.tsx`, in `NAV_ITEMS`, add after the Orders entry (`{ icon: "📋", label: "Orders", href: "/orders" },`):
```tsx
  { icon: "↩️", label: "Returns", href: "/returns" },
```

- [ ] **Step 4: Type-check + lint the vendor app**

Run:
```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/vendor
npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts" | tail -8
npx next lint 2>&1 | tail -6
```
Expected: tsc clean; no new lint errors (reason is rendered as `{r.reason}` — no unescaped literal quotes).

- [ ] **Step 5: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna
git add "apps/vendor/app/(dashboard)/returns/page.tsx" "apps/vendor/app/(dashboard)/returns/components/ReturnActions.tsx" "apps/vendor/app/(dashboard)/components/Sidebar.tsx"
git commit -m "feat(vendor): returns queue page + actions UI + nav link

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Repo-wide green check

**Files:** none (verification only).

- [ ] **Step 1: Frozen install (mirror CI)**

Run: `cd /Users/alialajme/Projects/Luna/e-luna && pnpm install --frozen-lockfile 2>&1 | tail -3`
Expected: no lockfile change (the `@e-luna/payments` dep + lockfile were committed in Task 1).

- [ ] **Step 2: Regenerate the Prisma client**

Run: `cd /Users/alialajme/Projects/Luna/e-luna && pnpm --filter @e-luna/db db:generate 2>&1 | tail -2`
Expected: success.

- [ ] **Step 3: Repo-wide lint**

Run: `cd /Users/alialajme/Projects/Luna/e-luna && pnpm lint 2>&1 | tail -15`
Expected: all apps pass (pre-existing `<img>` warnings acceptable; no new errors).

- [ ] **Step 4: Repo-wide type check**

Run: `cd /Users/alialajme/Projects/Luna/e-luna && pnpm --filter "@e-luna/*" exec tsc --noEmit 2>&1 | tail -15`
Expected: clean (includes the new `@e-luna/payments` package).

- [ ] **Step 5: Verify the extraction + refund wiring (inspection)**

Run:
```bash
cd /Users/alialajme/Projects/Luna/e-luna
grep -rn "lib/payment" apps/customer && echo "STALE REFS (bad)" || echo "extraction clean"
grep -n "getGateway(order.paymentMethod).refund\|gw.refund" apps/vendor/app/actions/returns.ts
grep -n 'fulfillmentStatus: "RETURNED"' apps/vendor/app/actions/returns.ts
```
Expected: no stale `lib/payment` refs in the customer app; the vendor refund calls `gw.refund(...)` and sets the item `RETURNED`.

- [ ] **Step 6: Final commit (only if Steps 3-4 required fixes; otherwise skip)**

```bash
cd /Users/alialajme/Projects/Luna/e-luna
git add -A
git commit -m "chore(7b): lint/type fixes

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 7: Manual smoke note (not automated)**

Needs a running app + DB. Flow: deliver an order (7a) → customer order page → Request return (reason) → vendor `/returns`: Approve → Mark Received → Issue Refund (Restock ✓) → item shows `RETURNED`, `variant.stock += quantity`, `PaymentTransaction` → `REFUNDED`/`PARTIALLY_REFUNDED`, and once all items are returned the order → `REFUNDED`. With Stripe keys, a real refund is issued; without keys the simulated gateway returns success.

---

## Self-Review (completed)

**Spec coverage:**
- Extract gateway → `@e-luna/payments`; repoint customer imports; delete old dir → Task 1 ✓
- Shared `RETURNED`-aware `recomputeOrderStatus` → Task 2 ✓
- Customer `requestReturn` + eligibility (DELIVERED, 14-day, no active return, non-empty reason) → Task 3 ✓
- Customer UI return control + status → Task 3 ✓
- Vendor `approve/reject/markReceived/refundReturn` (ownership + precursor guards; refund before writes; RETURNED payout reversal; restock; PaymentTransaction status) → Task 4 ✓
- Vendor `/returns` queue + `ReturnActions` + nav → Task 5 ✓
- Repo-wide green + extraction guard → Task 6 ✓

**Placeholder scan:** none — every code step is complete.

**Type consistency:** `requestReturn(orderItemId, reason)`, `approveReturn/rejectReturn(returnId, notes?)`, `markReturnReceived(returnId)`, `refundReturn(returnId, restock)` signatures match between actions (Tasks 3/4) and their UI callers (Tasks 3/5). `recomputeOrderStatus(orderId)` is defined once (Task 2) and consumed by `shipment.ts` (Task 2) and `returns.ts` (Task 4). `ReturnButton({orderItemId})` and `ReturnActions({returnId,status})` props match usage. `@e-luna/payments` barrel exports (`getGateway`, `StripeGateway`, `applyPaymentResult`, `hasStripe`) cover all consumer imports (Tasks 1/4). `getGateway(...).refund({externalRef, amount})` matches the `RefundParams` type from the gateway.
