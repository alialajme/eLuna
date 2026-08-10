# Phase 7b: Returns & Refunds — Design Spec

## Goal

Bring the unused `Return` model to life as a vendor-driven returns lifecycle: a customer requests a return on a delivered item, the vendor approves/rejects it, marks it received, and issues a refund that runs the real payment gateway, optionally restocks, and reverses the vendor's payout — reusing the Stripe refund built in the Payments phase. As a prerequisite, the payment gateway is extracted into a shared `@e-luna/payments` package so the vendor app can execute refunds.

---

## Scope

**In scope:**
- Extract `apps/customer/app/lib/payment/*` → `packages/payments` (`@e-luna/payments`); update customer imports; keep customer checkout green.
- Customer action `requestReturn`; vendor actions `approveReturn`/`rejectReturn`/`markReturnReceived`/`refundReturn`.
- A shared, `RETURNED`-aware `recomputeOrderStatus` helper (extracted from 7a's `shipment.ts`).
- Customer order-page return controls + status; vendor `/returns` queue + a nav link.

**Out of scope (later / YAGNI):**
- Partial-quantity returns (a return covers the whole order item; the model has no quantity field).
- Admin returns oversight (this phase is vendor-driven; admin can be added later).
- Return shipping labels / courier pickup (no schema for it; the customer ships it back out of band).
- Refund to Luna wallet as an alternative destination (refund goes to the original payment method via the gateway).
- The Logistics *agent* (8c).

---

## Architecture

### Current state (verified)
- `Return { id, orderItemId, variantId, status ReturnStatus @default(REQUESTED), reason, approvalNotes String?, refundAmount Decimal, isRestocked Boolean @default(false), createdAt, updatedAt }`; relations `orderItem` (onDelete Cascade), `variant`; `@@index([orderItemId]) @@index([status])`. **Unused — no code references it.**
- `ReturnStatus = REQUESTED | APPROVED | REJECTED | RECEIVED | REFUNDED`.
- `ProductVariant.stock Int` (restock target). `OrderItem.fulfillmentStatus` includes `RETURNED`. `OrderItem` has `quantity`, `unitPrice`, `vendorId`, `variantId`, `shipmentId` (7a).
- `PaymentTransaction { status PaymentStatus, externalRef String?, method, amount }`; `PaymentStatus` includes `REFUNDED`, `PARTIALLY_REFUNDED`. The order's captured transaction carries the gateway `externalRef` (Stripe PaymentIntent id).
- Payment gateway lib at `apps/customer/app/lib/payment/` (11 files). Imported only by `apps/customer/app/actions/checkout.ts` (`factory→getGateway`, `config→hasStripe`, `stripe→StripeGateway`, `reconcile→applyPaymentResult`) and `apps/customer/app/api/webhooks/stripe/route.ts` (`stripe`, `reconcile`, `config`). `StripePaymentForm.tsx` uses `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` directly (no lib import).
- 7a's `recomputeOrderStatus` is a private helper inside `apps/vendor/app/actions/shipment.ts`.
- Vendor nav: `apps/vendor/app/(dashboard)/components/Sidebar.tsx` `NAV_ITEMS` array.
- No schema change is needed for 7b.

### Prerequisite refactor — `packages/payments` (`@e-luna/payments`)
Move the 11 files (`gateway, config, reconcile, stripe, tap, noqodi, neopay, simulated, tabby, tamara, factory`) from `apps/customer/app/lib/payment/` into `packages/payments/src/` unchanged (their **relative** imports stay valid; `reconcile.ts`'s `@e-luna/db` import stays valid). Add:
- `packages/payments/package.json` — `{"name":"@e-luna/payments","private":true,"exports":{".":"./src/index.ts"},"dependencies":{"stripe":"^22.0.0","@e-luna/db":"workspace:*"}}`.
- `packages/payments/tsconfig.json` — extends `@e-luna/config/tsconfig/base`.
- `packages/payments/src/index.ts` — barrel:
  ```ts
  export * from "./gateway";
  export { getGateway } from "./factory";
  export { StripeGateway } from "./stripe";
  export { applyPaymentResult } from "./reconcile";
  export { hasStripe, hasTap, hasNoqodi, hasNeopay, stripeConfig } from "./config";
  ```
Add `"@e-luna/payments": "workspace:*"` to `apps/customer/package.json` and `apps/vendor/package.json`; run `pnpm install`. Update the two customer files' imports to `@e-luna/payments`. **Delete** `apps/customer/app/lib/payment/`. Customer checkout/webhook must type-check unchanged.

### Files
```
packages/payments/**                                              — CREATE (moved gateway + package.json/tsconfig/index)
apps/customer/app/lib/payment/                                     — DELETE
apps/customer/app/actions/checkout.ts                             — MODIFY imports → @e-luna/payments
apps/customer/app/api/webhooks/stripe/route.ts                    — MODIFY imports → @e-luna/payments
apps/customer/package.json, apps/vendor/package.json              — MODIFY add @e-luna/payments dep
apps/vendor/app/lib/order-status.ts                              — CREATE shared recomputeOrderStatus (RETURNED-aware)
apps/vendor/app/actions/shipment.ts                             — MODIFY use shared helper (drop local copy)
apps/customer/app/actions/returns.ts                            — CREATE requestReturn
apps/customer/app/orders/[id]/page.tsx                          — MODIFY per-item return control + status
apps/customer/app/orders/components/ReturnButton.tsx            — CREATE (client)
apps/vendor/app/actions/returns.ts                             — CREATE approve/reject/markReceived/refundReturn
apps/vendor/app/(dashboard)/returns/page.tsx                    — CREATE returns queue
apps/vendor/app/(dashboard)/returns/components/ReturnActions.tsx — CREATE (client)
apps/vendor/app/(dashboard)/components/Sidebar.tsx             — MODIFY add "Returns" nav item
```

---

## Shared order-status helper — `apps/vendor/app/lib/order-status.ts`

Extracted from 7a and extended for `RETURNED`.
```ts
import { prisma } from "@e-luna/db";

const AGGREGATE_RANGE = ["CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"];

export async function recomputeOrderStatus(orderId: string): Promise<void> {
  const order = await prisma.order
    .findUnique({ where: { id: orderId }, select: { status: true, items: { select: { fulfillmentStatus: true } } } })
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
`shipment.ts` drops its private copy and imports this. (`DELIVERED → REFUNDED` is allowed because `DELIVERED` is in the range; once `REFUNDED`, it's terminal and no longer recomputed.)

---

## Customer action — `apps/customer/app/actions/returns.ts`

```ts
"use server";
// requestReturn(orderItemId, reason)
```
- Auth `safeCurrentUser` → `CustomerProfile` (`{ id }`); 401/403-style `{success:false}` if missing.
- Load the order item with: `order { customerId, updatedAt }`, `quantity`, `unitPrice`, `variantId`, `fulfillmentStatus`, `shipment { deliveredAt }`, `returns { status }`.
- **Ownership:** `orderItem.order.customerId === profile.id`.
- **Eligibility:** `fulfillmentStatus === "DELIVERED"`; `Date.now() - (shipment?.deliveredAt ?? order.updatedAt) ≤ 14 days`; no existing `Return` whose `status !== "REJECTED"`; `reason.trim()` non-empty.
- Create `Return { orderItemId, variantId, status: "REQUESTED", reason, refundAmount: Number(unitPrice) * quantity, isRestocked: false }`.
- `revalidatePath('/orders/'+orderId)`; return `{ success: true }`.

---

## Vendor actions — `apps/vendor/app/actions/returns.ts`

`"use server"`. Auth `safeCurrentUser` + `getVendorByUserId`. A private helper loads the return joined to its order item and asserts ownership + expected precursor status:
```ts
// loadOwnedReturn(returnId, vendorId, expected: ReturnStatus)
//   → { ret, orderItem } | { error }
//   fetches Return + orderItem { vendorId, orderId, variantId, quantity }
//   errors: not found / orderItem.vendorId !== vendorId ("Unauthorized") / ret.status !== expected ("Invalid status")
```

- **`approveReturn(id, notes?)`** — expected `REQUESTED` → `APPROVED`, set `approvalNotes`.
- **`rejectReturn(id, notes?)`** — expected `REQUESTED` → `REJECTED`, set `approvalNotes`.
- **`markReturnReceived(id)`** — expected `APPROVED` → `RECEIVED`.
- **`refundReturn(id, restock: boolean)`** — expected `RECEIVED`:
  1. Load the order (`id`, `paymentMethod`) + its captured `PaymentTransaction { id, externalRef }` + `refundAmount`, `variantId`, `quantity`, `orderId`.
  2. `const gw = getGateway(order.paymentMethod); const r = await gw.refund({ externalRef: tx?.externalRef ?? "", amount: Number(refundAmount) });`
  3. **If `!r.success` → return `{ success:false, error: r.error ?? "Refund failed" }` (no state change).**
  4. On success, in a `$transaction`: `Return` → `REFUNDED` + `isRestocked = restock`; `OrderItem.fulfillmentStatus` → `RETURNED`; if `restock`, `variant.update({ stock: { increment: quantity } })`; recompute whether **all** the order's items are now `RETURNED` → set the `PaymentTransaction.status` to `REFUNDED`, else `PARTIALLY_REFUNDED`.
  5. `await recomputeOrderStatus(orderId)`; `revalidatePath('/returns')`; return `{ success:true }`.

All actions vendor-scoped; every transition guards its precursor status (idempotency + no skipping). `OrderItem → RETURNED` removes the item from the 6c-i payout sum (which counts `DELIVERED` items) — the payout reversal is implicit.

---

## Customer UI — `orders/[id]/page.tsx` + `ReturnButton`

The order query additionally includes each item's `returns { id, status }` and (already present via 7a) its shipment's `deliveredAt`. Per item, server-side compute:
- `existingReturn` = the item's non-`REJECTED` return, if any.
- `canReturn` = `fulfillmentStatus === "DELIVERED"` && within 14 days && no `existingReturn`.

Render: if `existingReturn`, a status line ("Return requested / approved / received / refunded"); else if `canReturn`, a `<ReturnButton orderItemId={item.id} />`. `ReturnButton` (client, `useTransition`) toggles a reason `<textarea>` + Submit → `requestReturn(orderItemId, reason)` → `router.refresh()`; inline error on failure. Placed within the existing item grouping; Totals/Address/Help unchanged.

## Vendor UI — `/returns` + `ReturnActions` + nav

- **`(dashboard)/returns/page.tsx`** (server): resolve vendor; list `Return`s where `orderItem.vendorId === vendor.id`, newest first, with `orderItem { quantity, order { id }, variant { product { title }, size, color } }`. Show product, order ref, reason, `refundAmount`, status badge, and `<ReturnActions returnId status />`.
- **`ReturnActions.tsx`** (client, `useTransition` + `router.refresh()`): renders the buttons valid for the current status — `REQUESTED` → Approve / Reject (each with an optional notes prompt); `APPROVED` → Mark Received; `RECEIVED` → Issue Refund with a "Restock" checkbox; `REJECTED`/`REFUNDED` → terminal (no buttons). Inline error on failure.
- **`Sidebar.tsx`**: add `{ icon: "↩️", label: "Returns", href: "/returns" }` to `NAV_ITEMS` (after Orders).

---

## Error Handling

- **Ownership:** customer owns the order item (`order.customerId === profile.id`); vendor owns the return's order item (`orderItem.vendorId === vendor.id`).
- **State guards:** every transition checks the exact precursor status → `{success:false,error:"Invalid status"}`; prevents double-refunds and skipping steps.
- **Refund atomicity:** the gateway refund runs **before** any DB write; on gateway failure nothing transitions. The success path's DB writes are one `$transaction`.
- **Eligibility:** non-delivered / out-of-window / duplicate / empty-reason requests are rejected with a clear message.
- All Prisma reads `.catch()`-guarded; Decimals via `Number()`; actions return `{ success, error }`.

---

## Testing

No automated suite (repo-consistent). Per task:
```bash
pnpm install --frozen-lockfile          # after adding @e-luna/payments dep (lockfile updated in the extraction task)
pnpm --filter @e-luna/db db:generate
cd apps/customer && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts"   # clean (imports swapped)
cd apps/vendor   && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts"   # clean
# lint both apps
```
Final task: repo-wide `pnpm lint` + `pnpm --filter "@e-luna/*" exec tsc --noEmit`.

**Extraction guard:** after the move, `grep -rn "lib/payment" apps/customer` returns nothing.

**Manual smoke (running app + DB):** deliver an order (7a) → customer Request Return (reason) → vendor `/returns`: Approve → Mark Received → Issue Refund (Restock ✓) → the item shows `RETURNED`, `variant.stock` incremented, the `PaymentTransaction` is `REFUNDED`/`PARTIALLY_REFUNDED`, and once all items are returned the order flips to `REFUNDED`. With Stripe keys set, a real refund is issued against the PaymentIntent; without keys the simulated gateway returns success.

---

## Boundary notes

- The 8b Payment agent's `refund_eligibility` already reads `PaymentTransaction` `REFUNDED`/`PARTIALLY_REFUNDED` for its `alreadyRefunded` check and `Order.status === "DELIVERED"` — both are now driven by this flow, so its advice stays truthful.
- Real return **pickup/logistics** (courier collection) is deferred with the rest of the courier-API integration.
