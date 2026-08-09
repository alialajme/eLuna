# Payments Gateway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the simulated checkout charge with a real, Stripe-first payment integration (Card/Apple Pay/Google Pay) behind a unified `PaymentGateway` interface, plus config-gated Tap/Noqodi/NeoPay adapter scaffolds — keeping dev working with zero credentials.

**Architecture:** Evolve the gateway interface from synchronous `charge()` to a `createPayment()` discriminated union (`captured | requires_action | failed`). The card path creates a `PENDING` order, collects payment via the Stripe Payment Element, and settles via a webhook (production) plus a `syncOrderPayment` server-action reconciler (dev/preview). An env-aware factory falls back to the existing `SimulatedGateway` when keys are absent.

**Tech Stack:** Next.js 15 (App Router; async searchParams), `stripe` (server SDK), `@stripe/stripe-js` + `@stripe/react-stripe-js` (Payment Element), Prisma + PostgreSQL (`prisma db push`), TypeScript (`noUncheckedIndexedAccess` on), Clerk.

---

## Context for the implementer (read once)

- **No automated test suite exists.** "Tests" = `npx tsc --noEmit` and `npx next lint`. Do NOT add a test runner.
- **`noUncheckedIndexedAccess` is ON.** Array index reads are `T | undefined` → use `?? fallback` or `arr[i]?.x`.
- **Prisma `Decimal`** → `Number(...)` before arithmetic/JSON. `Math.round(amount * 100)` converts AED → fils for Stripe.
- **Repo uses `prisma db push`** (no migration files). Schema change = edit `schema.prisma` + `pnpm --filter @e-luna/db db:generate` (regenerates client types offline, no DB needed). Applying to a live DB (`db push`) is an operator step.
- **Cookie mutation** (`cookies().delete/set`) is only allowed inside a Server Action or Route Handler — never during a Server Component render. That is why cart-clearing happens inside `placeOrder` / `initiateCardPayment` / `syncOrderPayment` (all invoked from client or as actions), and why the confirm page triggers the sync via a small client component.
- **Verified current state:**
  - `apps/customer/app/lib/payment/gateway.ts` exports `ChargeParams/ChargeResult/RefundParams/RefundResult` + `interface PaymentGateway { charge, refund }`.
  - `factory.ts` `getGateway(method)` switch; `simulated.ts`, `tabby.ts`, `tamara.ts` implement `charge`.
  - `actions/checkout.ts` `placeOrder()` calls `getGateway(method).charge(...)` at line 74-75, creates a `CONFIRMED` order + `CAPTURED` tx, `jar.delete("luna_cart")`.
  - `checkout/CheckoutForm.tsx` client form: `PAYMENT_METHODS` list, `paymentMethod` state, `handlePlaceOrder` calls `placeOrder`, pushes `/checkout/confirm?orderId=...`.
  - `checkout/confirm/page.tsx` server component: `searchParams: Promise<{ orderId?: string }>`, fetches order, ownership-checked, renders success UI unconditionally.
  - Schema: `PaymentMethod = CARD|LUNA_WALLET|TABBY|TAMARA|CASH_ON_DELIVERY` (lines 68-74). `PaymentTransaction { status PaymentStatus, externalRef?, metadata Json }`. `OrderStatus` has `PENDING|CONFIRMED|CANCELLED`. `PaymentStatus` has `PENDING|CAPTURED|FAILED`.
  - `apps/customer/app/lib/auth.ts` exports `safeCurrentUser()`.

---

## File Structure

```
apps/customer/app/lib/payment/gateway.ts          — evolve interface (createPayment + WebhookResult + handleWebhook?)
apps/customer/app/lib/payment/config.ts           — CREATE: hasStripe/hasTap/hasNoqodi/hasNeopay + stripeConfig()
apps/customer/app/lib/payment/reconcile.ts        — CREATE: applyPaymentResult() idempotent state flip (shared by webhook + sync)
apps/customer/app/lib/payment/stripe.ts           — CREATE: StripeGateway (intent + webhook + retrieve + refund)
apps/customer/app/lib/payment/tap.ts              — CREATE: TapGateway scaffold
apps/customer/app/lib/payment/noqodi.ts           — CREATE: NoqodiGateway scaffold
apps/customer/app/lib/payment/neopay.ts           — CREATE: NeopayGateway scaffold
apps/customer/app/lib/payment/simulated.ts        — MODIFY: new interface (captured)
apps/customer/app/lib/payment/tabby.ts            — MODIFY: new interface (stub captured)
apps/customer/app/lib/payment/tamara.ts           — MODIFY: new interface (stub captured)
apps/customer/app/lib/payment/factory.ts          — MODIFY: env-aware getGateway
apps/customer/app/actions/checkout.ts             — MODIFY: placeOrder→createPayment; add initiateCardPayment + syncOrderPayment
apps/customer/app/checkout/StripePaymentForm.tsx  — CREATE: <Elements> + <PaymentElement> + confirmPayment
apps/customer/app/checkout/CheckoutForm.tsx       — MODIFY: CARD branch → initiateCardPayment → StripePaymentForm
apps/customer/app/checkout/ConfirmPaymentSync.tsx — CREATE: client; triggers syncOrderPayment when PENDING
apps/customer/app/checkout/confirm/page.tsx       — MODIFY: status-aware UI + mount ConfirmPaymentSync
apps/customer/app/api/webhooks/stripe/route.ts    — CREATE: verify signature, applyPaymentResult
packages/db/prisma/schema.prisma                  — MODIFY: PaymentMethod += TAP, NOQODI, NEOPAY
apps/customer/package.json                          — MODIFY: add stripe deps
.env.example                                        — CREATE/MODIFY: payment env vars
docs/deployment/payments.md                         — CREATE: operator activation guide
```

---

## Task 1: Dependencies + enum + client regen

