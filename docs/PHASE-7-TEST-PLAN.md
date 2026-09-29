# e-Luna — Phase 7 Test Plan (E2E + coverage to target)

Plan to take automated testing from the current **75 unit/integration tests** (financial/domain core)
to the master-prompt targets: **≥90% statements/lines/functions, ≥85% branches globally**, and
**≥95% on critical financial/domain modules**, with meaningful **E2E, concurrency, authorization and
failure-path** coverage — not tests written only to move the percentage.

This is a plan; execution requires a runnable environment (test Postgres + a test-auth path + the
apps building). Effort estimates assume one engineer.

---

## 1. Current baseline (what exists)

| Layer | State |
|-------|-------|
| Unit | ✅ money, order/payment/payout state policy, error taxonomy, resilience, rate limiter |
| Integration (real Postgres) | ✅ inventory reservation, wallet, ledger, payouts, outbox, audit log — incl. **concurrency proofs** (oversell, double-spend, double-payout, outbox double-processing) |
| Contract (provider adapters) | ❌ none (Stripe/courier/FTA adapters untested at the boundary) |
| Component (React) | ❌ none |
| E2E (browser) | ❌ none |
| App server actions (as wired) | 🟡 core logic tested via extracted `@e-luna/db` services; the action wrappers themselves untested |
| Coverage gating | 🟡 thresholds enforced on critical `@e-luna/db` modules only; **no global measurement** |

**Gap to close:** the four apps are essentially untested at the UI/route/action-wrapper layer, there
is no browser-level journey coverage, and coverage isn't measured across the repo.

---

## 2. Test pyramid & tooling

```
        E2E (Playwright)            few, high-value journeys per persona
     Integration (vitest + PG)      services, actions, webhooks, concurrency  ← widen here
   Contract (vitest + MSW/nock)     provider adapters at the network boundary  ← add
  Unit (vitest)                     pure logic, everywhere                      ← widen
```

- **Unit / integration / contract:** vitest (already standardized). Keep the real-Postgres pattern
  for anything transactional; **mock only the external network boundary**, never internal logic.
- **Contract:** `msw` (or `nock`) to stub Stripe/courier/FTA HTTP at the wire; assert our adapters
  build correct requests and map responses/errors (incl. timeouts → `withTimeout`, retries →
  `withRetry`).
- **Component:** `@testing-library/react` + vitest (`jsdom`) for interactive islands (forms,
  `LunaChatWidget`, pickers). RSC/server components are covered mainly via E2E.
- **E2E:** `@playwright/test` driving the built apps against a seeded test DB.

---

## 3. The hard parts (design decisions)

### 3.1 Authentication in tests — the critical enabler
Clerk gates every app. Two supported approaches; **recommend a sanctioned test-auth seam** as primary:

- **Primary — env-gated test auth provider.** Formalize the throwaway demo-shim idea into a
  *committed, test-only* seam: `getAuthUser()` consults an injectable auth provider; in `NODE_ENV=test`
  (and only then) a header/cookie (`x-test-persona: {role,userId,vendorId,...}` signed with a
  test-only secret) resolves the persona. **Fail-closed in production** (the provider is the real
  Clerk one unless `NODE_ENV==="test"` AND the secret is set) — mirror the existing payments
  fail-closed pattern, and add a unit test proving the test path is inert in prod. This gives fast,
  deterministic, per-persona E2E without a live Clerk.
- **Alternative — `@clerk/testing`.** Higher fidelity (real Clerk flows via testing tokens +
  `setupClerkTestingToken`) against a dedicated Clerk *test* instance with seeded test users. Use
  for a small "auth flows" suite (sign-in, MFA gating) where testing the real provider matters.

Decision: primary seam for journey coverage (speed + determinism); `@clerk/testing` for a thin
auth-fidelity suite.

### 3.2 Database & seeding
- Reuse the `eluna_test` pattern; each E2E run gets a **freshly migrated + seeded** DB (or a
  transactional/`TRUNCATE`-between-specs reset). Add a deterministic `prisma/seed.e2e.ts` producing:
  active vendors/suppliers with IBAN + TRN, published products with known stock, a customer with a
  known wallet balance and address, and an admin. Seed IDs are stable so specs assert on them.
- Money/stock assertions read the DB directly (source of truth), not just the UI.

### 3.3 Running the apps
- E2E builds each app (`next build`) and starts it (Playwright `webServer`) with test env
  (`DATABASE_URL=eluna_test`, test-auth secret, Simulated payment/courier gateways — which are already
  the no-credential default, so no real Stripe/Aramex calls). Card checkout uses the Simulated
  gateway's synchronous-capture path.

### 3.4 Coverage measurement
- Turn on vitest coverage per package **and per app** (v8 provider), merge reports, and gate globally
  in CI. Keep the stricter per-file thresholds on `@e-luna/db` financial modules (already at 90–95%).
- E2E does not contribute to line coverage; it is gated separately by "all critical journeys green".

---

## 4. E2E journeys (acceptance-level)

Each journey asserts **both** UI outcome and DB state; money/stock invariants checked in DB.

### Customer
| Journey | Key assertions |
|---------|----------------|
| Browse → product detail → add to cart | cart cookie reflects item; price from DB |
| Card checkout (Simulated) | order CONFIRMED, payment CAPTURED, stock decremented, cart cleared |
| Wallet checkout | wallet debited exactly once + `WalletTransaction` row; insufficient funds → friendly error, no order |
| COD checkout | order CONFIRMED but payment **PENDING** |
| Out-of-stock at checkout | reservation fails → friendly error, no order, stock unchanged |
| Order tracking | shipment/status shown for the customer's own order only |
| Request return within window | return created; outside window → blocked |

