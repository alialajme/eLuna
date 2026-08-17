# Surface NeoPay in Checkout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show NeoPay in the customer checkout picker and route it through the existing synchronous `placeOrder` path, gated by a single `neopayAvailable()` helper so production can never fake-capture when NeoPay is unconfigured.

**Architecture:** Export `neopayAvailable()` from `@e-luna/payments`; the checkout page passes `neopayEnabled` to `CheckoutForm` (conditional NeoPay entry); `placeOrder` widens its method union to include `NEOPAY` and rejects it server-side when `!neopayAvailable()`. No schema change (the `NEOPAY` enum value already exists).

**Tech Stack:** Turborepo + pnpm, Next.js 15 App Router, TypeScript. Verification = `tsc --noEmit` + `pnpm lint` + gitleaks (no test suite).

**Conventions:** the server guard is authoritative (never trust the client picker). Commit trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: `neopayAvailable()` helper + barrel export

**Files:** Modify `packages/payments/src/config.ts`, `packages/payments/src/index.ts`

- [ ] **Step 1: Add the helper.** In `packages/payments/src/config.ts`, after `hasNeopay`, add:
```ts
export const neopayAvailable = () => hasNeopay() || process.env.NODE_ENV !== "production";
```

- [ ] **Step 2: Re-export from the barrel.** In `packages/payments/src/index.ts`, the config re-export line is:
```ts
export { hasStripe, hasTap, hasNoqodi, hasNeopay, stripeConfig } from "./config";
```
Change it to add `neopayAvailable`:
```ts
export { hasStripe, hasTap, hasNoqodi, hasNeopay, neopayAvailable, stripeConfig } from "./config";
```

- [ ] **Step 3: Type-check the customer app** (which consumes `@e-luna/payments`)
```bash
pnpm --filter @e-luna/customer exec tsc --noEmit
```
Expected: exit 0 (no consumer yet — just confirms the export compiles). The `@e-luna/payments` package has no standalone tsc script; the workspace typecheck in Task 4 covers it.

- [ ] **Step 4: Commit**
```bash
git add packages/payments/src/config.ts packages/payments/src/index.ts
git commit -m "feat(payments): neopayAvailable() (configured or non-prod)"
```

---

### Task 2: `placeOrder` — accept NEOPAY + server-side guard

**Files:** Modify `apps/customer/app/actions/checkout.ts`

- [ ] **Step 1: Import the helper.** The file imports `import { getGateway } from "@e-luna/payments";`. Change it to:
```ts
import { getGateway, neopayAvailable } from "@e-luna/payments";
```

- [ ] **Step 2: Widen the input union.** The `PlaceOrderInput.paymentMethod` field is currently:
```ts
  paymentMethod: "LUNA_WALLET" | "TABBY" | "TAMARA" | "CASH_ON_DELIVERY";
```
Change it to:
```ts
  paymentMethod: "LUNA_WALLET" | "TABBY" | "TAMARA" | "CASH_ON_DELIVERY" | "NEOPAY";
```

- [ ] **Step 3: Add the guard.** In `placeOrder`, immediately after the existing CARD-rejection block (the `if ((input.paymentMethod as string) === "CARD") { ... }`), add:
```ts
    if (input.paymentMethod === "NEOPAY" && !neopayAvailable()) {
      return { success: false, error: "NeoPay is not available" };
    }
```
(Everything downstream is unchanged: `getGateway("NEOPAY").createPayment(...)` returns `captured` via the Simulated fallback in dev, or `failed` from `NeopayGateway` in prod-with-keys, and the existing `paymentResult.status === "failed"` handling surfaces the error.)

- [ ] **Step 4: Type-check**
```bash
pnpm --filter @e-luna/customer exec tsc --noEmit
```
Expected: exit 0.

- [ ] **Step 5: Commit**
```bash
git add apps/customer/app/actions/checkout.ts
git commit -m "feat(checkout): placeOrder accepts NEOPAY, guarded by neopayAvailable()"
```

---

### Task 3: Checkout page + `CheckoutForm` — surface NeoPay

**Files:** Modify `apps/customer/app/checkout/page.tsx`, `apps/customer/app/checkout/CheckoutForm.tsx`

- [ ] **Step 1: Page passes `neopayEnabled`.** In `apps/customer/app/checkout/page.tsx`:
  - Add to the imports (the page already imports from `@e-luna/db`, `@e-luna/ui`; add the payments import):
```ts
import { neopayAvailable } from "@e-luna/payments";
```
  - In the `<CheckoutForm … />` invocation, add the prop:
