# ADR-0002 — Fail-closed payment gateway abstraction

**Status:** Accepted

## Context
The platform supports several payment methods (card via Stripe, BNPL Tabby/Tamara, Tap/Noqodi/NeoPay,
AYVANA Wallet, COD). Not all have live credentials in every environment. A mock/Simulated gateway is
useful for local/dev but must **never** be able to confirm/capture real money in production.

## Decision
A `PaymentGateway` interface with per-method adapters selected by a factory. A method is offerable
only when `providerAvailable(method)` is true — real credentials present **OR** `NODE_ENV !==
"production"`. Checkout re-checks this server-side allowlist (never trusts the client picker), so an
unconfigured provider whose Simulated fallback returns `captured` cannot mint a paid order in prod.

## Alternatives
- **Per-caller checks:** rejected — easy to forget; must be centralized and fail closed.
- **Remove Simulated entirely:** rejected — it is essential for dev/test; the guard is on *use in
  prod*, not existence.

## Consequences
- Production with missing Stripe config fails checkout safely rather than fake-capturing.
- New providers plug in as adapters + a `hasX()` config check.
- Card uses an order-first + webhook flow; wallet/COD are synchronous internal methods handled
  without the external gateway.