**Files:** Modify `apps/customer/package.json`; Modify `packages/db/prisma/schema.prisma:68-74`.

- [ ] **Step 1: Add Stripe dependencies to the customer app**

Run:
```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/customer && pnpm add stripe @stripe/stripe-js @stripe/react-stripe-js
```
Expected: three packages added to `apps/customer/package.json` dependencies and the root `pnpm-lock.yaml` updated.
If the sandbox blocks network install, STOP and report — installing deps is then an operator step (do not hand-fake the lockfile).

- [ ] **Step 2: Add the three enum values**

In `packages/db/prisma/schema.prisma`, change the `PaymentMethod` enum (lines 68-74) from:
```prisma
enum PaymentMethod {
  CARD
  LUNA_WALLET
  TABBY
  TAMARA
  CASH_ON_DELIVERY
}
```
to:
```prisma
enum PaymentMethod {
  CARD
  LUNA_WALLET
  TABBY
  TAMARA
  CASH_ON_DELIVERY
  TAP
  NOQODI
  NEOPAY
}
```

- [ ] **Step 3: Regenerate the Prisma client (offline — no DB needed)**

Run: `cd /Users/alialajme/Projects/Luna/e-luna && pnpm --filter @e-luna/db db:generate`
Expected: "Generated Prisma Client" success. This makes `"TAP" | "NOQODI" | "NEOPAY"` valid `PaymentMethod` values at the type level.

- [ ] **Step 4: Type-check (nothing consumes the new values yet)**

Run: `cd /Users/alialajme/Projects/Luna/e-luna/apps/customer && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts"`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna
git add apps/customer/package.json pnpm-lock.yaml packages/db/prisma/schema.prisma
git commit -m "chore(payments): add stripe deps + TAP/NOQODI/NEOPAY enum values

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Evolve the gateway interface, config, reconciler, and non-card checkout

**Files:** Modify `gateway.ts`; Create `config.ts`, `reconcile.ts`; Modify `simulated.ts`, `tabby.ts`, `tamara.ts`; Modify `actions/checkout.ts` (placeOrder). (`factory.ts` stays as-is this task — its `CARD` default still returns `SimulatedGateway`, which now implements the new interface.)

- [ ] **Step 1: Replace `apps/customer/app/lib/payment/gateway.ts` entirely**

```ts
export type CreatePaymentParams = {
  amount: number;
  currency: string;
  orderId: string;
  customerEmail: string;
  description: string;
  metadata?: Record<string, string>;
};

export type CreatePaymentResult =
  | { status: "captured"; externalRef: string }
  | { status: "requires_action"; externalRef: string; clientSecret: string }
  | { status: "failed"; error: string };

export type RefundParams = {
  externalRef: string;
  amount: number;
  reason?: string;
};

export type RefundResult = {
  success: boolean;
  error?: string;
};

export type WebhookResult =
  | { kind: "payment_succeeded"; orderId: string; externalRef: string; walletType?: string }
  | { kind: "payment_failed"; orderId: string; externalRef: string }
  | { kind: "ignored" };

export interface PaymentGateway {
  createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult>;
  refund(params: RefundParams): Promise<RefundResult>;
  handleWebhook?(rawBody: string, signature: string): Promise<WebhookResult>;
}
```

- [ ] **Step 2: Create `apps/customer/app/lib/payment/config.ts`**

```ts
export const hasStripe = () => !!process.env.STRIPE_SECRET_KEY;
export const hasTap = () => !!process.env.TAP_SECRET_KEY;
export const hasNoqodi = () => !!process.env.NOQODI_API_KEY;
export const hasNeopay = () => !!process.env.NEOPAY_API_KEY;

export function stripeConfig() {
  const secret = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_SECRET_KEY is not set");
  return { secret, webhookSecret };
}
```

- [ ] **Step 3: Create `apps/customer/app/lib/payment/reconcile.ts`**

```ts
import { prisma } from "@e-luna/db";
import type { WebhookResult } from "./gateway";

/**
 * Idempotently apply a payment outcome to an order. Only orders currently in
 * PENDING are transitioned, so webhook re-delivery and the sync reconciler are
 * both safe to call repeatedly.
 */
export async function applyPaymentResult(result: WebhookResult): Promise<void> {
  if (result.kind === "ignored" || !result.orderId) return;

  const order = await prisma.order
    .findUnique({ where: { id: result.orderId }, select: { id: true, status: true } })
    .catch(() => null);
  if (!order || order.status !== "PENDING") return;

  if (result.kind === "payment_succeeded") {
    await prisma.$transaction([
      prisma.order.update({ where: { id: order.id }, data: { status: "CONFIRMED" } }),
      prisma.paymentTransaction.updateMany({
        where: { orderId: order.id, status: "PENDING" },
        data: {
          status: "CAPTURED",
          ...(result.walletType ? { metadata: { walletType: result.walletType } } : {}),
        },
      }),
    ]);
  } else if (result.kind === "payment_failed") {
    await prisma.$transaction([
      prisma.order.update({ where: { id: order.id }, data: { status: "CANCELLED" } }),
      prisma.paymentTransaction.updateMany({
        where: { orderId: order.id, status: "PENDING" },
        data: { status: "FAILED" },
      }),
    ]);
  }
}
```

- [ ] **Step 4: Replace `apps/customer/app/lib/payment/simulated.ts`**

```ts
import type {
  PaymentGateway,
  CreatePaymentParams,
  CreatePaymentResult,
  RefundParams,
  RefundResult,
} from "./gateway";

export class SimulatedGateway implements PaymentGateway {
  async createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult> {
    await new Promise((r) => setTimeout(r, 200));
    return { status: "captured", externalRef: `sim_${params.orderId}_${Date.now()}` };
  }

  async refund(_params: RefundParams): Promise<RefundResult> {
    return { success: true };
  }
}
```