```tsx
      <CheckoutForm
        addresses={addresses}
        cartSubtotal={subtotal}
        shippingFee={shippingFee}
        cartTotal={total}
        itemCount={itemCount}
        neopayEnabled={neopayAvailable()}
      />
```

- [ ] **Step 2: `CheckoutForm` prop + NeoPay entry.** In `apps/customer/app/checkout/CheckoutForm.tsx`:
  - Add to the `Props` type:
```ts
  neopayEnabled: boolean;
```
  - Update the signature:
```tsx
export function CheckoutForm({ addresses, cartTotal, cartSubtotal, shippingFee, itemCount, neopayEnabled }: Props) {
```
  - Add a NeoPay entry to `PAYMENT_METHODS` (after the Tamara line, before Luna Wallet):
```ts
  { value: "TAMARA", label: "Tamara", icon: "🟣", desc: "Split in 3 instalments" },
  { value: "NEOPAY", label: "NeoPay", icon: "🇦🇪", desc: "UAE bank cards & wallets" },
  { value: "LUNA_WALLET", label: "Luna Wallet", icon: "🌙", desc: "Use your Luna balance" },
```

- [ ] **Step 3: Filter NeoPay by availability in the render.** The picker renders `PAYMENT_METHODS.map((method) => ( … ))`. Change that `.map` to filter out NeoPay when disabled:
```tsx
            {PAYMENT_METHODS.filter((method) => method.value !== "NEOPAY" || neopayEnabled).map((method) => (
```
(Leave the rest of the `<label>…</label>` body unchanged.)

- [ ] **Step 4: Widen the submit cast.** In the submit handler's non-CARD branch, the `placeOrder` call casts:
```tsx
        paymentMethod: paymentMethod as "LUNA_WALLET" | "TABBY" | "TAMARA" | "CASH_ON_DELIVERY",
```
Change it to include NEOPAY:
```tsx
        paymentMethod: paymentMethod as "LUNA_WALLET" | "TABBY" | "TAMARA" | "CASH_ON_DELIVERY" | "NEOPAY",
```

- [ ] **Step 5: Type-check + lint**
```bash
pnpm --filter @e-luna/customer exec tsc --noEmit && pnpm --filter @e-luna/customer lint
```
Expected: clean (only the pre-existing `<img>` warnings in `cart/CartReview.tsx` + `checkout/confirm/page.tsx`).

- [ ] **Step 6: Commit**
```bash
git add apps/customer/app/checkout/page.tsx apps/customer/app/checkout/CheckoutForm.tsx
git commit -m "feat(checkout): surface NeoPay in the payment picker (availability-gated)"
```

---

### Task 4: Docs + full verification

**Files:** Modify `docs/deployment/payments.md`

- [ ] **Step 1: Document NeoPay surfacing.** Append to `docs/deployment/payments.md`:
```markdown

## NeoPay in checkout

NeoPay is surfaced in the customer checkout picker, gated by `neopayAvailable()` (`@e-luna/payments`) =
`hasNeopay() || NODE_ENV !== "production"`:

- **Dev, no keys:** NeoPay is shown and completes via the Simulated gateway (`captured`), like Tabby/Tamara/Wallet.
- **Prod, no keys:** NeoPay is hidden in the UI **and** `placeOrder` rejects a `NEOPAY` request — no order, no fake capture.
- **Prod, with keys:** routes to the real `NeopayGateway`, which returns "not configured" until an operator
  implements NeoPay's hosted-redirect + webhook flow in `packages/payments/src/neopay.ts`.

**To enable NeoPay in production:** implement `NeopayGateway.createPayment` (hosted-redirect / `requires_action`)
and the callback/webhook, THEN set `NEOPAY_API_KEY` / `NEOPAY_MERCHANT_ID`. Do not set the keys before the
gateway is implemented, or customers selecting NeoPay will get a "not configured" failure.
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

- [ ] **Step 4: Commit**
```bash
git add docs/deployment/payments.md
git commit -m "docs: NeoPay checkout surfacing + operator enablement note"
```

---

## Notes for the implementer

- **No schema change** — the `NEOPAY` `PaymentMethod` enum value already exists.
- **The server guard is the real gate.** The UI filter is UX; `placeOrder`'s `neopayAvailable()` check is what
  actually prevents a prod fake-capture (a crafted request bypasses the picker).
- **Honesty boundary:** dev Simulated-captures NeoPay (convenience, matches the other non-card methods); prod
  needs a real, implemented NeoPay gateway before keys are set. Only NeoPay is surfaced — Tap/Noqodi stay hidden.
