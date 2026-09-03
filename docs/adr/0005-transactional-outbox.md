# ADR-0005 — Transactional outbox for domain events

**Status:** Accepted

## Context
Downstream work (notifications, invoicing, analytics, shipment creation) should react to domain events
(order confirmed, payment captured) without blocking the customer request, and without the classic
"DB committed but the event was lost / published twice" failure.

## Decision
A transactional **outbox**: `appendOutboxEvent(tx, …)` writes the event in the *same* transaction as
the state change. A `processOutbox` worker claims due events with an atomic
`UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED) RETURNING …` that flips them to `PROCESSING`
with a visibility timeout, runs an idempotent handler, then marks `PROCESSED` or reschedules with
backoff until `maxAttempts` → `FAILED`. Producer wired into `applyPaymentResult`.

## Alternatives
- **Publish directly after commit:** rejected — a crash between commit and publish loses the event.
- **Azure Service Bus with the outbox as the reliable source:** compatible and intended — the worker
  handler can publish to Service Bus; the outbox guarantees at-least-once regardless.

## Consequences
- Exactly-once *claim* under concurrent workers (proven: 30 events, 3 concurrent workers, no
  double-processing); at-least-once *delivery* (handlers must be idempotent).
- A running dispatcher process/cron and real consumers are a documented follow-up.
