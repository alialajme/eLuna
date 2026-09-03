# e-Luna — Production Readiness Checklist

Status as of the hardening effort (PRs #1–#4 delivered; docs on this branch). No item is marked PASS
without evidence in the repo. Legend: ✅ PASS · 🟡 PARTIAL · ❌ FAIL/NOT DONE.

| Area | Status | Evidence / Notes |
|------|:------:|------------------|
| **Architecture** | ✅ | Modular monolith, domain logic in `@e-luna/db`; ADRs in `docs/adr`; diagrams in `docs/architecture` |
| **Security — authz** | ✅ | Role + ownership re-checked in every server action; audit found no HPE |
| **Security — headers** | 🟡 | HSTS/nosniff/frame-ancestors/Referrer/Permissions on all apps; CSP has no `script-src` yet |
| **Security — rate limiting** | 🟡 | In-memory limiter on AI endpoints; Redis-backed + WAF outstanding |
| **Security — secrets** | ✅ | Key Vault CSI + workload identity; gitleaks; redaction in logger/audit |
| **Security — scanning** | 🟡 | CodeQL (SAST) + Trivy (deps/secrets + IaC misconfig) configured in `security.yml`; gitleaks for secrets. First-run results pending triage; live image scan still at build time |
| **IAM / auth** | ✅ | Clerk per-app; roles from trusted claims; MFA policy; admin defense-in-depth |
| **Payment integrity** | ✅ | Fail-closed gateway; server-side allowlist; idempotent webhook; order-first card flow |
| **Wallet integrity** | ✅ | Atomic guarded debit + immutable ledger; double-spend proven prevented |
| **Inventory integrity** | ✅ | Atomic reservation; oversell proven prevented; release on failure |
| **Orders** | ✅ | Explicit order/payment state policies; COD stays PENDING until collected |
| **Refunds/returns** | 🟡 | Bounded to captured, commission split, gated on CAPTURED; full E2E test deferred |
| **Payouts** | ✅ | Race-safe (`FOR UPDATE`), reserved-aware Decimal balance, terminal transitions, audited |
| **Financial ledger** | 🟡 | Immutable ledger for movements; SALE/COMMISSION accrual (authoritative balance) deferred |
| **Integrations** | ✅ | All credential-gated & fail-closed (payments/courier/einvoice); Simulated fallbacks non-prod-only |
| **Database** | 🟡 | Decimal money, FKs, `Restrict` on financial rows, indexes; schema applied via `db push` — a migration history/Job is a follow-up |
| **Infrastructure** | 🟡 | AKS Helm (4 apps, securityContext, HPA/PDB), Key Vault, Zone-redundant PG; Front Door/WAF + backup config outstanding |
| **CI/CD** | 🟡 | Install/lint/typecheck/tests(+coverage)/gitleaks/deploy-parity + CodeQL & Trivy (deps/IaC); still missing a production `next build` gate and live image scan |
| **Observability** | 🟡 | Structured logger + correlation IDs; adopted in checkout/webhook; broad rollout + OTel/App Insights export outstanding |
| **Health/readiness** | ✅ | Split `/api/health/{live,ready}` (DB-checked) on all apps; wired to probes |
| **Testing** | 🟡 | 75 unit/integration tests incl. real-DB concurrency proofs; **no app/E2E tests; global 90% target not met** |
| **Performance** | ❌ | No load/perf tests or baselines captured yet |
| **Disaster recovery** | 🟡 | Zone-redundant HA + default PITR; explicit backup retention/geo + tested restore drill outstanding (see DR doc) |
| **Documentation** | ✅ | Architecture, ADRs, threat model, DR, this checklist, hardening log, final review |

## Blocking for production (must fix)
1. 🟡 CI security scanning — CodeQL + Trivy now configured (`security.yml`); triage the first run and
   remediate CRITICAL/HIGH, and add a live container-image scan at build time.
2. 🟡 DR: set explicit backup retention + geo-redundant backup; run a restore drill.
3. 🟡 Rate limiting: Redis-backed limiter + WAF for multi-replica.
4. 🟡 DB: introduce migration history + a dedicated migration Job (stop relying on `db push` in prod).

## Strongly recommended before scale
- App/E2E test coverage (Playwright) for the critical journeys; drive coverage toward target.
- Nonce-based CSP `script-src`; finalize upload validation.
- Outbox dispatcher process + real consumers; broaden structured-logging adoption + OTel export.
- Capture performance baselines for browse/checkout/dashboards.
