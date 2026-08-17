# Surface NeoPay in Checkout Design

**Status:** Approved (brainstorming) — 2026-08-17
**Relationship:** Completes the Payments Gateway work (Stripe Card/Apple/Google Pay live; Tap/Noqodi/NeoPay
are config-gated scaffolds). This is **feature #4 of 4** the user queued. It exposes the existing NeoPay
scaffold in the customer checkout picker, safely.

## Goal

Let a customer select **NeoPay** at checkout. NeoPay is already a config-gated gateway in `@e-luna/payments`
(`getGateway("NEOPAY")` → `NeopayGateway` when `hasNeopay()`, else `SimulatedGateway`). The only work is to
surface it in the UI and route it through the existing synchronous `placeOrder` path — **without allowing a
fake capture in production** when NeoPay is unconfigured (the `SimulatedGateway` fallback returns `captured`).

**Success criteria:** in development (no NeoPay keys) NeoPay appears in the checkout picker and completes an
order via the Simulated gateway exactly like Tabby/Tamara/Wallet do today; in production without keys NeoPay
is hidden **and** rejected server-side (no order, no fake capture); with real keys it routes to the
`NeopayGateway` (which currently returns "not configured" until an operator implements it). No schema change
(the `NEOPAY` enum value already exists).

## Confirmed Decisions

- **Single availability helper** — `neopayAvailable()` = `hasNeopay() || process.env.NODE_ENV !== "production"`,
  exported from `@e-luna/payments`, used by BOTH the checkout page (to show/hide) and `placeOrder` (to guard).
  One source of truth so UI and server can't drift.
- **Route through the existing synchronous `placeOrder` path** (like Tabby/Tamara/Wallet). No new redirect flow.
- **Server-side guard is authoritative** — `placeOrder` rejects `NEOPAY` when `!neopayAvailable()`, never
  trusting the client-rendered picker.
- **Only NeoPay** is surfaced. Tap/Noqodi remain unsurfaced (not in the picker, not in the `placeOrder`
  union) — out of scope.

## Non-Goals (deferred)

- The real NeoPay **hosted-redirect + webhook** flow. `placeOrder` handles synchronous
  `captured`/`failed` only; the real `NeopayGateway.createPayment` (redirect / `requires_action`) is an
  operator step, and the scaffold returns `failed` until then. Surfacing Tap/Noqodi is likewise deferred.

## Honesty Boundary (the crux)

`getGateway("NEOPAY")` falls back to `SimulatedGateway` (which returns `captured`) when `!hasNeopay()`. Naively
adding NeoPay to the picker would let a customer "pay" with NeoPay and receive a **fake capture in
production**. `neopayAvailable()` prevents this:

| Environment | `neopayAvailable()` | UI | Server (`placeOrder`) |
|---|---|---|---|
| Dev, no keys | true (non-prod) | shown | Simulated → `captured` (dev convenience, matches Tabby/Tamara/Wallet) |
| Prod, no keys | false | hidden | **rejected** (`{ success:false, error }`) — no order, no fake capture |
| Prod, with keys | true | shown | `NeopayGateway` → currently `failed` "not configured" until the operator implements it |

## Part A — Availability helper (`@e-luna/payments`)

Add to `packages/payments/src/config.ts`:
```ts
export const neopayAvailable = () => hasNeopay() || process.env.NODE_ENV !== "production";
```
Ensure it is re-exported from the package barrel (`packages/payments/src/index.ts` — `config.ts` is exported
there already; confirm `neopayAvailable` is reachable as `import { neopayAvailable } from "@e-luna/payments"`).

## Part B — Checkout page + `CheckoutForm` (`apps/customer`)

- **`checkout/page.tsx`** (server component) computes `neopayEnabled = neopayAvailable()` and passes it to
  `<CheckoutForm neopayEnabled={neopayEnabled} … />`.
- **`checkout/CheckoutForm.tsx`**:
  - Add a `neopayEnabled: boolean` prop.
  - The `PAYMENT_METHODS` list gains a NeoPay entry
    `{ value: "NEOPAY", label: "NeoPay", icon: "🇦🇪", desc: "UAE bank cards & wallets" }`, included **only when
    `neopayEnabled`** (filter the rendered list, or build the array conditionally). Placement: after
    Tamara / before Luna Wallet.
  - The submit handler's non-CARD branch already calls `placeOrder`; widen its `paymentMethod` cast union to
    include `"NEOPAY"` so NeoPay is passed through unchanged (NeoPay is synchronous here — no CARD/Stripe path).

## Part C — `placeOrder` guard (`apps/customer/app/actions/checkout.ts`)

- Widen the `PlaceOrderInput.paymentMethod` union to include `"NEOPAY"`:
  `"LUNA_WALLET" | "TABBY" | "TAMARA" | "CASH_ON_DELIVERY" | "NEOPAY"`.
- At the top of `placeOrder` (after the existing CARD-rejection guard), add:
  ```ts
  if (input.paymentMethod === "NEOPAY" && !neopayAvailable()) {
    return { success: false, error: "NeoPay is not available" };
  }
  ```
- Everything else is unchanged: `getGateway("NEOPAY").createPayment(...)` returns `captured` (Simulated, dev)
  or `failed` (NeopayGateway, prod-with-keys), and the existing `paymentResult.status === "failed"` handling
  surfaces the error. The persisted `Order.paymentMethod` / `PaymentTransaction.method` = `"NEOPAY"`.

## Part D — Docs

Note in `docs/deployment/payments.md` that NeoPay is now surfaced in checkout gated by `neopayAvailable()`
(dev-Simulated / prod-needs-keys), and that enabling it in production requires implementing
`NeopayGateway.createPayment` (hosted-redirect + webhook) before setting `NEOPAY_API_KEY` — otherwise
customers who select it get a clean "not configured" failure.

## Data Flow

1. Checkout page computes `neopayEnabled` → CheckoutForm renders NeoPay only when enabled.
2. Customer selects NeoPay → submit → `placeOrder({ paymentMethod: "NEOPAY", … })`.
3. `placeOrder` guards availability, then `getGateway("NEOPAY").createPayment(...)` → `captured` (dev) creates
   the order + `PaymentTransaction` (method NEOPAY); `failed` (prod scaffold) returns the error, no order.

## Error Handling

`placeOrder` returns `{ success, error? }`; the NeoPay availability guard is server-authoritative
(independent of the client picker). Gateway `failed` surfaces its message. No new failure modes beyond the
existing synchronous-method path.

## Testing

No automated suite — types + lint + manual:
1. `pnpm --filter "@e-luna/*" exec tsc --noEmit` — clean.
2. `pnpm lint` — clean.
3. gitleaks — clean.
4. Manual (dev, no keys): NeoPay appears in the picker; placing an order with NeoPay succeeds (Simulated
   capture), `Order.paymentMethod = NEOPAY`. Set `NODE_ENV=production` locally with no keys → NeoPay hidden;
   a crafted `placeOrder({paymentMethod:"NEOPAY"})` returns "NeoPay is not available" (no order created).

## File Summary

- Modify: `packages/payments/src/config.ts` (`neopayAvailable`); confirm the barrel re-exports it.
- Modify: `apps/customer/app/checkout/page.tsx` (pass `neopayEnabled`), `apps/customer/app/checkout/CheckoutForm.tsx`
  (prop + conditional NeoPay entry + submit union), `apps/customer/app/actions/checkout.ts` (union + guard).
- Modify: `docs/deployment/payments.md` (NeoPay surfacing note).
- No schema change (the `NEOPAY` enum value already exists).
