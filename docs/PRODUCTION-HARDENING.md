# e-Luna — Production Hardening Working Document

Living checklist for the production-hardening effort. Source of truth is the **repository**, not
assumptions. Each finding is validated against current code before implementation.

Branch: `hardening/p0-financial-correctness` (off `main`).
> Note: an uncommitted throwaway **demo shim** (`DEMO_USER_ID` Clerk bypass) was stashed on `main`
> (`stash@{0}`) before branching so hardening work stays isolated. Restore it after this work.

---

## Phase 0 — Baseline (captured 2026-08-28)

| Aspect | Baseline |
|--------|----------|
| Apps | `customer`, `vendor`, `admin`, `supplier` (Next.js 15, Turborepo) |
| Shared pkgs | `ui`, `db`, `ai`, `auth`, `config`, `payments`, `courier`, `einvoice` |
| Test files | **0** — no vitest/jest/playwright anywhere. Coverage **0%**. |
| Root scripts | `build`, `dev`, `lint`, `test` (turbo, but no package implements `test`), `db:*`, `format`. No `typecheck`, no `verify`, no coverage. |
| CI gates | install, lint, `tsc --noEmit`, gitleaks. **Missing:** tests, coverage, build, dep-scan, SAST, container-scan. |
| DB | PostgreSQL via Prisma (`schema.prisma`, 737 lines). Money fields are `Decimal(10,2)` ✅. Local PG on :5432; dedicated `eluna_test` created for integration tests. |

---

## Findings (validated against current code)

Severity: **P0** = financial/inventory correctness or prod-safety; **P1** = high; **P2** = medium.

| # | Finding | Sev | Evidence | Status |
|---|---------|-----|----------|--------|
| F1 | **Inventory oversell** — checkout never checks/decrements `ProductVariant.stock`; `findMany` only verifies existence. 100 concurrent buyers of `stock=3` all succeed. | P0 | `apps/customer/app/actions/checkout.ts:50-57,112-144,173-233` | ✅ FIXED |
| F2 | **Wallet has no integrity** — `LUNA_WALLET` routed through `SimulatedGateway`→`"captured"`; no balance check, no debit, no ledger. Server-side allowlisted ⇒ unlimited free orders. | P0 | `checkout.ts:37,93-144`; `schema.prisma:187` (no `WalletTransaction`) | ✅ FIXED |
| F3 | **COD marked CAPTURED** — COD routed through gateway ⇒ `PaymentTransaction.status=CAPTURED` at placement instead of `PENDING` until cash collected. | P0 | `checkout.ts:93-144`; `packages/payments/src/simulated.ts:10-12` | ✅ FIXED |
| F4 | **Money float arithmetic** — prices coerced `Number(...)`, `*`, `reduce +` then stored as `Decimal`. | P1 | `checkout.ts:75-89,192-206` | ✅ FIXED |
| F5 | **Supplier app absent from deploy** — not in Dockerfile loop, CI/ACR, Helm values, no `/api/health`. | P0(deploy) | `docker/Dockerfile`, `.github/workflows/azure-deploy.yml:37-45`, `infra/helm/luna/values.yaml:30-39` | ✅ FIXED |
| F6 | **Unguarded order status writes** — `checkout.ts` sets `CANCELLED`/`CONFIRMED` without validating prior state. | P1 | `checkout.ts:247`; `reconcile.ts:19,30` | 🟡 PARTIAL — `order-state.ts` policy (`assertOrderTransition`/`assertPaymentTransition`) + unit tests landed; enforcement at every manual write site deferred to Phase 2 |
| F7 | **Refund lacks prior-status guard** — refund writes `REFUNDED` without checking tx is `CAPTURED`; double-refund possible in DB. | P1 | `apps/vendor/app/actions/returns.ts:142-145` | ✅ FIXED (`3be6912`) — money-refund gated on CAPTURED; `assertPaymentTransition` enforced. Full refund E2E test → Phase 2 §12 |
| F8 | **No health/readiness split; no DB check** — `/api/health` returns static `{status:"ok"}`; probes uninformed. | P1 | `apps/*/app/api/health/route.ts` | ✅ FIXED (ready probe + DB check) |
| — | Simulated gateway in prod | — | factory + `providerAvailable()` + checkout allowlist | ✅ ALREADY MITIGATED (commit 0315228) |
| — | Webhook idempotency | — | `reconcile.ts:9-37` state-guard + Stripe sig verify | ✅ ALREADY CORRECT |

---

