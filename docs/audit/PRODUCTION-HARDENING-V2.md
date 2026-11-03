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

### V2-002 — Newly-disclosed transitive CVEs failing Trivy (deps)

- **Severity:** HIGH (dependency DoS CVEs). **Status:** **RESOLVED (merged via PR #47, main @ f5b1844).** Remediation designed + validated here, then the lockfile regen that had been environment-blocked was completed once registry access returned: `pnpm-lock.yaml` collapsed `next` 15.5.26→15.5.28 (bounded override), `apps/mobile/package-lock.json` resolved `node-forge` 1.4.2 + `decode-uri-component` 0.5.1. `pnpm install --frozen-lockfile` green; Trivy (deps) green on #47/#48/#49. Original blocked analysis preserved below.
- **Source:** `Trivy (deps)` on PRs #45/#46 (and therefore `main`). Time-based disclosures — not introduced by any code change in this program:
  - `decode-uri-component` 0.2.2 → fixed **0.5.1** (CVE-2026-118664, DoS) — transitive (both `pnpm-lock.yaml` + `apps/mobile/package-lock.json`).
  - `node-forge` 1.4.0 → fixed **1.4.1** (CVE-2026-118779/118782/119187/119188/119190) — transitive.
  - `next` 15.5.26 → fixed **15.5.28** (CVE-2026-94482, DoS) — direct dependency of the 4 web apps.
- **Why blocked here:** `pnpm install --lockfile-only` would not fully re-resolve offline ("downloaded 0"), and `@clerk/nextjs@6.39.7` peer-pins the vulnerable `next@15.5.26`, so a correct lock requires a clean networked install. A half-regenerated lock was produced and **reverted** rather than shipped (do not ship an inconsistent/still-vulnerable lockfile). An unbounded `next` override (`>=15.5.28`) was tried and **rejected** — it resolved to `next@16.4.4` (a major-version jump that would break all apps). The correct fix bumps the apps' pinned `next` to `15.5.28` (stays in 15.5.x).
- **Remediation recipe (run on a machine with registry access):**
  1. Branch off `main`.
  2. Bump `"next": "15.5.26"` → `"15.5.28"` in `apps/{admin,customer,supplier,vendor}/package.json`. (Do **not** add an unbounded `next` pnpm override — it jumps to 16.x.)
  3. Add to root `package.json` `pnpm.overrides`: `"decode-uri-component@<0.5.1": ">=0.5.1"`, `"node-forge@<1.4.1": ">=1.4.1"`.
  4. Add to `apps/mobile/package.json` `overrides`: `"decode-uri-component": ">=0.5.1"`, `"node-forge": ">=1.4.1"`.
  5. `pnpm install` (clean, networked) → regenerates `pnpm-lock.yaml`. Verify `grep -E "^  next@15\.5\.[0-9]+:" pnpm-lock.yaml` shows **only 15.5.28**.
  6. If a `next@15.5.26` node lingers — it is peer-pinned by `@clerk/nextjs@6.39.7` (`@clerk/nextjs@6.39.7(next@15.5.26…)`) — `pnpm dedupe` may NOT collapse it. The reliable fix is a **bounded exact-version override** in root `pnpm.overrides`: `"next@15.5.26": "15.5.28"`. This rewrites every `15.5.26` node (incl. Clerk's peer context) to `15.5.28` **without** the unbounded `>=15.5.28` form that jumps to `next@16.x`. (Attempted here but could not be validated — this env's pnpm would not re-resolve/fetch; verify on the networked machine that `next@15.5.26` is gone from the lock afterward.)
  7. `cd apps/mobile && npm install --package-lock-only` to fix the npm lockfile.
  8. `pnpm install --frozen-lockfile` must pass; commit the lockfiles + package.json edits. Re-run CI on #45/#46 (and `gh run rerun` any `next/font` CDN flake on Production build).
- **Verification here:** fix versions confirmed to exist on the registry; `next@15.5.28` is the latest 15.5.x patch. **Exhausted in this env (all failed — pnpm reports `downloaded 0`, won't re-resolve): `pnpm install --lockfile-only`, full `pnpm install`, `pnpm dedupe`, and the bounded `next@15.5.26→15.5.28` override.** Full lockfile regen + Trivy re-scan = **UNVERIFIED (requires a networked machine where pnpm can fetch).** *(Later resolved — see the Status line above; registry access returned and the regen completed exactly as the recipe prescribed.)*

### V2-003 — BNPL scaffolds (Tabby/Tamara) fake-capture when a provider key is set

- **Severity:** P0 (financial — fake production payment success). **Status:** **CONFIRMED → FIXED + TESTED.**
- **Source:** `packages/payments/src/tabby.ts:14` and `tamara.ts:14` — `createPayment` returned `{ status: "captured", externalRef: "..._stub_..." }` **unconditionally** (plus a `console.warn`); `refund` returned `{ success: true }`. These scaffolds are instantiated by the factory only when `hasTabby()` / `hasTamara()` is true — i.e. when the operator has set `TABBY_API_KEY` / `TAMARA_API_KEY`.
- **Root cause:** the #46 fail-closed work guarded the *unconfigured* path (missing key → Simulated, which is production-guarded). It did **not** guard the *configured-but-unimplemented* path: setting the env key flips `hasX()` true, so the factory returns the real scaffold class — which, being a stub, fakes a capture. In production this marks an order **paid without any money moving**, bypassing every #46 guard. Tap/Noqodi/NeoPay were already correct (they return `{ status: "failed", error: "not yet configured" }`); Tabby/Tamara were the older Phase-3 stubs that predate that pattern.
- **Business impact:** a single stray/premature BNPL key in prod → silent free orders + reconciliation corruption. Exactly the "never introduce fake production success" invariant.
- **Remediation:** `tabby.ts` + `tamara.ts` now fail closed like `tap.ts` — `createPayment` → `{ status: "failed", error: "<Provider> gateway is not yet configured" }`, `refund` → `{ success: false, error: ... }`. No factory/config change needed (unconfigured path still → Simulated in non-prod; configured path now safely fails instead of fake-capturing until the real SDK is wired). Nothing depends on the old capture behavior (only the factory references these classes; dev BNPL flows route through Simulated, not the stub).
- **Test evidence:** `packages/payments/test/contract.test.ts` — **12 tests.** A `describe.each` over all five scaffolds (Tabby/Tamara/Tap/Noqodi/NeoPay) asserts `createPayment` **never** returns `captured` (the invariant that catches this class of bug) and `refund` never returns success, plus discriminated-union shape conformance for every result; SimulatedGateway is verified as the *only* capture path and only when simulation is allowed. Written test-first: it went red on exactly the Tabby/Tamara capture/refund before the fix, green after. Full `@ayvana/payments` suite **21/21** (9 fail-closed + 12 contract), `tsc` clean.
- **Residual / honest notes:** real Tabby/Tamara/Stripe live capture remains **UNVERIFIED** (no keys) — the contract tests pin the *interface + fail-closed* behavior, not a live charge. A latent config naming mismatch (`hasTamara()` reads `TAMARA_API_KEY` while the real token is `TAMARA_API_TOKEN`) is left untouched: now that Tamara fails closed regardless, it is not a safety issue, and renaming an operator-facing env var is out of scope here.

---

## Sprint status

- **Sprint 1 (financial release blockers):** V2-001 payment fail-closed ✅ (PR #46). V2-002 transitive CVEs ✅ (PR #47). Inventory reservation lifecycle + production config validation: assessed — the atomic `reserveStockTx` + release + order-state machine from V1 already cover the core invariants with tests; a full persistent `InventoryReservation` entity with expiry is a larger, separately-scoped change (tracked, not yet implemented).
- **Sprint 2 (ledger completion — Track A):** ✅ `reconcileWallet` + `reconcileAllWallets` wallet ledger audit (PR #48, 5 tests) + admin customer-detail "Wallet integrity" surface (PR #49). Source-verified that the recon's payout-idempotency and checkout-"money-dangling" findings were **non-issues** (payouts guarded by `assertPayoutTransition` + `FOR UPDATE`; wallet debit atomic with order create) and correctly skipped. **Track B (migrations baseline):** deferred pending a `prisma db push`-vs-migration-files convention decision.
- **Sprint 3 (provider contract tests):** ✅ V2-003 BNPL fake-capture fixed + `contract.test.ts` (12 tests) enforcing no scaffold ever fake-captures.
- Sprints 4–6 (broader coverage, outbox/observability, DR/preflight): not yet started — multi-session scope; each with real test evidence, no premature completion claims.