- [ ] **Step 5: Replace `apps/customer/app/lib/payment/tabby.ts`**

```ts
import type {
  PaymentGateway,
  CreatePaymentParams,
  CreatePaymentResult,
  RefundParams,
  RefundResult,
} from "./gateway";

// Integration point: replace this stub with the real Tabby SDK.
// Docs: https://docs.tabby.ai/  — Required env: TABBY_API_KEY, TABBY_MERCHANT_CODE
export class TabbyGateway implements PaymentGateway {
  async createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult> {
    console.warn("[TabbyGateway] Stub — simulated capture. Wire real SDK to go live.");
    return { status: "captured", externalRef: `tabby_stub_${params.orderId}_${Date.now()}` };
  }

  async refund(_params: RefundParams): Promise<RefundResult> {
    console.warn("[TabbyGateway] Stub refund — wire real SDK to go live.");
    return { success: true };
  }
}
```

- [ ] **Step 6: Replace `apps/customer/app/lib/payment/tamara.ts`**

```ts
import type {
  PaymentGateway,
  CreatePaymentParams,
  CreatePaymentResult,
  RefundParams,
  RefundResult,
} from "./gateway";

// Integration point: replace this stub with the real Tamara SDK.
// Docs: https://docs.tamara.co/  — Required env: TAMARA_API_TOKEN, TAMARA_NOTIFICATION_TOKEN
export class TamaraGateway implements PaymentGateway {
  async createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult> {
    console.warn("[TamaraGateway] Stub — simulated capture. Wire real SDK to go live.");
    return { status: "captured", externalRef: `tamara_stub_${params.orderId}_${Date.now()}` };
  }

  async refund(_params: RefundParams): Promise<RefundResult> {
    console.warn("[TamaraGateway] Stub refund — wire real SDK to go live.");
    return { success: true };
  }
}
```

- [ ] **Step 7: Refactor `placeOrder` in `apps/customer/app/actions/checkout.ts`**

Replace the charge block (currently lines 74-85):
```ts
    const gateway = getGateway(input.paymentMethod);
    const chargeResult = await gateway.charge({
      amount: total,
      currency: "AED",
      orderId: tempOrderId,
      customerEmail: user.emailAddresses[0]?.emailAddress ?? "",
      description: `Luna order — ${lineItems.length} item(s)`,
    });

    if (!chargeResult.success) {
      return { success: false, error: chargeResult.error ?? "Payment failed" };
    }
```
with:
```ts
    const gateway = getGateway(input.paymentMethod);
    const paymentResult = await gateway.createPayment({
      amount: total,
      currency: "AED",
      orderId: tempOrderId,
      customerEmail: user.emailAddresses[0]?.emailAddress ?? "",
      description: `Luna order — ${lineItems.length} item(s)`,
    });

    if (paymentResult.status !== "captured") {
      return {
        success: false,
        error:
          paymentResult.status === "failed"
            ? paymentResult.error
            : "This payment method must be completed through the card checkout flow.",
      };
    }
```
Then in the `paymentTransactions.create` block, change `externalRef: chargeResult.externalRef` to `externalRef: paymentResult.externalRef`.

- [ ] **Step 8: Type-check**

Run: `cd /Users/alialajme/Projects/Luna/e-luna/apps/customer && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts"`
Expected: clean. (`factory.ts` still compiles: its `CARD` default returns `SimulatedGateway`, which now returns `captured`, so card checkout keeps working synchronously with no keys.)

- [ ] **Step 9: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna
git add apps/customer/app/lib/payment/gateway.ts apps/customer/app/lib/payment/config.ts apps/customer/app/lib/payment/reconcile.ts apps/customer/app/lib/payment/simulated.ts apps/customer/app/lib/payment/tabby.ts apps/customer/app/lib/payment/tamara.ts apps/customer/app/actions/checkout.ts
git commit -m "refactor(payments): createPayment() interface + config + reconciler

Evolve PaymentGateway to a createPayment() discriminated union, add
env-presence config + idempotent applyPaymentResult reconciler, migrate
simulated/tabby/tamara stubs, and route placeOrder through createPayment
(expects 'captured' for synchronous methods).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Stripe adapter + regional scaffolds + env-aware factory

**Files:** Create `stripe.ts`, `tap.ts`, `noqodi.ts`, `neopay.ts`; Modify `factory.ts`.

- [ ] **Step 1: Create `apps/customer/app/lib/payment/stripe.ts`**

