# ADR-0004 — Atomic inventory reservation & Decimal money

**Status:** Accepted

## Context
Checkout read stock then created an order without decrementing it (classic TOCTOU → oversell), and
computed authoritative money with JS floats then stored `Decimal` (drift, e.g. `10.10 * 10`).

## Decision
- **Inventory:** reserve with a single atomic conditional `updateMany({ where: { stock: { gte: qty }
  }, data: { stock: { decrement: qty } } })` inside the order `$transaction`; `count !== 1` →
  `InsufficientInventoryError` (rollback). Release on payment failure. Under READ COMMITTED the row
  lock makes concurrent racers re-evaluate the predicate, so exactly one takes the last unit.
- **Money:** all authoritative arithmetic uses `Prisma.Decimal` via shared helpers
  (`computeCartPricing`, `round2`); never `number` for prices/totals/refunds.

## Alternatives
- **Reservation table with expiry (`InventoryReservation`):** deferred — richer but heavier; atomic
  decrement + release-on-failure achieves the P0 invariant (never oversell) now. Abandoned-card hold
  (no time-expiry) is a documented P2.
- **Integer minor units for money:** viable, but Prisma `Decimal` end-to-end matches the schema and
  avoids a representation split.

## Consequences
- Proven by concurrency tests: stock=3 + 100 buyers → exactly 3 sold; no negative stock; money math
  is exact.
