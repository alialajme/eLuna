# Payments Gateway Phase — Design Spec

## Goal

Replace the simulated checkout charge with a real, Stripe-first payment integration that processes Card / Apple Pay / Google Pay, and add code-complete, config-gated adapter scaffolds for the UAE gateways **Tap Payments**, **Noqodi**, and **NeoPay** — all behind one unified `PaymentGateway` interface. The system must keep working in development with **zero credentials** (simulated fallback), and stay verifiable by typecheck/lint here while live processing is an operator activation step.

---

## Scope

**In scope:**
- Evolve the `PaymentGateway` interface from a synchronous `charge()` to a `createPayment()` discriminated-union model that supports both instant (simulated/wallet) and async (Stripe intent + webhook) gateways.
- A real **Stripe** adapter: PaymentIntent creation, webhook verification, and refunds. Card + Apple Pay + Google Pay via the Payment Element.
- **Tap, Noqodi, NeoPay** adapter scaffolds implementing the new interface, config-gated, documented, ready for credentials.
- **Order-first + webhook** card checkout flow: `PENDING` order → Payment Element → webhook/sync reconciliation → `CONFIRMED`.
- `PaymentMethod` enum gains `TAP`, `NOQODI`, `NEOPAY` (via `prisma db push` + client regen).
- Env-aware `getGateway(method)` with simulated fallback; `lib/payment/config.ts`; `.env.example`; `docs/deployment/payments.md`.

**Out of scope (explicitly):**
- Apple Pay / Google Pay as distinct enum values — they are recorded as `CARD` with `walletType` in `PaymentTransaction.metadata` (Stripe models them as card wallets).
- Real `TABBY`/`TAMARA` redirect+webhook integration — they remain today's stubs, migrated to the new interface only.
- `LUNA_WALLET` balance-debit logic and `CASH_ON_DELIVERY` semantics — unchanged from today.
- A refund **trigger** UI (returns flow) — that is Phase 7. The Stripe adapter implements `refund()`, but no new customer/admin refund button is added here.
- Running live credentials, registering webhook endpoints, Apple Pay domain verification, and `prisma db push` against a live DB — all operator activation steps.

---

## Architecture

### Current state (verified)
- `apps/customer/app/actions/checkout.ts` → `placeOrder()`: synchronous. Calls `getGateway(method).charge()` (returns `{success, externalRef}` instantly), then creates an Order `CONFIRMED` + a `CAPTURED` `PaymentTransaction`, clears the cart cookie.
- `apps/customer/app/lib/payment/`: `gateway.ts` (interface `charge`/`refund`), `factory.ts` (`getGateway(method)` switch), `simulated.ts`, `tabby.ts`, `tamara.ts` (all stubs).
- Schema: `PaymentMethod` = `CARD | LUNA_WALLET | TABBY | TAMARA | CASH_ON_DELIVERY`. `PaymentTransaction { id, orderId, method, status (PaymentStatus), amount, currency, externalRef?, metadata Json, ... }` with `onDelete: Restrict`. `OrderStatus` includes `PENDING`, `CONFIRMED`, `CANCELLED`. Repo uses **`prisma db push`** (no migration history).

### Unified gateway interface (`lib/payment/gateway.ts`)
```ts
export type CreatePaymentParams = {
  amount: number;
  currency: string;         // "AED"
  orderId: string;
  customerEmail: string;
  description: string;
  metadata?: Record<string, string>;
};

export type CreatePaymentResult =
  | { status: "captured"; externalRef: string }                                   // instant (simulated/wallet/COD)
  | { status: "requires_action"; externalRef: string; clientSecret: string }      // async (Stripe card)
  | { status: "failed"; error: string };

export type RefundParams = { externalRef: string; amount: number; reason?: string };
export type RefundResult = { success: boolean; error?: string };

export type WebhookResult =
  | { kind: "payment_succeeded"; orderId: string; externalRef: string; walletType?: string }
  | { kind: "payment_failed"; orderId: string; externalRef: string }
  | { kind: "ignored" };

export interface PaymentGateway {
  createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult>;
  refund(params: RefundParams): Promise<RefundResult>;
  handleWebhook?(rawBody: string, signature: string): Promise<WebhookResult>; // only intent/webhook gateways
}
```
- `SimulatedGateway.createPayment` → `{ status: "captured", externalRef: "sim_..." }` (dev keeps working with no keys).
- `StripeGateway.createPayment` → `{ status: "requires_action", externalRef: pi.id, clientSecret }`.
- `handleWebhook` is optional; only `StripeGateway` implements it this phase.

