# Supplier S1 — Foundation Design

**Status:** Approved (brainstorming) — 2026-08-10
**Phase:** Supplier S1 (first of a 3-phase Supplier build: S1 Foundation → S2 Materials Catalog → S3 Sourcing & Orders)

## Goal

Introduce the **Supplier** persona — a materials/fabric supplier that serves Vendors — as a
fourth, separately-authenticated persona in e-Luna. S1 delivers only the foundation: the
`SUPPLIER` role, a `Supplier` profile, a dedicated `supply.luna.ae` app (its own login,
onboarding, and dashboard shell), and admin approval. No materials catalog, no vendor sourcing,
no material orders — those are S2 and S3.

**Success criteria:** a person can sign up on the supplier app, complete onboarding (creating a
`Supplier` with `status = PENDING`), see an "under review" dashboard, and — after an admin
approves them in the ops console — see the (placeholder) supplier dashboard. Non-suppliers are
blocked from the app by the role gate.

## Context & Rationale

- e-Luna already runs three separate, role-gated Next.js apps on separate domains
  (`customer` / `vendor` / `admin`). The user explicitly wants persona logins kept **separate for
  security** ("like Amazon"). A supplier is therefore a **new app**, not a section of an existing one.
- The existing **Vendor** is Amazon's "Seller Central" equivalent (sells finished abayas to
  customers). The **Supplier** is the upstream **materials** layer (sells fabric/trim wholesale to
  vendors). This keeps Luna from becoming a first-party retailer that competes with its own vendors.
- S1 reuses the vendor onboarding + admin approval machinery almost verbatim, so it is low-risk.

## Non-Goals (deferred)

- **S2:** `Material` model + supplier catalog CRUD (list fabrics/trims with stock, wholesale price, images).
- **S3:** vendor "Sourcing" browse + `MaterialOrder` + supplier fulfillment + supplier payouts.
- Supplier analytics, a Supplier AI agent — later phases.
- `commissionRate` on `Supplier` — suppliers sell wholesale to vendors (not a marketplace-commission
  model), so pricing lands in S3, not here.

## Architecture

A new app `apps/supplier` (domain `supply.luna.ae`) is a structural clone of `apps/vendor`, stripped
to the foundation: sign-in, onboarding, and a dashboard shell. Authentication is
`createLunaMiddleware("SUPPLIER")` — the same session-claim `role` gate plus mandatory MFA the other
apps use — so it is a genuinely separate portal, not a shared login. Admins approve suppliers from a
new `suppliers/approvals` section in the existing admin console that mirrors `sellers/approvals`.

## Data Model (Prisma — repo uses `prisma db push`, NO migration files)

All changes in `packages/db/prisma/schema.prisma`:

1. **`enum UserRole`** — add `SUPPLIER`:
   ```prisma
   enum UserRole {
     CUSTOMER
     VENDOR
     ADMIN
     SUPPLIER
   }
   ```

2. **New `enum SupplierStatus`** (clone of `VendorStatus`):
   ```prisma
   enum SupplierStatus {
     PENDING
     ACTIVE
     SUSPENDED
     REJECTED
   }
   ```

3. **New `model Supplier`** (mirrors `Vendor`; note the differences called out below):
   ```prisma
   model Supplier {
     id            String         @id @default(cuid())
     userId        String         @unique
     companyName   String
     companySlug   String         @unique
     description   String?
     logoUrl       String?
     bannerUrl     String?
     status        SupplierStatus @default(PENDING)
     materialTypes String[]       // e.g. ["fabric","trim","lining"] — captured at onboarding, used by S2
     ibanNumber    String?
     mfaVerifiedAt DateTime?
     createdAt     DateTime       @default(now())
     updatedAt     DateTime       @updatedAt

     user User @relation(fields: [userId], references: [id], onDelete: Cascade)

     @@index([status])
   }
   ```
   Differences vs `Vendor`: `companyName`/`companySlug` (not `storeName`/`storeSlug`);
   adds `materialTypes String[]`; **no `commissionRate`** (wholesale model, deferred to S3).

4. **`model User`** — add the back-relation `supplier Supplier?` alongside the existing `vendor` relation.

Regenerate the client offline: `pnpm --filter @e-luna/db db:generate`. `prisma db push` applies the
schema to the local DB.

## Auth Package Changes (`packages/auth`)

- `src/roles.ts`: add `"SUPPLIER"` to the `UserRole` union and a `SUPPLIER` entry in `ROLES`; add
  `supplierId?: string` to `ClerkSessionClaims.metadata`.
- `src/middleware.ts`: **no code change required** — `createLunaMiddleware(appRole)` already handles any
  `UserRole` value (non-customer branch: public routes = sign-in/sign-up/webhooks/health, role gate,
  mandatory MFA). Confirm `"SUPPLIER"` flows through unchanged.

## New App — `apps/supplier`

Clone `apps/vendor` structure, stripped to foundation. Files:

- **`package.json`** — name `@e-luna/supplier` (or match vendor's naming), same deps/scripts as
  `apps/vendor`, dev port `3003` (customer 3000 / vendor 3001 / admin 3002 by convention; supplier 3003).
- **`middleware.ts`** — `createLunaMiddleware("SUPPLIER")` wrapped in the **same no-Clerk-keys dev
  fallback** the other apps use: `const hasClerkKeys = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;`
  prod-without-keys throws; when no keys, dev returns `NextResponse.next()` and prod returns
  `new NextResponse("Auth not configured", { status: 503 })`. Same matcher as vendor.
- **`app/layout.tsx`**, **`app/globals.css`**, **`next.config`**, **`tsconfig`**, **`tailwind`** — clone vendor,
  Warm Oud tokens. (`sage` is the admin accent; supplier keeps the default vendor palette.)
- **`app/(auth)/sign-in/[[...sign-in]]/page.tsx`** — clone vendor sign-in.
- **`app/(auth)/onboarding/page.tsx`** + **`OnboardingWizard.tsx`** — company name + slug + a
  material-types multiselect (fabric / trim / lining / thread / hardware — a fixed constant list);
  calls `createSupplier`.
- **`app/actions/supplier.ts`** — `createSupplier(name, slug, materialTypes)`: exact shape of
  `createVendor` — `safeCurrentUser()` guard, trim + validate (`name` 2–60 chars;
  `slug` `/^[a-z0-9-]{3,40}$/`; `materialTypes` non-empty subset of the allowed list), uniqueness check on
  `companySlug`, `prisma.user.upsert({ role: "SUPPLIER" })`, `prisma.supplier.create({ status: "PENDING" })`,
  P2002 handling.
- **`app/(dashboard)/layout.tsx`** — sidebar shell (nav placeholders only) + supplier lookup by userId.
- **`app/(dashboard)/page.tsx`** — status-gated home:
  - no `Supplier` row for this user → redirect to `/onboarding`;
  - `status = PENDING` → "Your supplier account is under review" state;
  - `status = ACTIVE` → dashboard home with placeholder cards: **"Materials — coming soon"** and
    **"Incoming Orders — coming soon"** (the S2/S3 seams);
  - `status = SUSPENDED`/`REJECTED` → a corresponding blocked message.
- **`app/lib/auth.ts`** + **`app/lib/supplier.ts`** — clone vendor's `safeCurrentUser` helper and add
  `getSupplierByUserId(userId)`.

## Admin Console Changes (`apps/admin`)

- **`app/(dashboard)/suppliers/approvals/page.tsx`** — clone `sellers/approvals/page.tsx`: list
  `prisma.supplier.findMany({ where: { status: "PENDING" } })`, render each with a `SupplierActions`.
- **`app/(dashboard)/components/SupplierActions.tsx`** — clone `VendorActions`: approve / reject / suspend
  buttons calling server actions that set `Supplier.status` (`ACTIVE` / `REJECTED` / `SUSPENDED`) and
  `revalidatePath`. Ownership/authorization: admin-only (already gated by the admin app's role).
- Add a **"Suppliers"** nav entry to the admin dashboard nav (alongside "Sellers").

## Environment

No new secrets. Supplier app reuses `DATABASE_URL` and Clerk env vars. Add a note in `.env.example`
that, in production, the supplier app should use its **own Clerk instance keys** (separate login domain),
consistent with the separate-portal security model. Local dev runs it keyless (dev fallback) or with the
shared test keys.

## Data Flow

1. Supplier visits `supply.luna.ae`, signs in (Clerk), hits `/onboarding`.
2. `createSupplier` upserts `User.role = "SUPPLIER"` and creates `Supplier(status = PENDING)`.
3. Dashboard shows "under review".
4. Admin opens ops console → **Suppliers → Approvals**, approves → `status = ACTIVE`.
5. Supplier now sees the placeholder dashboard (S2/S3 seams).

Identical lifecycle to vendors.

## Error Handling

- Server actions return `{ success: boolean; error?: string }` (repo convention); DB reads use
  `.catch(() => fallback)`; slug collision → P2002 → friendly "that URL is already taken".
- Not signed in → middleware redirect to `/sign-in`; wrong role → redirect with `error=invalid_role`.
- No supplier row → dashboard redirects to `/onboarding`.

## Testing

No automated suite in this repo. Verification = types + lint + manual:

1. `pnpm --filter @e-luna/db db:generate` (regenerate client with `Supplier`/`SupplierStatus`).
2. `pnpm --filter "@e-luna/*" exec tsc --noEmit` — clean, including the new app.
3. `pnpm lint` — clean.
4. gitleaks — clean.
5. Manual: onboarding creates a `PENDING` supplier; admin approval flips it to `ACTIVE`; the role gate
   blocks a non-supplier (e.g. a vendor) from `supply.luna.ae`.