```ts
import Stripe from "stripe";
import { stripeConfig } from "./config";
import type {
  PaymentGateway,
  CreatePaymentParams,
  CreatePaymentResult,
  RefundParams,
  RefundResult,
  WebhookResult,
} from "./gateway";

export class StripeGateway implements PaymentGateway {
  private client = new Stripe(stripeConfig().secret);

  async createPayment(p: CreatePaymentParams): Promise<CreatePaymentResult> {
    try {
      const intent = await this.client.paymentIntents.create({
        amount: Math.round(p.amount * 100), // AED → fils
        currency: p.currency.toLowerCase(),
        automatic_payment_methods: { enabled: true }, // surfaces Apple/Google Pay + cards
        description: p.description,
        receipt_email: p.customerEmail || undefined,
        metadata: { orderId: p.orderId, ...(p.metadata ?? {}) },
      });
      if (!intent.client_secret) return { status: "failed", error: "No client secret returned" };
      return { status: "requires_action", externalRef: intent.id, clientSecret: intent.client_secret };
    } catch (e) {
      return { status: "failed", error: e instanceof Error ? e.message : "Stripe error" };
    }
  }

  async refund(p: RefundParams): Promise<RefundResult> {
    try {
      await this.client.refunds.create({
        payment_intent: p.externalRef,
        amount: Math.round(p.amount * 100),
        reason: "requested_by_customer",
      });
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Refund failed" };
    }
  }

  async handleWebhook(rawBody: string, signature: string): Promise<WebhookResult> {
    const { webhookSecret } = stripeConfig();
    if (!webhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");
    const event = this.client.webhooks.constructEvent(rawBody, signature, webhookSecret); // throws on bad sig
    if (event.type === "payment_intent.succeeded") {
      const pi = event.data.object as Stripe.PaymentIntent;
      return { kind: "payment_succeeded", orderId: pi.metadata.orderId ?? "", externalRef: pi.id };
    }
    if (event.type === "payment_intent.payment_failed") {
      const pi = event.data.object as Stripe.PaymentIntent;
      return { kind: "payment_failed", orderId: pi.metadata.orderId ?? "", externalRef: pi.id };
    }
    return { kind: "ignored" };
  }

  /** Server-side reconciliation used by syncOrderPayment (dev/preview path). */
  async retrievePayment(externalRef: string): Promise<WebhookResult> {
    try {
      const pi = await this.client.paymentIntents.retrieve(externalRef, { expand: ["payment_method"] });
      if (pi.status === "succeeded") {
        const pm = pi.payment_method as Stripe.PaymentMethod | null;
        const walletType = pm?.card?.wallet?.type ?? undefined;
        return { kind: "payment_succeeded", orderId: pi.metadata.orderId ?? "", externalRef: pi.id, walletType };
      }
      if (pi.status === "canceled" || pi.last_payment_error) {
        return { kind: "payment_failed", orderId: pi.metadata.orderId ?? "", externalRef: pi.id };
      }
      return { kind: "ignored" };
    } catch {
      return { kind: "ignored" };
    }
  }
}
```
Note: if `new Stripe(secret)` raises a TS error demanding `apiVersion`, add `{ apiVersion: "2025-08-27.basil" }` (or whatever version the installed `stripe` types pin) as the second arg. This is the only expected type friction.

- [ ] **Step 2: Create `apps/customer/app/lib/payment/tap.ts`**

```ts
import type {
  PaymentGateway,
  CreatePaymentParams,
  CreatePaymentResult,
  RefundParams,
  RefundResult,
} from "./gateway";

// Integration point: Tap Payments (tap.company) — https://developers.tap.company/
// Required env: TAP_SECRET_KEY, TAP_MERCHANT_ID. Hosted-redirect charges + webhook callbacks.
// Only instantiated by the factory when hasTap() is true.
export class TapGateway implements PaymentGateway {
  async createPayment(_p: CreatePaymentParams): Promise<CreatePaymentResult> {
    return { status: "failed", error: "Tap gateway is not yet configured" };
  }

  async refund(_p: RefundParams): Promise<RefundResult> {
    return { success: false, error: "Tap gateway is not yet configured" };
  }
}
```

- [ ] **Step 3: Create `apps/customer/app/lib/payment/noqodi.ts`**

```ts
import type {
  PaymentGateway,
  CreatePaymentParams,
  CreatePaymentResult,
  RefundParams,
  RefundResult,
} from "./gateway";

// Integration point: Noqodi (noqodi.com) — UAE digital wallet / payment gateway.
// Required env: NOQODI_API_KEY, NOQODI_MERCHANT_ID. Hosted-redirect + webhook callbacks.
// Only instantiated by the factory when hasNoqodi() is true.
export class NoqodiGateway implements PaymentGateway {
  async createPayment(_p: CreatePaymentParams): Promise<CreatePaymentResult> {
    return { status: "failed", error: "Noqodi gateway is not yet configured" };
  }

  async refund(_p: RefundParams): Promise<RefundResult> {
    return { success: false, error: "Noqodi gateway is not yet configured" };
  }
}
```

- [ ] **Step 4: Create `apps/customer/app/lib/payment/neopay.ts`**

```ts
import type {
  PaymentGateway,
  CreatePaymentParams,
  CreatePaymentResult,
  RefundParams,
  RefundResult,
} from "./gateway";

// Integration point: NeoPay by Mashreq (neopay.ae) — UAE payment gateway.
// Required env: NEOPAY_API_KEY, NEOPAY_MERCHANT_ID. Hosted-redirect + webhook callbacks.
// Only instantiated by the factory when hasNeopay() is true.
export class NeopayGateway implements PaymentGateway {
  async createPayment(_p: CreatePaymentParams): Promise<CreatePaymentResult> {
    return { status: "failed", error: "NeoPay gateway is not yet configured" };
  }

  async refund(_p: RefundParams): Promise<RefundResult> {
    return { success: false, error: "NeoPay gateway is not yet configured" };
  }
}
```

- [ ] **Step 5: Replace `apps/customer/app/lib/payment/factory.ts`**

```ts
import { SimulatedGateway } from "./simulated";
import { TabbyGateway } from "./tabby";
import { TamaraGateway } from "./tamara";
import { StripeGateway } from "./stripe";
import { TapGateway } from "./tap";
import { NoqodiGateway } from "./noqodi";
import { NeopayGateway } from "./neopay";
import { hasStripe, hasTap, hasNoqodi, hasNeopay } from "./config";
import type { PaymentGateway } from "./gateway";

export function getGateway(method: string): PaymentGateway {
  switch (method) {
    case "CARD":
      return hasStripe() ? new StripeGateway() : new SimulatedGateway();
    case "TABBY":
      return new TabbyGateway();
    case "TAMARA":
      return new TamaraGateway();
    case "TAP":
      return hasTap() ? new TapGateway() : new SimulatedGateway();
    case "NOQODI":
      return hasNoqodi() ? new NoqodiGateway() : new SimulatedGateway();
    case "NEOPAY":
      return hasNeopay() ? new NeopayGateway() : new SimulatedGateway();
    case "LUNA_WALLET":
    case "CASH_ON_DELIVERY":
    default:
      return new SimulatedGateway();
  }
}
```