## Phase 1 — P0 Financial Correctness (this session)

Design (matches existing repo conventions — domain logic in `@e-luna/db`, alongside `order-status.ts`):

- `packages/db/src/errors.ts` — typed domain errors (`InsufficientInventoryError`, `InsufficientFundsError`, `InvalidStateTransitionError`, …).
- `packages/db/src/money.ts` — `Decimal`-based pricing helpers (no float on money).
- `packages/db/src/inventory.ts` — `reserveStockTx(tx, items)` / `releaseStockTx(tx, items)` using **atomic conditional `updateMany({where:{stock:{gte:qty}}})`** — the DB enforces no-oversell.
- `packages/db/src/wallet.ts` — `debitWalletTx` / `creditWalletTx` with atomic balance guard + immutable `WalletTransaction` ledger row.
- `packages/db/src/order-state.ts` — explicit order/payment transition policy (`assertOrderTransition`).
- Schema: new `WalletTransaction` model + `WalletTxnType` enum (immutable ledger). Additive only.
- `checkout.ts` refactor: atomic inventory reservation for every order; wallet path debits real balance + ledger; **COD ⇒ order CONFIRMED but payment PENDING**; card path reserves stock and releases on failure; all money via `money.ts`.

Testing (real Postgres `eluna_test`, no mocks for atomicity):
- Unit: money math, domain errors, transition policy.
- Integration/concurrency: last-item oversell race, wallet double-spend, COD payment-pending, card reserve/release.

## Phase 1 status (this session) — COMPLETE

Commits on `hardening/p0-financial-correctness`:
- `ad4b182` — atomic inventory reservation, wallet ledger, COD-pending, decimal money (F1–F4)
- `5436fe3` — supplier deploy parity, live/ready health probes, CI test+parity gates (F5, F8)

Verification (all green): full-workspace `tsc --noEmit` exit 0; customer `next lint` clean
(pre-existing `<img>` warnings only); `@e-luna/db` **27 tests pass** (unit + real-Postgres
integration incl. concurrency invariants); deploy-parity guard passes (4/4 apps).

Proven invariants (real Postgres, no mocks):
- Inventory: `stock=3` + 100 concurrent buyers → exactly 3 sold, 97 rejected, final stock 0 (never negative).
- Wallet: `AED 100` + 10 concurrent `AED 80` debits → exactly 1 succeeds, balance 20, one immutable DEBIT ledger row.

## Phase 2 status (§10/§11) — CORE COMPLETE

Commit `be793f4` on `hardening/p0-financial-correctness`:
- **§10 Financial ledger** — immutable `LedgerEntry` (+ `LedgerEntryType`, append-only, signed);
  `appendLedgerEntry`. PAYOUT posted on completion; REFUND posted on captured-payment refund.
- **§11 Payouts** — fixed a real **double-payout bug**: `computeVendorBalance` (centralized,
  Decimal, subtracts in-flight PENDING/PROCESSING payouts too) replaces the duplicated float logic
  in both the action and the payouts page; `createVendorPayout` uses `SELECT … FOR UPDATE` to
  serialize; `assertPayoutTransition` makes COMPLETED/FAILED terminal.

Verification: workspace `tsc` exit 0 · admin+vendor lint clean · **34 tests pass** (+7). New
invariant proven: concurrent `createVendorPayout` → exactly one payout, balance never double-paid.

**§12 refund/return — CORE COMPLETE** (commit `f1218da`):
- `computeRefundBreakdown` bounds refund ≤ captured item value (throws on over-refund/non-positive)
  and splits gross into vendor-net + platform-commission reversals; refund posts REFUND (−net) +
  COMMISSION (−commission) ledger entries. `requestReturn.refundAmount` now Decimal.
- Cumulative bound holds structurally (one active return per item; item→RETURNED once).
- Tests +6 (40 total): commission split, Decimal exactness, over-refund/non-positive rejection.

Still deferred (documented, not hidden):
- Make the ledger *authoritative* by posting SALE/COMMISSION accrual entries at delivery (needs
  delivery-path test coverage first) — today balance is operational + ledger is the money-movement
  audit trail. Refund/return E2E through the Clerk-coupled server action (core math is unit-tested).

## Deferred to later phases
- F7 refund guard, financial ledger (§10), payouts hardening (§11), full refund/return audit (§12).
- Rate limiting, audit log, security headers, observability, outbox, K8s securityContext, ADRs/threat-model/DR docs.
- Full test-pyramid to 90% coverage across all apps.
