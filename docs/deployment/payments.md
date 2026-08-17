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

The card flow is **order-first**: a `PENDING` order + `PENDING` transaction are created,
the Payment Element confirms, and the webhook (prod) or `syncOrderPayment` (the confirm
page's reconciler, used in dev/preview where there is no public webhook URL) flips the
order to `CONFIRMED`/`CAPTURED`. Both paths are idempotent (only `PENDING` orders move).

Apple Pay / Google Pay are recorded as `CARD` with `walletType` in
`PaymentTransaction.metadata` — no separate `PaymentMethod` enum value.

## 2. Apply the schema change
Run against the live database:
```
pnpm --filter @e-luna/db db:push
```
This adds the `TAP`, `NOQODI`, `NEOPAY` `PaymentMethod` values (the repo uses `db push`,
not migration files).

## 3. Regional gateways (Tap / Noqodi / NeoPay)
Each has a scaffold at `apps/customer/app/lib/payment/{tap,noqodi,neopay}.ts` that returns
a "not configured" failure until implemented. To activate one:
1. Implement `createPayment`/`refund` against the provider API (docs linked in each file):
   - Tap Payments — https://developers.tap.company/
   - Noqodi — https://noqodi.com/
   - NeoPay (Mashreq) — https://neopay.ae/
2. Set its env vars (`TAP_*`, `NOQODI_*`, `NEOPAY_*`).
   The env-aware factory (`apps/customer/app/lib/payment/factory.ts`) returns the real
   gateway only when the corresponding key is present; otherwise it falls back to the
   simulated gateway, so an unconfigured method never blocks checkout in development.

## 4. Refunds
`StripeGateway.refund()` is implemented (PaymentIntent refund). A customer/admin refund
**trigger** UI is intentionally not part of this phase — it belongs to the returns flow
(Phase 7).

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