- [ ] **Step 6: Type-check**

Run: `cd /Users/alialajme/Projects/Luna/e-luna/apps/customer && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts"`
Expected: clean. If Stripe complains about `apiVersion`, apply the note in Step 1.

- [ ] **Step 7: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna
git add apps/customer/app/lib/payment/stripe.ts apps/customer/app/lib/payment/tap.ts apps/customer/app/lib/payment/noqodi.ts apps/customer/app/lib/payment/neopay.ts apps/customer/app/lib/payment/factory.ts
git commit -m "feat(payments): Stripe adapter + Tap/Noqodi/NeoPay scaffolds + env-aware factory

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Card server actions (initiate + sync)

**Files:** Modify `apps/customer/app/actions/checkout.ts` (add two exports; add imports).

- [ ] **Step 1: Add imports at the top of `actions/checkout.ts`**

After the existing imports (the file already imports `cookies`, `revalidatePath`, `prisma`, `safeCurrentUser`, `getGateway`, `parseCart`), add:
```ts
import { hasStripe } from "../lib/payment/config";
import { StripeGateway } from "../lib/payment/stripe";
import { applyPaymentResult } from "../lib/payment/reconcile";
```

- [ ] **Step 2: Add the `initiateCardPayment` action (append to the file, after `placeOrder`)**

```ts
export type InitiateCardResult =
  | { success: true; orderId: string; clientSecret?: string; captured?: boolean }
  | { success: false; error: string };

export async function initiateCardPayment(input: {
  addressId: string;
  notes?: string;
}): Promise<InitiateCardResult> {
  try {
    const user = await safeCurrentUser();
    if (!user) return { success: false, error: "Please sign in to place an order" };

    const jar = await cookies();
    const cartItems = parseCart(jar.get("luna_cart")?.value);
    if (cartItems.length === 0) return { success: false, error: "Your bag is empty" };

    const variantIds = cartItems.map((i) => i.variantId);
    const variants = await prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      include: { product: { select: { price: true, vendorId: true } } },
    });
    if (variants.length !== variantIds.length) {
      return { success: false, error: "Some items are no longer available" };
    }

    let customerProfile = await prisma.customerProfile.findUnique({ where: { userId: user.id } });
    if (!customerProfile) {
      customerProfile = await prisma.customerProfile.create({ data: { userId: user.id } });
    }

    const address = await prisma.address.findFirst({
      where: { id: input.addressId, userId: user.id },
    });
    if (!address) return { success: false, error: "Invalid delivery address" };

    const lineItems = cartItems.map((cartItem) => {
      const variant = variants.find((v) => v.id === cartItem.variantId)!;
      const unitPrice = Number(variant.price ?? variant.product.price);
      return {
        variantId: cartItem.variantId,
        vendorId: variant.product.vendorId,
        quantity: cartItem.qty,
        unitPrice,
      };
    });
    const subtotal = lineItems.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
    const shippingFee = subtotal >= SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
    const total = subtotal + shippingFee;

    // 1) Create the PENDING order + PENDING transaction up front (audit anchor).
    const order = await prisma.order.create({
      data: {
        customerId: customerProfile.id,
        addressId: input.addressId,
        status: "PENDING",
        subtotal,
        shippingFee,
        total,
        discount: 0,
        paymentMethod: "CARD",
        notes: input.notes ?? null,
        items: {
          create: lineItems.map((l) => ({
            variantId: l.variantId,
            vendorId: l.vendorId,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
          })),
        },
        paymentTransactions: {
          create: { method: "CARD", status: "PENDING", amount: total, currency: "AED" },
        },
      },
      include: { paymentTransactions: { select: { id: true }, take: 1 } },
    });

    // 2) Create the gateway payment.
    const gateway = getGateway("CARD");
    const result = await gateway.createPayment({
      amount: total,
      currency: "AED",
      orderId: order.id,
      customerEmail: user.emailAddresses[0]?.emailAddress ?? "",
      description: `Luna order — ${lineItems.length} item(s)`,
      metadata: { orderId: order.id },
    });

    if (result.status === "failed") {
      await prisma.order.update({ where: { id: order.id }, data: { status: "CANCELLED" } });
      await prisma.paymentTransaction.updateMany({
        where: { orderId: order.id, status: "PENDING" },
        data: { status: "FAILED" },
      });
      return { success: false, error: result.error };
    }

    // Persist externalRef on the pending transaction.
    const txId = order.paymentTransactions[0]?.id;
    if (txId) {
      await prisma.paymentTransaction.update({
        where: { id: txId },
        data: { externalRef: result.externalRef },
      });
    }

    // Simulated fallback (no Stripe keys): capture immediately, confirm, clear cart.
    if (result.status === "captured") {
      await applyPaymentResult({
        kind: "payment_succeeded",
        orderId: order.id,
        externalRef: result.externalRef,
      });
      jar.delete("luna_cart");
      revalidatePath("/cart");
      revalidatePath("/orders");
      return { success: true, orderId: order.id, captured: true };
    }

    // Live Stripe: hand the client secret back for the Payment Element.
    return { success: true, orderId: order.id, clientSecret: result.clientSecret };
  } catch (err) {
    console.error("[initiateCardPayment]", err);
    return { success: false, error: "Something went wrong. Please try again." };
  }
}
```

- [ ] **Step 3: Add the `syncOrderPayment` action (append after `initiateCardPayment`)**