### Env-aware factory (`lib/payment/factory.ts`)
```ts
export function getGateway(method: string): PaymentGateway {
  switch (method) {
    case "CARD":
      return hasStripe() ? new StripeGateway() : new SimulatedGateway();
    case "TABBY": return new TabbyGateway();
    case "TAMARA": return new TamaraGateway();
    case "TAP": return hasTap() ? new TapGateway() : new SimulatedGateway();
    case "NOQODI": return hasNoqodi() ? new NoqodiGateway() : new SimulatedGateway();
    case "NEOPAY": return hasNeopay() ? new NeopayGateway() : new SimulatedGateway();
    case "LUNA_WALLET":
    case "CASH_ON_DELIVERY":
    default:
      return new SimulatedGateway();
  }
}
```
The `hasX()` helpers live in `config.ts` and gate on the presence of that gateway's secret env var. Absent keys ⇒ `SimulatedGateway` ⇒ instant capture ⇒ dev unbroken.

### Config (`lib/payment/config.ts`)
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
Client publishable key is exposed via `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.

### Files
```
apps/customer/app/lib/payment/gateway.ts          — evolve interface (createPayment + WebhookResult + handleWebhook)
apps/customer/app/lib/payment/config.ts           — CREATE: env presence helpers + stripeConfig()
apps/customer/app/lib/payment/stripe.ts           — CREATE: real Stripe adapter
apps/customer/app/lib/payment/tap.ts              — CREATE: Tap scaffold
apps/customer/app/lib/payment/noqodi.ts           — CREATE: Noqodi scaffold
apps/customer/app/lib/payment/neopay.ts           — CREATE: NeoPay scaffold
apps/customer/app/lib/payment/simulated.ts        — MODIFY: new interface (returns "captured")
apps/customer/app/lib/payment/tabby.ts            — MODIFY: new interface (still stubbed)
apps/customer/app/lib/payment/tamara.ts           — MODIFY: new interface (still stubbed)
apps/customer/app/lib/payment/factory.ts          — MODIFY: env-aware getGateway
apps/customer/app/actions/checkout.ts             — MODIFY: placeOrder→createPayment (non-card); add initiateCardPayment + syncOrderPayment
apps/customer/app/checkout/CheckoutForm.tsx       — MODIFY: branch CARD → Stripe flow
apps/customer/app/checkout/StripePaymentForm.tsx  — CREATE: <Elements> + <PaymentElement> + confirmPayment
apps/customer/app/checkout/confirm/page.tsx       — MODIFY: read redirect_status, syncOrderPayment, clear cart on success
apps/customer/app/api/webhooks/stripe/route.ts    — CREATE: verify signature (raw body), idempotent state flip
packages/db/prisma/schema.prisma                  — MODIFY: PaymentMethod += TAP, NOQODI, NEOPAY
.env.example                                       — MODIFY/CREATE: document all payment env vars
docs/deployment/payments.md                        — CREATE: operator activation guide
```
New dependencies (customer app): `stripe` (server SDK), `@stripe/stripe-js` + `@stripe/react-stripe-js` (client Payment Element).

---

## Data flow

### Card path (Stripe live)
1. `CheckoutForm` (method `CARD`) → `initiateCardPayment(input)`.
2. Server action validates cart/address/line items (reused from `placeOrder`), creates Order `PENDING` + items + `PaymentTransaction` `PENDING` (method `CARD`), calls `StripeGateway.createPayment({ ..., metadata:{ orderId } })`, saves `externalRef`, returns `{ orderId, clientSecret }`.
3. `StripePaymentForm` renders `<Elements clientSecret>` + `<PaymentElement>`; `stripe.confirmPayment({ return_url: /checkout/confirm?order=<orderId> })`. Apple Pay / Google Pay buttons + 3DS handled by the Element.
4. Stripe redirects to `/checkout/confirm`. The page calls `syncOrderPayment(orderId)` (server-side retrieve + idempotent flip) and clears the cart cookie client-side on success.
5. In production, the Stripe **webhook** independently flips the same state (idempotent). In dev/preview (no public URL), `syncOrderPayment` is the working path.

### Card path (no Stripe keys — dev fallback)
`getGateway("CARD")` → `SimulatedGateway` → `createPayment` returns `captured` → `initiateCardPayment` confirms the order immediately and returns `{ orderId, captured:true }`; `CheckoutForm` skips the Element and goes straight to confirm. Identical to today's behavior.

### Non-card path (wallet / COD / tabby / tamara)
`placeOrder` refactored to call `getGateway(method).createPayment(...)`; all these gateways return `captured` → Order `CONFIRMED` + `CAPTURED` transaction + cart cleared, exactly as today.

---

## Stripe adapter (`lib/payment/stripe.ts`)

```ts
import Stripe from "stripe";
import { stripeConfig } from "./config";
import type { PaymentGateway, CreatePaymentParams, CreatePaymentResult, RefundParams, RefundResult, WebhookResult } from "./gateway";