### Vendor
| Journey | Key assertions |
|---------|----------------|
| Create/edit product + variant stock | persisted; only own products editable |
| Fulfil order → create shipment → mark delivered | item/order status transitions; order recompute |
| Approve → receive → refund a return | refund ≤ captured; ledger REFUND+COMMISSION; payment (PARTIALLY_)REFUNDED |
| Issue tax invoice | one invoice per (order,vendor); VAT-inclusive math |
| Request payout | uses server balance; second immediate request blocked (reserved) |

### Supplier
| Journey | Key assertions |
|---------|----------------|
| Create material; receive vendor order; accept (stock) → ship → complete | atomic accept; status lifecycle |
| Issue material tax invoice | numbering + VAT |
| Dropship: ship a customer order's dropship items | shipment created; supplier invisible to customer |

### Admin
| Journey | Key assertions |
|---------|----------------|
| Approve/suspend a vendor | status change **+ audit log** row |
| Create + complete a payout | payout terminal; **ledger PAYOUT** + audit row |
| Dashboards & lists load, ADMIN-gated | non-admin persona rejected |

### Authorization (horizontal privilege escalation) — must-have
Drive each mutating action with persona B's session against persona A's resource IDs and assert
**403 / no mutation** (Vendor↔Vendor, Customer↔Customer, Supplier↔Supplier, non-admin→admin). This
turns the manual audit in `THREAT-MODEL.md` into an automated regression guard.

---

## 5. Concurrency & failure suites (§40/§41)

**Already covered (integration):** last-item oversell, wallet double-spend, duplicate webhook
idempotency, concurrent payout, outbox double-processing.

**To add:**
- Concurrency: duplicate order submission (double-click), concurrent refund attempts on one return,
  duplicate invoice generation per (order,vendor)/order, duplicate shipment creation.
- Failure (contract-level with a stubbed boundary): provider timeout → `withTimeout`; provider 500 →
  `withRetry` bounded then surfaced as `PaymentProviderError`; malformed provider response; webhook
  delivered before redirect; webhook delivered twice; payment succeeds but client disconnects
  (reconciler recovers); DB transaction failure rolls back cleanly; courier/FTA unavailable →
  fail-closed; AI provider unavailable → endpoint degrades, unrelated features unaffected.

---

## 6. CI integration
- Extend the CI `test` job to run **all package + app unit/integration suites with merged coverage**
  and fail under the global thresholds.
- Add a separate **`e2e` job**: Postgres service → migrate + seed → build apps → `playwright test`
  (sharded). Upload the Playwright HTML report + traces on failure.
- Root scripts to add: `pnpm test:unit`, `pnpm test:integration`, `pnpm test:e2e`,
  `pnpm test:coverage`, and a `pnpm verify` that runs format+lint+typecheck+unit+integration+coverage
  +build (the master-prompt §55 target command).

---

## 7. Milestones & effort

| # | Milestone | Deliverable | Est. |
|---|-----------|-------------|------|
| 7.0 | Test-auth seam | committed env-gated persona provider + prod-inert unit test | 1–2 d |
| 7.1 | E2E harness | Playwright config, `webServer` per app, `seed.e2e.ts`, DB reset | 2–3 d |
| 7.2 | Customer journeys | the customer table above | 2–3 d |
| 7.3 | Vendor + Supplier journeys | those tables (incl. refund/payout/invoice/dropship) | 3–4 d |
| 7.4 | Admin + authorization suite | admin journeys + HPE matrix | 2 d |
| 7.5 | Contract + failure suites | provider adapters via MSW/nock; §41 failure cases | 3 d |
| 7.6 | Component tests | key interactive islands | 2–3 d |
| 7.7 | Coverage gating | merged coverage, global thresholds in CI, `pnpm verify` | 1–2 d |
| 7.8 | Widen unit/integration | fill gaps to hit 90%/95% honestly | 3–5 d |

**Total ≈ 3–4 focused weeks.** Sequence 7.0→7.1 first (they unblock everything).

---

## 8. Risks & mitigations
- **Clerk in tests** (highest risk) → the env-gated seam removes the live-Clerk dependency for
  journeys; keep a thin `@clerk/testing` suite for real auth fidelity. The seam MUST be proven inert
  in production (unit test + code review).
- **Flaky E2E** → seed deterministically, assert on DB state, avoid arbitrary waits (use Playwright
  web-first assertions), shard + retry-once in CI.
- **RSC/server-action coverage** → keep extracting logic into `@e-luna/db`/services (unit-testable);
  E2E covers the wired path; don't chase line coverage on framework glue.
- **Coverage gaming** → review that new tests assert behavior/invariants; keep the critical-module
  thresholds high and prefer failure/concurrency/authz cases over trivial ones.
- **CI time** → shard E2E, run the full suite on PR-to-main + nightly, a fast subset on feature PRs.

---

## 9. Definition of done
- Global coverage ≥ 90% stmts/lines/functions, ≥ 85% branches; critical financial/domain modules
  ≥ 95%, measured and gated in CI.
- All persona journeys + the HPE authorization matrix pass in E2E.
- The §40 concurrency and §41 failure suites pass.
- `pnpm verify` runs the full gate locally and in CI; E2E runs as its own CI job.
- `PRODUCTION-READINESS.md` "Testing" and "Performance" rows updated with measured numbers; the
  final review's Automated Testing score re-assessed against evidence.