```ts
export async function syncOrderPayment(orderId: string): Promise<{ status: string }> {
  try {
    const user = await safeCurrentUser();
    if (!user) return { status: "UNAUTHORIZED" };

    const profile = await prisma.customerProfile.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!profile) return { status: "FORBIDDEN" };

    const order = await prisma.order.findFirst({
      where: { id: orderId, customerId: profile.id },
      select: { id: true, status: true, paymentTransactions: { select: { externalRef: true }, take: 1 } },
    });
    if (!order) return { status: "NOT_FOUND" };
    if (order.status !== "PENDING") return { status: order.status };
    if (!hasStripe()) return { status: order.status };

    const ref = order.paymentTransactions[0]?.externalRef;
    if (!ref) return { status: order.status };

    const result = await new StripeGateway().retrievePayment(ref);
    await applyPaymentResult(result);

    const updated = await prisma.order.findUnique({ where: { id: orderId }, select: { status: true } });
    if (updated?.status === "CONFIRMED") {
      const jar = await cookies();
      jar.delete("luna_cart");
      revalidatePath("/cart");
      revalidatePath("/orders");
    }
    return { status: updated?.status ?? order.status };
  } catch (err) {
    console.error("[syncOrderPayment]", err);
    return { status: "ERROR" };
  }
}
```

- [ ] **Step 4: Type-check**

Run: `cd /Users/alialajme/Projects/Luna/e-luna/apps/customer && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts"`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna
git add apps/customer/app/actions/checkout.ts
git commit -m "feat(payments): initiateCardPayment + syncOrderPayment server actions

Order-first card flow: create PENDING order, create Stripe intent, and
reconcile via retrieve (dev) — captured fallback confirms immediately when
Stripe keys are absent. Cart cleared only on confirmation.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Payment Element client + CheckoutForm branch

**Files:** Create `apps/customer/app/checkout/StripePaymentForm.tsx`; Modify `apps/customer/app/checkout/CheckoutForm.tsx`.

- [ ] **Step 1: Create `apps/customer/app/checkout/StripePaymentForm.tsx`**

```tsx
"use client";

import { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

function PayInner({ orderId }: { orderId: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);
    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/checkout/confirm?orderId=${orderId}`,
      },
    });
    // If we reach here, confirmation failed before redirect.
    if (confirmError) {
      setError(confirmError.message ?? "Payment could not be completed.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handlePay} className="space-y-4">
      <PaymentElement />
      {error && (
        <div className="rounded-xl bg-coral/10 border border-coral px-4 py-3 text-body-md text-coral">
          {error}
        </div>
      )}
      <button
        type="submit"
        disabled={!stripe || submitting}
        className="flex w-full items-center justify-center rounded-full bg-ink px-6 py-3 text-body-md font-medium text-ivory hover:bg-ink/90 transition-colors disabled:opacity-60"
      >
        {submitting ? "Processing…" : "Pay now"}
      </button>
    </form>
  );
}

export function StripePaymentForm({ clientSecret, orderId }: { clientSecret: string; orderId: string }) {
  if (!stripePromise) {
    return (
      <div className="rounded-xl bg-coral/10 border border-coral px-4 py-3 text-body-md text-coral">
        Card payments are not configured. Please choose another method.
      </div>
    );
  }
  return (
    <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: "flat" } }}>
      <PayInner orderId={orderId} />
    </Elements>
  );
}
```

- [ ] **Step 2: Wire the CARD branch in `apps/customer/app/checkout/CheckoutForm.tsx`**

Change the import on line 5 from:
```tsx
import { placeOrder } from "../actions/checkout";
```
to:
```tsx
import { placeOrder, initiateCardPayment } from "../actions/checkout";
import { StripePaymentForm } from "./StripePaymentForm";
```

Add state after line 45 (`const [paymentMethod, setPaymentMethod] = useState<string>("CARD");`):
```tsx
  const [stripeSession, setStripeSession] = useState<{ clientSecret: string; orderId: string } | null>(null);
```

Replace the `placeOrder` call block inside `handlePlaceOrder` (currently lines 76-86):
```tsx
      const result = await placeOrder({
        addressId,
        paymentMethod: paymentMethod as "CARD" | "LUNA_WALLET" | "TABBY" | "TAMARA" | "CASH_ON_DELIVERY",
      });

      if (!result.success) {
        setError(result.error);
        return;
      }

      router.push(`/checkout/confirm?orderId=${result.orderId}`);
```
with:
```tsx
      if (paymentMethod === "CARD") {
        const card = await initiateCardPayment({ addressId });
        if (!card.success) {
          setError(card.error);
          return;
        }
        if (card.captured) {
          router.push(`/checkout/confirm?orderId=${card.orderId}`);
          return;
        }
        if (card.clientSecret) {
          setStripeSession({ clientSecret: card.clientSecret, orderId: card.orderId });
          return;
        }
        setError("Could not start card payment. Please try again.");
        return;
      }

      const result = await placeOrder({
        addressId,
        paymentMethod: paymentMethod as "LUNA_WALLET" | "TABBY" | "TAMARA" | "CASH_ON_DELIVERY",
      });

      if (!result.success) {
        setError(result.error);
        return;
      }

      router.push(`/checkout/confirm?orderId=${result.orderId}`);
```

Render the Payment Element when a Stripe session is active. Replace the Payment Method `<section>` opening (currently line 186-187):
```tsx
        {/* Payment Method */}
        <section>
          <h2 className="font-display text-display-sm text-ink mb-4">Payment Method</h2>
```
with:
```tsx
        {/* Payment Method */}
        <section>
          <h2 className="font-display text-display-sm text-ink mb-4">Payment Method</h2>
          {stripeSession ? (
            <div className="rounded-xl border border-sand p-4">
              <StripePaymentForm clientSecret={stripeSession.clientSecret} orderId={stripeSession.orderId} />
            </div>
          ) : (
```
Then find the closing of the payment-methods list `<div>` and the `</section>` (currently lines 210-212):
```tsx
            ))}
          </div>
        </section>
```
and change it to close the conditional too:
```tsx
            ))}
          </div>
          )}
        </section>
```

- [ ] **Step 3: Type-check**

Run: `cd /Users/alialajme/Projects/Luna/e-luna/apps/customer && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts"`
Expected: clean.

