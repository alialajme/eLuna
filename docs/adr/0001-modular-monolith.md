# ADR-0001 — Modular monolith on Turborepo

**Status:** Accepted

## Context
e-Luna serves four personas (customer, vendor, admin, supplier) over one relational domain (orders,
inventory, payments, payouts). The team is small and correctness/velocity matter more than
independent horizontal scaling of individual services today.

## Decision
Build a **modular monolith**: a Turborepo of four Next.js apps sharing typed packages. Enforce strong
internal boundaries — domain/financial logic lives in `@e-luna/db` services, integrations in
dedicated packages (`payments`, `courier`, `einvoice`, `ai`), so a module *could* later be extracted
to a service without a rewrite.

## Alternatives
- **Microservices:** premature; would add network partitions, distributed transactions and ops
  overhead across a domain that shares one transactional database.
- **Single Next.js app with role routing:** rejected — personas need separate auth instances and
  independent deploy/scaling; separate apps give that isolation.

## Consequences
- One database enables ACID guarantees for money/inventory (used heavily: atomic reservation, wallet
  debit, race-safe payouts).
- Shared packages must keep clean boundaries; the transactional outbox (ADR-0005) is the seam for
  future async/service extraction.
- Deploy parity across four apps is enforced by a CI guard so none is forgotten.