export class StripeGateway implements PaymentGateway {
  private client = new Stripe(stripeConfig().secret);

  async createPayment(p: CreatePaymentParams): Promise<CreatePaymentResult> {
    try {
      const intent = await this.client.paymentIntents.create({
        amount: Math.round(p.amount * 100),          // AED → fils
        currency: p.currency.toLowerCase(),
        automatic_payment_methods: { enabled: true }, // surfaces Apple/Google Pay + cards
        description: p.description,
        receipt_email: p.customerEmail || undefined,
        metadata: { orderId: p.orderId, ...(p.metadata ?? {}) },
      });
      if (!intent.client_secret) return { status: "failed", error: "No client secret" };
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
      const walletType = (pi.payment_method as unknown as { card?: { wallet?: { type?: string } } } | null)?.card?.wallet?.type;
      return { kind: "payment_succeeded", orderId: pi.metadata.orderId ?? "", externalRef: pi.id, walletType };
    }
    if (event.type === "payment_intent.payment_failed") {
      const pi = event.data.object as Stripe.PaymentIntent;
      return { kind: "payment_failed", orderId: pi.metadata.orderId ?? "", externalRef: pi.id };
    }
    return { kind: "ignored" };
  }
}
```
Note: `walletType` may be absent on the intent object without expansion; the webhook/sync path treats it as best-effort metadata. Where richer detail is needed, the reconciler may retrieve the intent with `expand: ["payment_method"]`.

## Scaffold adapters (`tap.ts`, `noqodi.ts`, `neopay.ts`)

Each is a complete class implementing `PaymentGateway`, with the real integration points documented and a safe fallback so it never silently pretends to charge when unconfigured:

```ts
// lib/payment/tap.ts  (noqodi.ts / neopay.ts follow the same shape)
import type { PaymentGateway, CreatePaymentParams, CreatePaymentResult, RefundParams, RefundResult } from "./gateway";

