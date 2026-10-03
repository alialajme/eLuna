# AI Fashion Studio — Phase 4 (Monetization) + Phase 5 (Admin Dashboard)

Branch: `feature/ai-studio-monetization-admin` off `feature/ai-studio-phase-1`.
ADR: `docs/ai-studio/2026-10-01-ai-fashion-studio-phase-0-adr.md` (§11 schema, §12 APIs, §15 credit flow, §25 admin, §26 seller).

## Key decision: vendor-keyed, not AIStudioSeller
Phase 1 shipped `GenerationSession.vendorId` directly (no `AIStudioSeller` layer). We follow that: `CreditWallet.vendorId`, `StudioSubscription.vendorId`, `CreditTransaction.walletId`, etc. The ADR's `AIStudioSeller` was "a thin mapping over Vendor" — eliding it is consistent with shipped code and simpler.

## The monetization model (all values config-in-DB, admin-editable)
- Plans (AED/month, included shoots): TRY 49/2, BOUTIQUE 199/10, PROFESSIONAL 499/30, BRAND 999/75, ENTERPRISE 2499/250.
- Credit packs (overage, AED): 1=25, 10=199, 50=799, 100=1399.
- Unit = "AI Shoot". Subscription grants `includedShoots` to wallet.available on activation/renewal. Packs grant on paid webhook.

## Credit flow (reserve → consume/release), §15
- `reserveCredit(vendorId, shoots, idemKey)`: `$transaction` + `SELECT … FOR UPDATE` on CreditWallet row; if available < shoots → INSUFFICIENT_CREDITS; else available−=, reserved+=, append RESERVE txn. Idempotent via unique idempotencyKey.
- `consumeCredit(vendorId, sessionId)`: FOR UPDATE; reserved−=, lifetimeConsumed+=; append CONSUME (idemKey `consume:${sessionId}`). On COMPLETED/approved.
- `releaseCredit(vendorId, sessionId)`: FOR UPDATE; reserved−=, available+=; append RELEASE (idemKey `release:${sessionId}`). On FAILED/CANCELLED platform error.
- `grantCredit(vendorId, shoots, type, ref, idemKey)`: FOR UPDATE; available+=; append GRANT/PURCHASE. Idempotent (webhook-safe).

## Wiring into the Phase 1 engine
- `startGeneration` (start.ts): reserve 1 shoot inside the existing `$transaction` (same tx as session+job+outbox). Store `creditTxnId` on the job. If reserve fails → return INSUFFICIENT_CREDITS (no session/job). Feature-gate already present.
- `pipeline.ts`: on COMPLETED → consumeCredit; on FAILED/platform → releaseCredit. Record GenerationCost (simulated constants) + ProviderUsage.
- Concurrency-safe by the FOR UPDATE row lock + unique idemKeys (two concurrent generations serialize; duplicate request dedupes by job idemKey already).

## Steps
1. Schema (`db push` to eluna + ayvana_test): SubscriptionPlan, StudioSubscription, CreditWallet, CreditTransaction, CreditPackage, StudioPayment, StudioInvoice, GenerationCost, ProviderUsage + enums. Vendor back-relations.
2. `packages/db/src/studio-credits.ts` — reserve/consume/release/grant + computeWallet (FOR UPDATE, Decimal, idempotent).
3. `packages/db/src/studio-billing.ts` — plan/pack config helpers + seed defaults + ensureWallet/subscription read + cost recording + margin aggregation for admin.
4. Wire credits into `@ayvana/studio` start.ts + pipeline.ts (+ cost capture).
5. `@ayvana/payments` subscribe + pack purchase via SimulatedGateway + webhook idempotent grant.
6. Vendor billing: actions/studio-billing.ts + /studio/billing page + launcher "N shoots left" + empty-prompt.
7. Admin: /ai-studio dashboard (SVG charts, PeriodToggle), /ai-studio/plans + /packages edit, /ai-studio/review queue. actions/ai-studio.ts ADMIN-gated. Sidebar "✨ AI Studio".
8. Tests (§31): concurrent double-spend; failure releases; duplicate webhook no double-credit; duplicate gen request no double-charge; subscription expiry entitlements; cross-vendor wallet isolation.
9. Verify tsc + lint (vendor+admin) + tests + gitleaks. Commit incrementally. Push + PR.
