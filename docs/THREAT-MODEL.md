# AYVANA — Threat Model

Scope: the four Next.js apps, shared packages, PostgreSQL, and external integrations. Status reflects
the hardening delivered in PRs #1–#4 (see `docs/PRODUCTION-HARDENING.md`). Legend: ✅ mitigated ·
🟡 partial · ⬜ open/planned.

## Assets
Customer PII & addresses · order/payment records · wallet balances · vendor payout balances & IBANs ·
the financial & wallet ledgers · admin capabilities · AI credentials & provider secrets.

## Trust boundaries
Browser ↔ app (untrusted client) · app ↔ Clerk (identity) · app ↔ PostgreSQL · app ↔ payment/courier/
FTA/AI providers · inbound provider webhooks.

## Threats & mitigations

| Threat | Mitigation | Status |
|--------|-----------|--------|
| **Account takeover** | Clerk auth + mandatory MFA policy; roles only from trusted server session claims (`getAuthUser`), never client metadata | ✅ |
| **Horizontal privilege escalation** (Vendor A ↔ B, Customer A ↔ B, Supplier A ↔ B) | Every server action re-checks role AND resource ownership (`where:{id,vendorId}` / post-load owner check); full audit found no gaps across 26 actions | ✅ |
| **Admin capability abuse** | Admin actions re-verify `role==="ADMIN"` in the action body (not just middleware); immutable audit log for payout/vendor/refund actions | ✅ |
| **Payment fraud — fake capture** | Fail-closed gateway: Simulated adapter cannot capture in prod; checkout server-side allowlist (`providerAvailable`) | ✅ |
| **Wallet double-spend** | Atomic balance-guarded debit + immutable ledger; proven under concurrency | ✅ |
| **Inventory oversell (race)** | Atomic conditional stock decrement in the order transaction; proven stock=3/100 buyers → 3 sold | ✅ |
| **Payout fraud / double payout** | `SELECT … FOR UPDATE` serialized creation; balance subtracts in-flight payouts; terminal payout transitions; audit log | ✅ |
| **Over-refund** | Refund bounded ≤ captured item value; money-refund gated on CAPTURED; payment transition policy | ✅ |
| **Webhook spoofing / replay** | Stripe signature verification; idempotent `applyPaymentResult` (only PENDING orders transition) | ✅ |
| **Coupon/discount/price tampering** | All prices/totals/commission computed server-side from the DB; client values never trusted | ✅ |
| **DoS / abuse of expensive endpoints** | App-level rate limiting on AI endpoints (Redis-swappable); Azure WAF/Front Door as outer layer | 🟡 (Redis + WAF outstanding) |
| **AI prompt injection / tool abuse** | AI agents are advisory/read-only; tool scope (vendorId/supplierId/customerId) is closure-captured server-side, never an LLM parameter; deterministic services decide money/inventory | ✅ |
| **Malicious file upload** | Cloudinary-mediated uploads, vendor-gated | 🟡 (MIME/size/dimension validation to formalize) |
| **Secret leakage** | Key Vault CSI + workload identity; gitleaks in CI; secret/PII redaction in logger & audit log; no secrets in repo/images | ✅ |
| **SQL injection** | Prisma parameterized queries; the few `$queryRaw` uses are parameterized tagged templates | ✅ |
| **XSS** | React auto-escaping; CSP (`object-src 'none'`, `base-uri 'self'`); no `dangerouslySetInnerHTML` on untrusted data | 🟡 (nonce-based `script-src` CSP planned) |
| **Clickjacking** | `X-Frame-Options: DENY` + CSP `frame-ancestors 'none'` | ✅ |
| **CSRF** | Next.js Server Actions are same-origin/POST with framework protections; no cookie-auth cross-site form posts | ✅ |
| **Lost domain events** | Transactional outbox (event written in the state-change tx) | ✅ (dispatcher/consumers are follow-up) |
| **Dependency / supply-chain** | `pnpm-lock` frozen installs; gitleaks | ⬜ (SAST/CodeQL, dependency & container scanning not yet in CI) |
| **SSRF** | No user-supplied URLs are server-fetched in the hardened paths | 🟡 (audit image/URL inputs as features grow) |

## Highest residual risks
1. ⬜ **CI security scanning gaps** — no SAST, dependency-vulnerability, or container image scanning.
2. 🟡 **Rate limiting is in-memory** — per-instance only until a Redis-backed limiter + WAF land.
3. 🟡 **CSP has no `script-src`** — needs per-request nonce middleware.
4. 🟡 **Upload validation** — formalize MIME/size/dimension checks and metadata stripping.