// Integration point: Tap Payments — https://developers.tap.company/
// Required env: TAP_SECRET_KEY, TAP_MERCHANT_ID. Uses hosted-redirect charges + webhook callbacks.
export class TapGateway implements PaymentGateway {
  async createPayment(_p: CreatePaymentParams): Promise<CreatePaymentResult> {
    // TODO(operator): POST /charges with source, redirect.url = return_url; return { status:"requires_action", ... }
    return { status: "failed", error: "Tap gateway not yet configured" };
  }
  async refund(_p: RefundParams): Promise<RefundResult> {
    return { success: false, error: "Tap gateway not yet configured" };
  }
}
```
Because the factory only returns `TapGateway`/`NoqodiGateway`/`NeopayGateway` when the corresponding `hasX()` is true, an unconfigured scaffold is never reached at runtime; the explicit `"failed"` return is a defensive guard for the misconfigured case. Docs URLs and required env vars are recorded in `docs/deployment/payments.md`.

---

## Server actions (`actions/checkout.ts`)

- **`placeOrder(input)`** — refactored: rejects `CARD` (routes to the card flow), otherwise calls `getGateway(method).createPayment(...)`, expects `captured`, creates the `CONFIRMED` order + `CAPTURED` transaction, clears the cart. Any non-`captured` result → `{success:false,error}`.
- **`initiateCardPayment(input)`** — validates, creates `PENDING` order + `PENDING` transaction, calls Stripe `createPayment`, persists `externalRef`. Returns `{ success:true, orderId, clientSecret }` (live) or `{ success:true, orderId, captured:true }` (simulated fallback). On intent failure, marks the order/tx `FAILED` and returns an error.
- **`syncOrderPayment(orderId)`** — ownership-checked (order.customer.userId === session user). Server-side retrieves the intent (via `StripeGateway` / a thin retrieve helper), applies the idempotent flip: succeeded → `CONFIRMED`/`CAPTURED` (+ `walletType` metadata); failed → `CANCELLED`/`FAILED`; processing → leave `PENDING`. No-op if the order is already terminal.

Idempotency rule (shared by webhook + sync): only transition orders currently in `PENDING`.

---

## Webhook route (`api/webhooks/stripe/route.ts`)

```ts
export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature") ?? "";
  const rawBody = await req.text();                    // raw body required for signature check
  let result;
  try {
    result = await new StripeGateway().handleWebhook(rawBody, sig);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }
  if (result.kind !== "ignored" && result.orderId) {
    await applyPaymentResult(result).catch((e) => console.error("[stripe webhook] apply failed", e));
  }
  return new Response(null, { status: 200 });          // 200 even on ignored/missing to stop retries
}
```
`applyPaymentResult` is the shared idempotent state-flip used by both the webhook and `syncOrderPayment`. Only bad signatures return `400`.

---

## Error handling

- **initiateCardPayment:** validation → `{success:false,error}`; intent-create throw → order/tx `FAILED`, error returned.
- **StripeGateway:** all SDK calls wrapped; `createPayment`/`refund` return typed failures rather than throwing (except `handleWebhook`, which throws on bad signature so the route can answer `400`).
- **Webhook route:** `400` only on signature failure; everything else `200`; apply errors are logged, not surfaced (Stripe retries are then a safety net, and the flip is idempotent).
- **syncOrderPayment:** ownership-checked; idempotent; safe to call repeatedly from the confirm page.
- **Simulated fallback:** no keys ⇒ no Stripe code path is exercised ⇒ no runtime dependency on `stripe` env at request time for non-card methods.

---

## Testing / verification

No automated suite (consistent with the repo). Per task:
```bash
# regenerate the Prisma client with the new enum values (offline; no DB needed)
pnpm --filter @e-luna/db db:generate
cd apps/customer && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts"   # clean
cd apps/customer && npx next lint 2>&1 | tail -3                            # no errors
```
Final task runs repo-wide `pnpm lint` + `pnpm --filter "@e-luna/*" exec tsc --noEmit`.

**Simulated-fallback proof (must hold):** with `STRIPE_SECRET_KEY` unset, `getGateway("CARD")` returns `SimulatedGateway`; `initiateCardPayment` returns `captured:true`; the confirm page shows a `CONFIRMED` order — the existing dev checkout is unbroken.

**Live Stripe (operator, not run here):** set keys, `stripe listen --forward-to /api/webhooks/stripe`, pay with a Stripe test card (`4242…`), verify webhook flips the order; verify Apple/Google Pay after domain verification.

---

## Operator activation steps (cannot be exercised in this environment)

1. Provision Stripe account; set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.
2. Register the webhook endpoint (`/api/webhooks/stripe`) in the Stripe dashboard (public URL).
3. **Apple Pay domain verification** in the Stripe dashboard before the Apple Pay button renders in production.
4. `pnpm --filter @e-luna/db db:push` against the live DB to apply the `TAP/NOQODI/NEOPAY` enum values.
5. To activate a regional gateway, implement the documented TODO in its adapter and set its env vars (`TAP_*`, `NOQODI_*`, `NEOPAY_*`).

All documented in `docs/deployment/payments.md`, mirroring the Azure infra's author-now / operator-activates model.

---

## Naming note

This spec reads the newly requested gateways as: **Tap Payments** (tap.company), **Noqodi** (noqodi.com), **NeoPay** (NeoPay by Mashreq, neopay.ae). Correct during review if a different provider was intended for any of these.
