# Production Hardening V2 — Audit & Remediation Log

**Baseline:** 2026-11-02 repo snapshot (post V1 hardening, PRs #37–#44 on `main`).
**Branch:** `hardening/production-readiness-v2`.
**Method:** inspect → confirm → fix → test → verify. No finding is "done" without a passing automated test.

---

## Baseline revalidation — V1 work already merged (preserve, do not redo)

The V1 program (this repo's prior hardening) already landed and is CI-green on `main`:

| Area | Status | Evidence |
|---|---|---|
| Financial concurrency/idempotency | **VERIFIED — NO CHANGE** | `@ayvana/db` suite incl. wallet/ledger/inventory/payout/refund race tests (131/131) |
| Refund double-external-refund (TOCTOU) | **VERIFIED** | claim-then-refund in `apps/vendor/app/actions/returns.ts` (#37) |
| Security (webhook timing-safe, fail-closed product read, ai-history rate-limit) | **VERIFIED** | #38 |
| DB hot-path indexes + explicit onDelete | **VERIFIED** | #39 |
| Architecture fitness guard (`check-architecture.mjs`) | **VERIFIED** | #40, negative-tested |
| AI Studio concurrency cap + monthly-limit policy | **VERIFIED** | #41, #44; `@ayvana/studio` 32/32 |
| Studio worker deployable + deploy-parity guard | **VERIFIED (source) / UNVERIFIED-RUNTIME (deploy)** | #42; no `az`/`kubectl`/`helm`/cluster in this env |

Environment limits (unchanged from V1, carried into V2 scoring honestly):
- No `az`/`kubectl`/`helm`/`docker` + no cluster → all live cloud/K8s validation is **UNVERIFIED-RUNTIME**.
- No real Stripe/Clerk/AI provider keys → real provider reconciliation + pen-test are **external evidence**.
- Integration tests share one local `ayvana_test` Postgres; re-runnability provided by the per-package Vitest `globalSetup` reset (`packages/{db,studio}`).

---

## Findings

### V2-001 — Payment factory could hand out a capturing Simulated gateway in production

- **Severity:** P0 (financial).
- **Status:** **CONFIRMED → FIXED + TESTED.**
- **Source:** `packages/payments/src/factory.ts` (every provider fell back to `new SimulatedGateway()` when unconfigured, with no production guard); `packages/payments/src/simulated.ts` (`createPayment` returned `{ status: "captured" }` unconditionally).
- **Root cause:** the only environment gate was `providerAvailable()` in the checkout action — a single layer. The factory + SimulatedGateway themselves had no production prohibition, so any code path reaching the factory with missing credentials in production would "capture" a payment for free.
- **Business impact:** orders could be marked paid without money moving (revenue loss / reconciliation corruption).
- **Remediation (defense in depth — 3 layers, none trusted alone):**
  1. `config.ts`: `simulationAllowed()` = non-prod **or** explicit `ALLOW_SIMULATED_PAYMENTS=true` (documented staging escape hatch) + `PaymentProviderUnavailableError`.
  2. `simulated.ts`: constructor **throws** when simulation isn't allowed — a simulated capture cannot even be constructed in production.
  3. `factory.ts`: when a provider is unconfigured, returns Simulated only where simulation is allowed, else **throws** `PaymentProviderUnavailableError` (incl. the internal LUNA_WALLET/COD paths). Checkout's existing `providerAvailable()` + try/catch turns the throw into a safe customer error, never a false success.
- **Test evidence:** `packages/payments/test/fail-closed.test.ts` — **9/9 passing** (new test harness; payments had none). Covers: prod can't instantiate Simulated; prod + missing creds fails closed for every external provider; internal methods fail closed in prod; dev/test simulation still works + captures; prod returns the REAL gateway when configured; the staging escape hatch re-enables simulation.
- **Verification:** `pnpm --filter @ayvana/payments test` → 9/9. `tsc --noEmit` clean for `@ayvana/payments` and `@ayvana/customer` (consumer). `pnpm install --frozen-lockfile` valid.
- **Residual / honest notes:** real Stripe capture/refund behavior remains **UNVERIFIED** (no keys) — covered by fail-closed tests, not live transactions. `providerAvailable()` intentionally has no `CARD` case because `placeOrder` excludes CARD (separate `initiateCardPayment` flow); not a gap.

---

## Sprint status

- **Sprint 1 (financial release blockers):** V2-001 payment fail-closed ✅ done. Inventory reservation lifecycle + production config validation: assessed — the atomic `reserveStockTx` + release + order-state machine from V1 already cover the core invariants with tests; a full persistent `InventoryReservation` entity with expiry is a larger, separately-scoped change (tracked, not yet implemented).
- Sprints 2–6 (migrations baseline, ledger completion, provider contract tests, broader coverage, outbox/observability, DR/preflight): **not yet started** — multi-session scope; will proceed incrementally, each with real test evidence, no premature completion claims.