- [ ] **Step 4: Lint**

Run: `cd /Users/alialajme/Projects/Luna/e-luna/apps/customer && npx next lint 2>&1 | tail -5`
Expected: no new errors from `StripePaymentForm.tsx` / `CheckoutForm.tsx`.

- [ ] **Step 5: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna
git add apps/customer/app/checkout/StripePaymentForm.tsx apps/customer/app/checkout/CheckoutForm.tsx
git commit -m "feat(checkout): Stripe Payment Element on the CARD path

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Confirm page status handling + sync trigger

**Files:** Create `apps/customer/app/checkout/ConfirmPaymentSync.tsx`; Modify `apps/customer/app/checkout/confirm/page.tsx`.

- [ ] **Step 1: Create `apps/customer/app/checkout/ConfirmPaymentSync.tsx`**

```tsx
"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { syncOrderPayment } from "../actions/checkout";

// Client-invoked so the server action may mutate cookies (clear the cart) legally.
export function ConfirmPaymentSync({ orderId }: { orderId: string }) {
  const router = useRouter();
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    syncOrderPayment(orderId).then((r) => {
      if (r.status !== "PENDING") router.refresh();
    });
  }, [orderId, router]);
  return null;
}
```

- [ ] **Step 2: Make the confirm page status-aware — `apps/customer/app/checkout/confirm/page.tsx`**

Add an import after line 5 (`import { safeCurrentUser } from "../../lib/auth";`):
```tsx
import { ConfirmPaymentSync } from "../ConfirmPaymentSync";
```

After the ownership check (currently line 55, `if (!profile || order.customerId !== profile.id) notFound();`), insert branch handling for non-confirmed orders, before `const paymentTx = order.paymentTransactions[0];`:
```tsx
  if (order.status === "PENDING") {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <ConfirmPaymentSync orderId={order.id} />
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gold/20 text-3xl">
          ⏳
        </div>
        <h1 className="font-display text-display-md text-ink">Confirming your payment…</h1>
        <p className="mt-2 text-body-md text-mist">
          This can take a few seconds. This page will update automatically.
        </p>
      </div>
    );
  }

  if (order.status === "CANCELLED") {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-coral/20 text-3xl">
          ✕
        </div>
        <h1 className="font-display text-display-md text-ink">Payment not completed</h1>
        <p className="mt-2 text-body-md text-mist">
          Your card was not charged. Please try checking out again.
        </p>
        <Link
          href="/cart"
          className="mt-6 inline-flex rounded-full bg-ink px-6 py-3 text-body-md font-medium text-ivory hover:bg-ink/90 transition-colors"
        >
          Back to bag
        </Link>
      </div>
    );
  }
```
Everything below (the success UI) stays and now only renders for `CONFIRMED` (and the legacy synchronous statuses, which are also `CONFIRMED`).

- [ ] **Step 3: Type-check + lint**

Run: `cd /Users/alialajme/Projects/Luna/e-luna/apps/customer && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts" && npx next lint 2>&1 | tail -5`
Expected: tsc clean; no new lint errors from the confirm page / sync component.

- [ ] **Step 4: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna
git add apps/customer/app/checkout/ConfirmPaymentSync.tsx apps/customer/app/checkout/confirm/page.tsx
git commit -m "feat(checkout): status-aware confirm page + payment sync trigger

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Stripe webhook route

**Files:** Create `apps/customer/app/api/webhooks/stripe/route.ts`.

- [ ] **Step 1: Create the route**

```ts
import { StripeGateway } from "../../../lib/payment/stripe";
import { applyPaymentResult } from "../../../lib/payment/reconcile";
import { hasStripe } from "../../../lib/payment/config";

export async function POST(req: Request) {
  if (!hasStripe()) return new Response("Stripe not configured", { status: 503 });

  const signature = req.headers.get("stripe-signature") ?? "";
  const rawBody = await req.text(); // raw body required for signature verification

  let result;
  try {
    result = await new StripeGateway().handleWebhook(rawBody, signature);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  if (result.kind !== "ignored" && result.orderId) {
    await applyPaymentResult(result).catch((e) => console.error("[stripe webhook] apply failed", e));
  }
  return new Response(null, { status: 200 }); // 200 for ignored/missing too, so Stripe stops retrying
}
```

- [ ] **Step 2: Type-check**

Run: `cd /Users/alialajme/Projects/Luna/e-luna/apps/customer && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts"`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna
git add apps/customer/app/api/webhooks/stripe/route.ts
git commit -m "feat(payments): Stripe webhook route (signature-verified, idempotent)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Env docs + operator guide

**Files:** Create/Modify `.env.example` (repo root); Create `docs/deployment/payments.md`.

- [ ] **Step 1: Append payment env vars to `.env.example`**

If `.env.example` exists at the repo root, append the block below; if it does not exist, create it with this block:
```bash
# --- Payments (Stripe: Card / Apple Pay / Google Pay) ---
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# --- Regional gateway scaffolds (activate per docs/deployment/payments.md) ---
TAP_SECRET_KEY=
TAP_MERCHANT_ID=
NOQODI_API_KEY=
NOQODI_MERCHANT_ID=
NEOPAY_API_KEY=
NEOPAY_MERCHANT_ID=
```

- [ ] **Step 2: Create `docs/deployment/payments.md`**

```markdown
# Payments — Operator Activation Guide

Payments are **author-complete but credential-gated**. With no keys set, the customer app
falls back to `SimulatedGateway` (instant capture) so development works unchanged. To go live:

## 1. Stripe (Card / Apple Pay / Google Pay)
1. Create a Stripe account; get the secret + publishable keys.
2. Set env vars (customer app):
   - `STRIPE_SECRET_KEY`
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
   - `STRIPE_WEBHOOK_SECRET` (from the webhook endpoint below)
3. Register a webhook endpoint in the Stripe dashboard pointing to
   `https://<host>/api/webhooks/stripe`, subscribing to
   `payment_intent.succeeded` and `payment_intent.payment_failed`.
