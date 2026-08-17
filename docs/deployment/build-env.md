# Build-time Environment Variables

A production build (`pnpm build` → `next build` per app) does more than compile: Next.js **collects route
page-data** and **statically prerenders** pages. Both steps execute app/module code, so some environment
variables must be present **at build time**, not just at runtime. Without them the build fails *after*
`✓ Compiled successfully` — during "collect page data" or "Generating static pages".

This is expected: the code compiles, type-checks (`tsc --noEmit`), and lints clean regardless; these vars are
deployment secrets, not code. Set them in your CI/CD (GitHub Actions, Vercel, Azure) build environment.

## Required per app

| Variable | customer | vendor | supplier | admin | Why (build-time) |
|---|:---:|:---:|:---:|:---:|---|
| `ANTHROPIC_API_KEY` | ✅ | ✅ | ✅ | — | `@e-luna/ai` `config.ts` **throws at import** if unset; the AI-agent routes (`/api/assistant`, `/api/ai-history`, `/api/chat`, `/api/*-help`) import it, so page-data collection fails. Admin has no `@e-luna/ai` dependency. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | ✅ | ✅ | ✅ | ✅ | Clerk requires it "in production"; **inlined at build** (`NEXT_PUBLIC_`) and read while prerendering Clerk-wrapped pages (e.g. customer `/profile/size`, `/`). Must be a real, valid key — a malformed dummy fails inside Clerk's SSG init. |
| `CLERK_SECRET_KEY` | ✅ | ✅ | ✅ | ✅ | Clerk server SDK init for any prerendered/collected route that calls `auth()`/`currentUser()`. |
| `DATABASE_URL` | ✅ | ✅ | ✅ | ✅ | `@e-luna/db` Prisma client + any page/route that reads the DB during prerender/collection. Point it at a reachable Postgres (a build-time replica is fine). |

> Each app uses its **own** Clerk instance in production (separate publishable/secret keys per app — see the
> persona-separation note in the root `.env.example`). Supplier/vendor/admin have no `.env.local` in the repo;
> supply these via the CI/CD environment.

## Optional at build (unset → graceful fallback, no build failure)

These gate real integrations; unset, the code uses a Simulated/scaffold path and the build still succeeds:

- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` — Stripe card + Apple/Google Pay (else Simulated capture).
- `NEOPAY_API_KEY` / `NEOPAY_MERCHANT_ID` — NeoPay checkout (`neopayAvailable()`; see `payments.md`).
- `TAP_SECRET_KEY`, `NOQODI_API_KEY` — unsurfaced payment scaffolds.
- `ARAMEX_API_KEY` / `ARAMEX_*`, `DHL_API_KEY` / `DHL_*` — courier gateways (else manual tracking; see `couriers.md`).
- `FTA_ACCESS_POINT_URL` / `FTA_API_KEY` — e-invoicing transmission (else local Simulated issuer; see `einvoicing.md`).

## Verifying a build locally without real secrets

- **Compile + types + lint (no secrets needed):** `pnpm --filter "@e-luna/*" exec tsc --noEmit` and `pnpm lint`
  — these fully validate the code and are the CI gates that catch regressions.
- **Full `next build`:** provide the four required vars above (a build-time DB replica + the app's real Clerk
  keys + an Anthropic key). `admin`, `supplier`, and `vendor` complete a full static build with just
  `ANTHROPIC_API_KEY` + Clerk + `DATABASE_URL`; the `customer` app additionally prerenders Clerk pages, so it
  needs a **valid** (not placeholder) `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`.

> Turbo sandboxes task env by default (strict mode). If you export vars in the parent shell for a one-off
> local build, pass them through with `turbo build --env-mode=loose`, or put them in each app's `.env.local`.
