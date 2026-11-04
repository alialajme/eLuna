# AYVANA end-to-end tests

Playwright specs for the critical path of each app. Run against already-running apps:

```bash
pnpm --filter @ayvana/db db:seed          # seed products/users
# start each app (customer :3000, vendor :3001, admin :3002, supplier :3003)
E2E_BASE_URL=http://localhost:3000 pnpm test:e2e
```

## Coverage matrix

| App | Spec | Auth | Status |
|-----|------|------|--------|
| Customer storefront | `customer-critical-path.spec.ts` — home → browse → product → add-to-bag; health endpoints | none (guest) | runnable without auth |
| Vendor OS | `authenticated-apps.spec.ts` — products + new-product form | Clerk | **skips** without a test Clerk instance |
| Admin console | `authenticated-apps.spec.ts` — seller-approvals queue | Clerk | **skips** without a test Clerk instance |
| Supplier OS | `authenticated-apps.spec.ts` — incoming orders | Clerk | **skips** without a test Clerk instance |

## The auth blocker (why 3 of 4 skip)

Vendor/admin/supplier require a signed-in Clerk session. We **never** ship the local
dev auth-bypass shim into committed tests. To run the authenticated matrix, CI must
provide a **dedicated test Clerk instance** and a per-role seeded user via env:

- `AYVANA_E2E_CLERK_SECRET_KEY`, `AYVANA_E2E_CLERK_PUBLISHABLE_KEY`
- `E2E_VENDOR_BASE_URL`, `E2E_ADMIN_BASE_URL`, `E2E_SUPPLIER_BASE_URL`
- a `signInAs(page, role)` helper using Clerk's testing token (`@clerk/testing`)

Until that exists, those specs `test.skip` with the reason inline — so the suite is
honest about what it did and did not exercise.

## Environment note

In the current offline-constrained dev sandbox the customer home route makes an
outbound `next/font` (Google Fonts) fetch that is reset (`ECONNRESET`), so the live
run was **not executed here**. In CI / a networked environment (fonts reachable) the
customer spec runs normally. See `PRODUCTION-GO-LIVE-CHECKLIST.md` (blocker B5).