4. **Apple Pay:** complete Apple Pay domain verification in the Stripe dashboard
   (registers your domain) — required before the Apple Pay button renders.
   Google Pay needs no extra step.
5. Local testing: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`,
   then pay with test card `4242 4242 4242 4242`.

The card flow is order-first: a `PENDING` order + `PENDING` transaction are created,
the Payment Element confirms, and the webhook (prod) or `syncOrderPayment` (the confirm
page's reconciler) flips the order to `CONFIRMED`/`CAPTURED`. Both paths are idempotent.

## 2. Apply the schema change
Run against the live database:
```
pnpm --filter @e-luna/db db:push
```
This adds the `TAP`, `NOQODI`, `NEOPAY` `PaymentMethod` values.

## 3. Regional gateways (Tap / Noqodi / NeoPay)
Each has a scaffold at `apps/customer/app/lib/payment/{tap,noqodi,neopay}.ts` that returns
a "not configured" failure until implemented. To activate one:
1. Implement `createPayment`/`refund` against the provider API (docs linked in each file):
   - Tap Payments — https://developers.tap.company/
   - Noqodi — https://noqodi.com/
   - NeoPay (Mashreq) — https://neopay.ae/
2. Set its env vars (`TAP_*`, `NOQODI_*`, `NEOPAY_*`).
   The factory returns the real gateway only when the corresponding key is present.

Apple Pay / Google Pay are recorded as `CARD` with `walletType` in
`PaymentTransaction.metadata` — no separate enum value.
```

- [ ] **Step 3: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna
git add .env.example docs/deployment/payments.md
git commit -m "docs(payments): env example + operator activation guide

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Repo-wide green check

**Files:** none (verification only).

- [ ] **Step 1: Frozen install to mirror CI**

Run: `cd /Users/alialajme/Projects/Luna/e-luna && pnpm install --frozen-lockfile 2>&1 | tail -5`
Expected: no lockfile mismatch (the Stripe deps added in Task 1 are already in the lockfile).

- [ ] **Step 2: Repo-wide lint**

Run: `cd /Users/alialajme/Projects/Luna/e-luna && pnpm lint 2>&1 | tail -15`
Expected: all apps pass (pre-existing `<img>` warnings in customer pages are acceptable; no new errors).

- [ ] **Step 3: Repo-wide type check**

Run: `cd /Users/alialajme/Projects/Luna/e-luna && pnpm --filter "@e-luna/*" exec tsc --noEmit 2>&1 | tail -15`
Expected: clean.

- [ ] **Step 4: Simulated-fallback proof (reason through, no keys set)**

Confirm by inspection: with `STRIPE_SECRET_KEY` unset, `getGateway("CARD")` returns `SimulatedGateway` → `initiateCardPayment` receives `{ status: "captured" }` → order is confirmed and cart cleared → `{ success: true, captured: true }` → `CheckoutForm` pushes to a `CONFIRMED` confirm page. Dev checkout is unbroken.

Run (sanity — the factory must select Simulated for CARD without keys):
```bash
grep -n "hasStripe() ? new StripeGateway() : new SimulatedGateway()" apps/customer/app/lib/payment/factory.ts
```
Expected: one match.

- [ ] **Step 5: Final commit (only if Steps 2-3 required fixes; otherwise skip)**

```bash
cd /Users/alialajme/Projects/Luna/e-luna
git add -A
git commit -m "chore(payments): lint/type fixes

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 6: Manual/operator smoke note (not automated)**

Live Stripe verification (Payment Element, Apple/Google Pay, webhook settlement, refund) requires real keys + a public webhook URL + Apple Pay domain verification per `docs/deployment/payments.md`. Not runnable in this environment.

---

## Self-Review (completed)

**Spec coverage:**
- `createPayment()` discriminated-union interface → Task 2 ✓
- Real Stripe adapter (intent + webhook + refund + retrieve) → Task 3 ✓
- Tap/Noqodi/NeoPay config-gated scaffolds → Task 3 ✓
- Env-aware `getGateway` + simulated fallback → Task 3, Task 9 Step 4 ✓
- Enum `TAP/NOQODI/NEOPAY` via db:generate/push → Task 1, Task 8 ✓
- Order-first + webhook + `syncOrderPayment` reconciler → Tasks 4, 6, 7 ✓
- Payment Element (Apple/Google Pay auto) → Task 5 ✓
- Apple/Google Pay as `CARD` + `walletType` metadata → reconcile.ts (Task 2) + retrievePayment (Task 3) ✓
- Non-card synchronous path preserved → Task 2 Step 7 ✓
- Cart cleared only on confirmation → Tasks 4, 4-sync, 2 ✓
- `.env.example` + `docs/deployment/payments.md` → Task 8 ✓
- Refund implemented, no trigger UI → Task 3 (StripeGateway.refund) ✓

**Placeholder scan:** none — every code step is complete. `TODO`/"not configured" strings are intentional scaffold guards, not plan gaps.

**Type consistency:** `CreatePaymentResult` (`captured|requires_action|failed`), `WebhookResult` (`payment_succeeded|payment_failed|ignored`), `getGateway`, `initiateCardPayment` (`{orderId, clientSecret?, captured?}`), `syncOrderPayment` (`{status}`), `applyPaymentResult`, `StripeGateway.retrievePayment`, `StripePaymentForm({clientSecret, orderId})`, `ConfirmPaymentSync({orderId})` — names/signatures are consistent across all tasks. `paymentMethod` cast narrows to the four non-card methods after the CARD branch (Task 5). Enum literals `"TAP"/"NOQODI"/"NEOPAY"` match the schema (Task 1).
```
