# Supplier S1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the **Supplier** persona (materials/fabric supplier serving vendors) as a fourth, separately-authenticated app — `SUPPLIER` role, `Supplier` profile, a `supply.luna.ae` app (own login + onboarding + dashboard shell), and admin approval. Foundation only; no catalog/sourcing/orders.

**Architecture:** A new Next.js app `apps/supplier` is a structural clone of `apps/vendor`, stripped to sign-in + onboarding + a status-gated dashboard shell. Auth reuses the vendor app's hand-rolled `clerkMiddleware` pattern (signed-in check + public routes). Admins approve suppliers from a new `suppliers/approvals` section in the admin console that mirrors `sellers/approvals`.

**Tech Stack:** Turborepo + pnpm@9, Next.js 15 App Router (React 19), Prisma + PostgreSQL (`prisma db push`, NO migration files), Clerk auth, Tailwind (Warm Oud tokens via `@e-luna/config`).

**Spec:** `docs/superpowers/specs/2026-08-10-supplier-s1-foundation-design.md`

---

## Repo Conventions (read before starting)

- **No automated test suite exists.** Every prior phase verified with type-check + lint. So in this
  plan, each task's "test" step is: regenerate the Prisma client when the schema changed, then
  `tsc --noEmit` and `next lint` on the touched packages/apps. That is the repo's real quality gate.
- Prisma: edit `packages/db/prisma/schema.prisma`, then `pnpm --filter @e-luna/db db:generate`
  (regenerates client offline) and `pnpm --filter @e-luna/db db:push` (applies to local DB). The
  `@e-luna/db` barrel re-exports `prisma` and Prisma model/enum types.
- Server actions return `{ success: boolean; error?: string }` (onboarding) or
  `{ success: true } | { error: string }` (admin actions) — match the neighbouring file.
- DB reads use `.catch(() => fallback)`.
- Deviation from spec, intentional: the spec mentioned `createLunaMiddleware("SUPPLIER")` and a
  no-Clerk-keys dev fallback. The **actual** vendor app (the sibling this clones) uses a hand-rolled
  `clerkMiddleware` with no role-claim gate and no keyless fallback — persona separation is achieved
  by each app having its own Clerk instance. This plan clones the real vendor pattern for
  consistency. (Live sign-in on the supplier app therefore needs real Clerk keys, exactly like
  vendor/admin today.)

---

## File Structure

**`packages/db/prisma/schema.prisma`** (modify) — add `SUPPLIER` to `UserRole`, new `SupplierStatus`
enum, new `Supplier` model, `supplier Supplier?` back-relation on `User`.

**`packages/auth/src/roles.ts`** (modify) — `SUPPLIER` in `UserRole` union + `ROLES`; `supplierId?` in
`ClerkSessionClaims.metadata`.

**`apps/supplier/`** (create) — the new app:
- `package.json`, `next.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `vercel.json`,
  `next-env.d.ts`, `middleware.ts`
- `app/globals.css`, `app/layout.tsx`
- `app/lib/auth.ts`, `app/lib/supplier.ts`, `app/lib/slugify.ts`, `app/lib/materials.ts`
- `app/actions/supplier.ts`
- `app/(auth)/sign-in/[[...sign-in]]/page.tsx`
- `app/(auth)/onboarding/page.tsx`, `app/(auth)/onboarding/OnboardingWizard.tsx`
- `app/pending/page.tsx`
- `app/(dashboard)/layout.tsx`, `app/(dashboard)/page.tsx`, `app/(dashboard)/components/Sidebar.tsx`

**`apps/admin/`** (modify/create):
- `app/actions/suppliers.ts` (create)
- `app/(dashboard)/suppliers/approvals/page.tsx` (create)
- `app/(dashboard)/components/SupplierActions.tsx` (create)
- `app/(dashboard)/components/Sidebar.tsx` (modify — add Suppliers nav)

**`.env.example`** (modify) — note supplier app uses its own Clerk instance in prod.

---

### Task 1: Prisma schema — SUPPLIER role, Supplier model

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

- [ ] **Step 1: Add `SUPPLIER` to the `UserRole` enum**

Find:
```prisma
enum UserRole {
  CUSTOMER
  VENDOR
  ADMIN
}
```
Replace with:
```prisma
enum UserRole {
  CUSTOMER
  VENDOR
  ADMIN
  SUPPLIER
}
```

- [ ] **Step 2: Add the `SupplierStatus` enum**

Immediately after the `VendorStatus` enum block (which reads `enum VendorStatus { PENDING ACTIVE SUSPENDED REJECTED }`), add:
```prisma
enum SupplierStatus {
  PENDING
  ACTIVE
  SUSPENDED
  REJECTED
}
```

- [ ] **Step 3: Add the `Supplier` model**

Immediately after the closing `}` of the `Vendor` model (the block ending with `@@index([status])`), add:
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
  materialTypes String[]
  ibanNumber    String?
  mfaVerifiedAt DateTime?
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([status])
}
```

- [ ] **Step 4: Add the `supplier` back-relation on `User`**

In `model User`, find the vendor back-relation line (`vendor        Vendor?` — the exact field name/spacing may differ; look for the `Vendor?` relation) and add directly below it:
```prisma
  supplier      Supplier?
```
(If the existing relation is written `vendor Vendor?`, match that spacing: `supplier Supplier?`.)

- [ ] **Step 5: Regenerate the client and push the schema**

Run:
```bash
pnpm --filter @e-luna/db db:generate && pnpm --filter @e-luna/db db:push
```
Expected: generate succeeds; `db:push` prints "Your database is now in sync with your Prisma schema." (Requires local Postgres at `localhost:5432` per `.env`.)

- [ ] **Step 6: Verify the new types are exported**

Run:
```bash
cd /Users/alialajme/Projects/Luna/e-luna && node -e "const db=require('./packages/db'); console.log(Object.keys(db).includes('prisma'))"
```
Expected: prints `true`. (Confirms the client rebuilt. `SupplierStatus` is now a type in `@e-luna/db`.)

- [ ] **Step 7: Commit**

```bash
git add packages/db/prisma/schema.prisma
git commit -m "feat(db): add SUPPLIER role, SupplierStatus enum, Supplier model"
```

---

### Task 2: Auth package — SUPPLIER role type

**Files:**
- Modify: `packages/auth/src/roles.ts`

- [ ] **Step 1: Add SUPPLIER to the union, ROLES, and claims**

Replace the entire contents of `packages/auth/src/roles.ts` with:
```ts
export type UserRole = "CUSTOMER" | "VENDOR" | "ADMIN" | "SUPPLIER";

export const ROLES = {
  CUSTOMER: "CUSTOMER" as UserRole,
  VENDOR: "VENDOR" as UserRole,
  ADMIN: "ADMIN" as UserRole,
  SUPPLIER: "SUPPLIER" as UserRole,
} as const;

export type ClerkSessionClaims = {
  metadata: {
    role?: UserRole;
    mfaEnabled?: boolean;
    vendorId?: string;
    supplierId?: string;
  };
};
```

- [ ] **Step 2: Type-check the auth package**

Run:
```bash
pnpm --filter @e-luna/auth exec tsc --noEmit
```
Expected: no errors. (If `@e-luna/auth` has no `tsc` script path, run from the repo root: `pnpm exec tsc --noEmit -p packages/auth/tsconfig.json`.)

- [ ] **Step 3: Commit**

```bash
git add packages/auth/src/roles.ts
git commit -m "feat(auth): add SUPPLIER role to UserRole, ROLES, and session claims"
```

---

### Task 3: Supplier app scaffold (config + shell files)

**Files:**
- Create: `apps/supplier/package.json`
- Create: `apps/supplier/next.config.ts`
- Create: `apps/supplier/tsconfig.json`
- Create: `apps/supplier/tailwind.config.ts`
- Create: `apps/supplier/vercel.json`
- Create: `apps/supplier/next-env.d.ts`
- Create: `apps/supplier/app/globals.css`
- Create: `apps/supplier/app/layout.tsx`
- Create: `apps/supplier/app/lib/auth.ts`
- Create: `apps/supplier/app/lib/slugify.ts`

- [ ] **Step 1: `apps/supplier/package.json`**

```json
{
  "name": "@e-luna/supplier",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "next dev --port 3003",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "@clerk/nextjs": "^5.0.0",
    "@e-luna/ui": "workspace:*",
    "@e-luna/auth": "workspace:*",
    "@e-luna/db": "workspace:*",
    "next": "15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@e-luna/config": "workspace:*",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "typescript": "^5.4.0",
    "tailwindcss": "^3"
  }
}
```

- [ ] **Step 2: `apps/supplier/next.config.ts`**

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@e-luna/ui", "@e-luna/auth", "@e-luna/db"],
};

export default nextConfig;
```

- [ ] **Step 3: `apps/supplier/tsconfig.json`**

```json
{
  "extends": "@e-luna/config/tsconfig/nextjs",
  "compilerOptions": {
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: `apps/supplier/tailwind.config.ts`**

```ts
import type { Config } from "tailwindcss";
import { lunaPreset } from "@e-luna/config/tailwind";

const config: Config = {
  presets: [lunaPreset as Config],
  content: [
    "./app/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
};

export default config;
```

- [ ] **Step 5: `apps/supplier/vercel.json`**

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "cd ../.. && npx turbo build --filter=@e-luna/supplier",
  "installCommand": "cd ../.. && pnpm install",
  "outputDirectory": ".next",
  "framework": "nextjs"
}
```

- [ ] **Step 6: `apps/supplier/next-env.d.ts`**

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />

// NOTE: This file should not be edited
// see https://nextjs.org/docs/app/api-reference/config/typescript for more information.
```

- [ ] **Step 7: `apps/supplier/app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 8: `apps/supplier/app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import { Bodoni_Moda, Hanken_Grotesk, IBM_Plex_Sans_Arabic } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

const bodoni = Bodoni_Moda({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-bodoni",
  display: "swap",
});

const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-hanken",
  display: "swap",
});

const ibmArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "600"],
  variable: "--font-ibm-plex-arabic",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Luna Supplier — Materials OS",
  description: "Supply materials to Luna's boutiques",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" dir="ltr" className={`${bodoni.variable} ${hanken.variable} ${ibmArabic.variable}`}>
        <body className="bg-ivory font-sans text-ink antialiased">
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
```

- [ ] **Step 9: `apps/supplier/app/lib/auth.ts`**

```ts
import { currentUser } from "@clerk/nextjs/server";
import type { User } from "@clerk/nextjs/server";

export async function safeCurrentUser(): Promise<User | null> {
  try {
    return await currentUser();
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[safeCurrentUser]", err);
    }
    return null;
  }
}
```

- [ ] **Step 10: `apps/supplier/app/lib/slugify.ts`**

```ts
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}
```

- [ ] **Step 11: Install workspace deps so the new app links**

Run:
```bash
cd /Users/alialajme/Projects/Luna/e-luna && pnpm install
```
Expected: install completes; `apps/supplier/node_modules` now exists with workspace symlinks.

- [ ] **Step 12: Commit**

```bash
git add apps/supplier/package.json apps/supplier/next.config.ts apps/supplier/tsconfig.json apps/supplier/tailwind.config.ts apps/supplier/vercel.json apps/supplier/next-env.d.ts apps/supplier/app/globals.css apps/supplier/app/layout.tsx apps/supplier/app/lib/auth.ts apps/supplier/app/lib/slugify.ts pnpm-lock.yaml
git commit -m "feat(supplier): scaffold supply.luna.ae app shell and config"
```

---

### Task 4: Supplier data helpers + material types

**Files:**
- Create: `apps/supplier/app/lib/materials.ts`
- Create: `apps/supplier/app/lib/supplier.ts`

- [ ] **Step 1: `apps/supplier/app/lib/materials.ts`**

```ts
// The fixed set of material categories a supplier can offer. Used at onboarding
// (multiselect) and, later, by the S2 materials catalog.
export const MATERIAL_TYPES = [
  { value: "fabric", label: "Fabric" },
  { value: "trim", label: "Trim" },
  { value: "lining", label: "Lining" },
  { value: "thread", label: "Thread" },
  { value: "hardware", label: "Hardware (zips, buttons, clasps)" },
] as const;

export type MaterialType = (typeof MATERIAL_TYPES)[number]["value"];

const ALLOWED = new Set<string>(MATERIAL_TYPES.map((m) => m.value));

/** Returns the input filtered to valid, de-duplicated material-type values. */
export function sanitizeMaterialTypes(input: string[]): string[] {
  return [...new Set(input.filter((v) => ALLOWED.has(v)))];
}
```

- [ ] **Step 2: `apps/supplier/app/lib/supplier.ts`**

```ts
import { prisma } from "@e-luna/db";
import type { SupplierStatus } from "@e-luna/db";

export type SupplierWithStatus = {
  id: string;
  userId: string;
  companyName: string;
  companySlug: string;
  status: SupplierStatus;
  description: string | null;
  logoUrl: string | null;
  materialTypes: string[];
  ibanNumber: string | null;
};

export async function getSupplierByUserId(
  userId: string
): Promise<SupplierWithStatus | null> {
  return prisma.supplier
    .findUnique({
      where: { userId },
      select: {
        id: true,
        userId: true,
        companyName: true,
        companySlug: true,
        status: true,
        description: true,
        logoUrl: true,
        materialTypes: true,
        ibanNumber: true,
      },
    })
    .catch(() => null);
}
```

- [ ] **Step 3: Type-check**

Run:
```bash
pnpm --filter @e-luna/supplier exec tsc --noEmit
```
Expected: no errors (`SupplierStatus` resolves from `@e-luna/db`; `getSupplierByUserId` typed).

- [ ] **Step 4: Commit**

```bash
git add apps/supplier/app/lib/materials.ts apps/supplier/app/lib/supplier.ts
git commit -m "feat(supplier): add material-types constant and supplier lookup helper"
```

---

### Task 5: Onboarding server action

**Files:**
- Create: `apps/supplier/app/actions/supplier.ts`

- [ ] **Step 1: `apps/supplier/app/actions/supplier.ts`**

```ts
"use server";

import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../lib/auth";
import { sanitizeMaterialTypes } from "../lib/materials";

export async function createSupplier(
  name: string,
  slug: string,
  materialTypes: string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await safeCurrentUser();
    if (!user) return { success: false, error: "Not signed in" };

    const trimmedName = name.trim();
    const trimmedSlug = slug.trim().toLowerCase();
    const cleanTypes = sanitizeMaterialTypes(materialTypes);

    if (trimmedName.length < 2 || trimmedName.length > 60) {
      return { success: false, error: "Company name must be 2–60 characters" };
    }
    if (!/^[a-z0-9-]{3,40}$/.test(trimmedSlug)) {
      return { success: false, error: "Slug must be 3–40 lowercase letters, numbers, or hyphens" };
    }
    if (cleanTypes.length === 0) {
      return { success: false, error: "Select at least one material type" };
    }

    const existing = await prisma.supplier.findUnique({
      where: { companySlug: trimmedSlug },
      select: { id: true },
    });
    if (existing) {
      return { success: false, error: "That supplier URL is already taken" };
    }

    // Upsert User record with SUPPLIER role
    await prisma.user.upsert({
      where: { id: user.id },
      create: {
        id: user.id,
        email: user.emailAddresses[0]?.emailAddress ?? "",
        role: "SUPPLIER",
      },
      update: { role: "SUPPLIER" },
    });

    await prisma.supplier.create({
      data: {
        userId: user.id,
        companyName: trimmedName,
        companySlug: trimmedSlug,
        materialTypes: cleanTypes,
        status: "PENDING",
      },
    });

    return { success: true };
  } catch (err) {
    console.error("[createSupplier]", err);
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      return { success: false, error: "That supplier URL is already taken" };
    }
    return { success: false, error: "Something went wrong" };
  }
}
```

- [ ] **Step 2: Type-check**

Run:
```bash
pnpm --filter @e-luna/supplier exec tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/supplier/app/actions/supplier.ts
git commit -m "feat(supplier): add createSupplier onboarding action"
```

---

### Task 6: Sign-in, onboarding wizard, pending pages

**Files:**
- Create: `apps/supplier/app/(auth)/sign-in/[[...sign-in]]/page.tsx`
- Create: `apps/supplier/app/(auth)/onboarding/page.tsx`
- Create: `apps/supplier/app/(auth)/onboarding/OnboardingWizard.tsx`
- Create: `apps/supplier/app/pending/page.tsx`
- Create: `apps/supplier/middleware.ts`

- [ ] **Step 1: `apps/supplier/middleware.ts`**

```ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/onboarding(.*)",
  "/pending(.*)",
  "/api/webhooks(.*)",
  "/api/health",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return NextResponse.next();

  const { userId } = await auth();
  if (!userId) {
    const url = new URL("/sign-in", req.url);
    url.searchParams.set("redirect_url", req.url);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 2: `apps/supplier/app/(auth)/sign-in/[[...sign-in]]/page.tsx`**

```tsx
import { SignIn } from "@clerk/nextjs";

export default function SupplierSignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ink">
      <SignIn />
    </main>
  );
}
```

- [ ] **Step 3: `apps/supplier/app/(auth)/onboarding/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { Metadata } from "next";
import Link from "next/link";
import { safeCurrentUser } from "../../lib/auth";
import { getSupplierByUserId } from "../../lib/supplier";
import { OnboardingWizard } from "./OnboardingWizard";

export const metadata: Metadata = {
  title: "Set up your supplier account — Luna Supplier",
};

export default async function OnboardingPage() {
  const user = await safeCurrentUser();

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ink">
        <div className="text-center">
          <p className="font-display text-display-md text-gold mb-4">Luna Supplier OS</p>
          <Link
            href="/sign-in"
            className="inline-flex rounded-full bg-gold px-6 py-3 text-body-md font-medium text-ink"
          >
            Sign in to continue
          </Link>
        </div>
      </main>
    );
  }

  const supplier = await getSupplierByUserId(user.id);

  // Already onboarded — redirect based on status
  if (supplier?.status === "ACTIVE") redirect("/");
  if (supplier?.status === "PENDING") redirect("/pending");

  const userEmail = user.emailAddresses[0]?.emailAddress ?? "";

  return (
    <main className="min-h-screen bg-ivory">
      <div className="border-b border-sand px-6 py-4">
        <span className="font-display text-display-sm text-gold">✦ Luna</span>
        <span className="text-body-md text-mist ml-2">Supplier setup</span>
      </div>
      <OnboardingWizard userEmail={userEmail} />
    </main>
  );
}
```

- [ ] **Step 4: `apps/supplier/app/(auth)/onboarding/OnboardingWizard.tsx`**

A 2-step wizard: (1) company identity + material-type multiselect → `createSupplier`; (2) MFA guidance → finish. Modeled on the vendor wizard but trimmed to S1 scope.

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSupplier } from "../../actions/supplier";
import { slugify } from "../../lib/slugify";
import { MATERIAL_TYPES } from "../../lib/materials";

type Props = {
  userEmail: string;
};

const STEPS = ["Company details", "Secure your account"];

export function OnboardingWizard({ userEmail }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [types, setTypes] = useState<string[]>([]);

  function handleNameChange(val: string) {
    setName(val);
    if (!slug || slug === slugify(name)) {
      setSlug(slugify(val));
    }
  }

  function toggleType(value: string) {
    setTypes((prev) =>
      prev.includes(value) ? prev.filter((t) => t !== value) : [...prev, value]
    );
  }

  function handleStep1() {
    setError(null);
    startTransition(async () => {
      const result = await createSupplier(name, slug, types);
      if (!result.success) {
        setError(result.error ?? "Something went wrong");
        return;
      }
      setStep(2);
    });
  }

  function handleFinish() {
    router.push("/pending");
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      {/* Progress bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          {STEPS.map((label, i) => (
            <div key={label} className="flex flex-col items-center gap-1 flex-1">
              <div className={`h-2 w-full rounded-full ${i + 1 <= step ? "bg-gold" : "bg-sand"}`} />
              <span className={`text-body-xs hidden sm:block ${i + 1 === step ? "text-ink" : "text-mist"}`}>
                {label}
              </span>
            </div>
          ))}
        </div>
        <p className="text-body-sm text-mist">Step {step} of {STEPS.length}</p>
      </div>

      {/* Step 1 — Company details */}
      {step === 1 && (
        <div className="space-y-6">
          <div>
            <h1 className="font-display text-display-md text-ink">Tell us about your business</h1>
            <p className="text-body-md text-mist mt-1">Vendors will source materials from you on Luna.</p>
          </div>
          <div className="space-y-4">
            <div>
              <label htmlFor="company-name" className="text-label text-mist block mb-2">COMPANY NAME</label>
              <input
                id="company-name"
                type="text"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g. Gulf Textiles Trading"
                maxLength={60}
                className="w-full rounded-xl border border-sand px-4 py-3 text-body-md text-ink bg-ivory focus:outline-none focus:border-ink"
              />
            </div>
            <div>
              <label htmlFor="company-slug" className="text-label text-mist block mb-2">SUPPLIER URL</label>
              <div className="flex items-center rounded-xl border border-sand overflow-hidden">
                <span className="px-3 py-3 text-body-sm text-mist bg-sand/50 border-r border-sand">
                  supply.luna.ae/
                </span>
                <input
                  id="company-slug"
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  placeholder="gulf-textiles"
                  maxLength={40}
                  className="flex-1 px-3 py-3 text-body-md text-ink bg-ivory focus:outline-none"
                />
              </div>
              <p className="text-body-xs text-mist mt-1">Lowercase letters, numbers, and hyphens only</p>
            </div>
            <div>
              <span className="text-label text-mist block mb-2">WHAT DO YOU SUPPLY?</span>
              <div className="flex flex-wrap gap-2">
                {MATERIAL_TYPES.map((m) => {
                  const active = types.includes(m.value);
                  return (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => toggleType(m.value)}
                      className={`rounded-full border px-4 py-2 text-body-sm transition-colors ${
                        active
                          ? "border-ink bg-ink text-ivory"
                          : "border-sand text-mist hover:border-ink hover:text-ink"
                      }`}
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          {error && (
            <div className="rounded-xl bg-coral/10 border border-coral px-4 py-3 text-body-sm text-coral">
              {error}
            </div>
          )}
          <button
            type="button"
            onClick={handleStep1}
            disabled={isPending || !name.trim() || !slug.trim() || types.length === 0}
            className="w-full rounded-full bg-ink px-6 py-3 text-body-md font-medium text-ivory hover:bg-ink/90 transition-colors disabled:opacity-50"
          >
            {isPending ? "Creating…" : "Next →"}
          </button>
        </div>
      )}

      {/* Step 2 — MFA */}
      {step === 2 && (
        <div className="space-y-6">
          <div>
            <h1 className="font-display text-display-md text-ink">Secure your account</h1>
            <p className="text-body-md text-mist mt-1">
              Luna requires two-factor authentication for all suppliers to protect your business.
            </p>
          </div>
          <div className="rounded-2xl border border-sand bg-sand/30 p-5 space-y-3">
            <p className="text-body-md text-ink font-medium">How to enable MFA:</p>
            <ol className="list-decimal list-inside space-y-2 text-body-md text-mist">
              <li>Open your account settings from the dashboard once approved</li>
              <li>Choose Authenticator app or SMS</li>
              <li>Follow the steps to set it up</li>
            </ol>
          </div>
          <button
            type="button"
            onClick={handleFinish}
            className="w-full rounded-full bg-gold px-6 py-3 text-body-md font-medium text-ink hover:bg-gold/90 transition-colors"
          >
            Finish setup ✦
          </button>
          <p className="text-body-xs text-mist text-center">
            Submitted as {userEmail || "your account"}
          </p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: `apps/supplier/app/pending/page.tsx`**

```tsx
import { Metadata } from "next";
import { SignOutButton } from "@clerk/nextjs";
import { safeCurrentUser } from "../lib/auth";

export const metadata: Metadata = {
  title: "Application Under Review — Luna Supplier",
};

export default async function PendingPage() {
  const user = await safeCurrentUser();
  const email = user?.emailAddresses[0]?.emailAddress ?? "your email";

  return (
    <main className="flex min-h-screen flex-col bg-ivory">
      <div className="bg-ink px-6 py-4 flex items-center justify-between">
        <span className="font-display text-display-sm text-gold">✦ Luna</span>
        {user && (
          <SignOutButton>
            <button className="text-body-sm text-mist hover:text-ivory transition-colors">
              Sign out
            </button>
          </SignOutButton>
        )}
      </div>

      <div className="flex flex-1 items-center justify-center px-4">
        <div className="max-w-md text-center space-y-6">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gold/20">
            <span className="font-display text-display-lg text-gold">✦</span>
          </div>
          <div>
            <h1 className="font-display text-display-lg text-ink">
              Your supplier account is under review
            </h1>
            <p className="mt-3 text-body-md text-mist">
              Our team reviews every supplier application within{" "}
              <strong className="text-ink">2–3 business days</strong>. You&apos;ll
              receive an email at <strong className="text-ink">{email}</strong> once
              you&apos;re approved.
            </p>
          </div>
          <div className="rounded-2xl border border-sand bg-sand/30 p-5 text-left space-y-2">
            <p className="text-body-sm font-medium text-ink">What happens next?</p>
            <ul className="space-y-1 text-body-sm text-mist">
              <li>✦ We verify your company details</li>
              <li>✦ We review the materials you supply</li>
              <li>✦ You receive an approval email</li>
              <li>✦ Your supplier account goes live on Luna</li>
            </ul>
          </div>
          <p className="text-body-sm text-mist">
            Questions?{" "}
            <a href="mailto:suppliers@luna.ae" className="text-gold hover:underline">
              suppliers@luna.ae
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 6: Type-check and lint**

Run:
```bash
pnpm --filter @e-luna/supplier exec tsc --noEmit && pnpm --filter @e-luna/supplier lint
```
Expected: no type errors; lint clean.

- [ ] **Step 7: Commit**

```bash
git add "apps/supplier/app/(auth)" apps/supplier/app/pending apps/supplier/middleware.ts
git commit -m "feat(supplier): add sign-in, onboarding wizard, pending, and middleware"
```

---

### Task 7: Dashboard shell (status-gated) + sidebar

**Files:**
- Create: `apps/supplier/app/(dashboard)/components/Sidebar.tsx`
- Create: `apps/supplier/app/(dashboard)/layout.tsx`
- Create: `apps/supplier/app/(dashboard)/page.tsx`

- [ ] **Step 1: `apps/supplier/app/(dashboard)/components/Sidebar.tsx`**

Nav shows the S1 items plus disabled "coming soon" seams for S2/S3.

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "@clerk/nextjs";

const NAV_ITEMS = [
  { icon: "📊", label: "Dashboard", href: "/" },
] as const;

const SOON_ITEMS = [
  { icon: "🧵", label: "Materials" },
  { icon: "📋", label: "Incoming Orders" },
] as const;

type Props = {
  companyName: string;
};

export function Sidebar({ companyName }: Props) {
  const pathname = usePathname();

  return (
    <aside className="flex w-56 shrink-0 flex-col bg-ink min-h-screen">
      <div className="px-4 py-5 border-b border-white/10">
        <p className="font-display text-display-sm text-gold">✦ Luna</p>
        <p className="text-body-xs text-mist mt-0.5">Supplier OS</p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map(({ icon, label, href }) => {
          const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-body-md transition-colors ${
                isActive ? "bg-gold/20 text-gold" : "text-mist hover:text-ivory hover:bg-white/5"
              }`}
            >
              <span className="text-base">{icon}</span>
              <span>{label}</span>
            </Link>
          );
        })}
        {SOON_ITEMS.map(({ icon, label }) => (
          <div
            key={label}
            className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-body-md text-mist/50"
          >
            <span className="flex items-center gap-3">
              <span className="text-base">{icon}</span>
              <span>{label}</span>
            </span>
            <span className="text-body-xs text-mist/40">soon</span>
          </div>
        ))}
      </nav>

      <div className="px-4 py-4 border-t border-white/10 space-y-2">
        <p className="text-body-xs text-gold truncate">{companyName}</p>
        <SignOutButton>
          <button className="text-body-xs text-mist hover:text-ivory transition-colors">
            Sign out
          </button>
        </SignOutButton>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: `apps/supplier/app/(dashboard)/layout.tsx`**

Status gate mirrors the vendor layout (redirect on missing/non-active supplier), with a simple inline header (no chat widget — no supplier agent in S1).

```tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { safeCurrentUser } from "../lib/auth";
import { getSupplierByUserId } from "../lib/supplier";
import { Sidebar } from "./components/Sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await safeCurrentUser();

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ivory">
        <div className="text-center">
          <p className="font-display text-display-md text-ink mb-4">
            Sign in to access your supplier dashboard
          </p>
          <Link
            href="/sign-in"
            className="inline-flex rounded-full bg-ink px-6 py-3 text-body-md font-medium text-ivory"
          >
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  const supplier = await getSupplierByUserId(user.id);

  if (!supplier) redirect("/onboarding");
  if (supplier.status === "PENDING") redirect("/pending");
  if (supplier.status === "SUSPENDED" || supplier.status === "REJECTED") {
    redirect("/pending?reason=" + supplier.status.toLowerCase());
  }
  if (supplier.status !== "ACTIVE") redirect("/pending");

  return (
    <div className="flex min-h-screen bg-ivory">
      <Sidebar companyName={supplier.companyName} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-sand bg-ivory px-6 py-4">
          <p className="font-display text-display-sm text-ink">{supplier.companyName}</p>
          <span className="text-body-sm text-mist">Supplier OS</span>
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: `apps/supplier/app/(dashboard)/page.tsx`**

Placeholder home with the S2/S3 seams.

```tsx
import { Metadata } from "next";
import { safeCurrentUser } from "../lib/auth";
import { getSupplierByUserId } from "../lib/supplier";

export const metadata: Metadata = {
  title: "Dashboard — Luna Supplier",
};

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage() {
  const user = await safeCurrentUser();
  if (!user) return null; // Layout handles the sign-in redirect

  const supplier = await getSupplierByUserId(user.id);
  if (!supplier) return null; // Layout handles the onboarding redirect

  const today = new Date().toLocaleDateString("en-AE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="font-display text-display-md text-ink">
          {getGreeting()}, {supplier.companyName} ✦
        </h2>
        <p className="text-body-md text-mist">{today}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-dashed border-sand bg-ivory p-6">
          <p className="text-label text-gold mb-1">COMING SOON</p>
          <p className="text-body-md font-medium text-ink">Materials catalog</p>
          <p className="text-body-sm text-mist mt-1">
            List the fabrics, trims, and hardware you supply — with stock and wholesale pricing.
          </p>
        </div>
        <div className="rounded-2xl border border-dashed border-sand bg-ivory p-6">
          <p className="text-label text-gold mb-1">COMING SOON</p>
          <p className="text-body-md font-medium text-ink">Incoming orders</p>
          <p className="text-body-sm text-mist mt-1">
            Receive and fulfil material orders placed by Luna vendors.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-sand bg-ivory p-6">
        <p className="text-body-sm font-medium text-ink mb-2">Your supply categories</p>
        <div className="flex flex-wrap gap-2">
          {supplier.materialTypes.length === 0 ? (
            <span className="text-body-sm text-mist">None selected</span>
          ) : (
            supplier.materialTypes.map((t) => (
              <span
                key={t}
                className="rounded-full border border-sand px-3 py-1 text-body-sm text-ink capitalize"
              >
                {t}
              </span>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Type-check and lint**

Run:
```bash
pnpm --filter @e-luna/supplier exec tsc --noEmit && pnpm --filter @e-luna/supplier lint
```
Expected: no type errors; lint clean.

- [ ] **Step 5: Commit**

```bash
git add "apps/supplier/app/(dashboard)"
git commit -m "feat(supplier): add status-gated dashboard shell with S2/S3 seams"
```

---

### Task 8: Admin — supplier approval action

**Files:**
- Create: `apps/admin/app/actions/suppliers.ts`

- [ ] **Step 1: `apps/admin/app/actions/suppliers.ts`**

Mirrors `apps/admin/app/actions/sellers.ts` exactly, for `Supplier`.

```ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma, type SupplierStatus } from "@e-luna/db";
import { getAuthUser } from "@e-luna/auth";

type ActionResult = { success: true } | { error: string };

async function setSupplierStatus(
  id: string,
  status: SupplierStatus
): Promise<ActionResult> {
  // Defense-in-depth: verify the ADMIN role in the action itself, not just in
  // middleware. Server actions are directly-invocable POST endpoints.
  const user = await getAuthUser();
  if (!user) return { error: "Unauthorized" };
  if (user.role !== "ADMIN") return { error: "Forbidden" };

  try {
    await prisma.supplier.update({ where: { id }, data: { status } });
    revalidatePath("/");
    revalidatePath("/suppliers");
    revalidatePath("/suppliers/approvals");
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Update failed" };
  }
}

export async function approveSupplier(id: string): Promise<ActionResult> {
  return setSupplierStatus(id, "ACTIVE");
}

export async function rejectSupplier(id: string): Promise<ActionResult> {
  return setSupplierStatus(id, "REJECTED");
}

export async function suspendSupplier(id: string): Promise<ActionResult> {
  return setSupplierStatus(id, "SUSPENDED");
}

export async function reactivateSupplier(id: string): Promise<ActionResult> {
  return setSupplierStatus(id, "ACTIVE");
}
```

- [ ] **Step 2: Type-check**

Run:
```bash
pnpm --filter @e-luna/admin exec tsc --noEmit
```
Expected: no errors (`SupplierStatus` resolves; `getAuthUser` already used by `sellers.ts`).

- [ ] **Step 3: Commit**

```bash
git add apps/admin/app/actions/suppliers.ts
git commit -m "feat(admin): add supplier approval server actions"
```

---

### Task 9: Admin — SupplierActions component + approvals page + nav

**Files:**
- Create: `apps/admin/app/(dashboard)/components/SupplierActions.tsx`
- Create: `apps/admin/app/(dashboard)/suppliers/approvals/page.tsx`
- Modify: `apps/admin/app/(dashboard)/components/Sidebar.tsx`

- [ ] **Step 1: `apps/admin/app/(dashboard)/components/SupplierActions.tsx`**

Mirrors `VendorActions.tsx` for suppliers.

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SupplierStatus } from "@e-luna/db";
import {
  approveSupplier,
  rejectSupplier,
  suspendSupplier,
  reactivateSupplier,
} from "../../actions/suppliers";

type Props = {
  supplierId: string;
  status: SupplierStatus;
};

type ActionResult = { success: true } | { error: string };

export function SupplierActions({ supplierId, status }: Props) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: (id: string) => Promise<ActionResult>) {
    setIsLoading(true);
    setError(null);
    const result = await action(supplierId);
    if ("error" in result) {
      setError(result.error);
      setIsLoading(false);
      return;
    }
    router.refresh();
    setIsLoading(false);
  }

  const approveBtn =
    "rounded-full bg-sage/20 px-4 py-2 text-body-sm font-medium text-sage hover:bg-sage/30 disabled:opacity-50";
  const dangerBtn =
    "rounded-full bg-coral/20 px-4 py-2 text-body-sm font-medium text-coral hover:bg-coral/30 disabled:opacity-50";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {status === "PENDING" && (
          <>
            <button onClick={() => run(approveSupplier)} disabled={isLoading} className={approveBtn}>
              Approve
            </button>
            <button onClick={() => run(rejectSupplier)} disabled={isLoading} className={dangerBtn}>
              Reject
            </button>
          </>
        )}

        {status === "ACTIVE" && (
          <button onClick={() => run(suspendSupplier)} disabled={isLoading} className={dangerBtn}>
            Suspend
          </button>
        )}

        {status === "SUSPENDED" && (
          <button onClick={() => run(reactivateSupplier)} disabled={isLoading} className={approveBtn}>
            Reactivate
          </button>
        )}

        {status === "REJECTED" && (
          <button onClick={() => run(approveSupplier)} disabled={isLoading} className={approveBtn}>
            Approve
          </button>
        )}
      </div>

      {error && <p className="text-body-xs text-coral">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: `apps/admin/app/(dashboard)/suppliers/approvals/page.tsx`**

Mirrors the sellers approvals page. (`safeCurrentUser` lives at `apps/admin/app/lib/auth.ts`; from
`(dashboard)/suppliers/approvals/` that is `../../../lib/auth`.)

```tsx
import { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../../../lib/auth";
import { SupplierActions } from "../../components/SupplierActions";

export const metadata: Metadata = { title: "Supplier Approvals — Luna Ops" };

export default async function SupplierApprovalsPage() {
  const user = await safeCurrentUser();
  if (!user) redirect("/");

  const pending = await prisma.supplier
    .findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" } })
    .catch(() => []);

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-baseline gap-3">
        <h2 className="font-display text-display-md text-ink">Supplier Approvals</h2>
        <span className="text-body-sm text-mist">{pending.length} waiting</span>
      </div>

      {pending.length === 0 ? (
        <div className="rounded-lg border border-sand bg-white py-16 text-center">
          <p className="text-body-sm text-mist">
            No pending suppliers — you&apos;re all caught up.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {pending.map((s) => (
            <div key={s.id} className="rounded-lg border border-sand bg-white p-5">
              <div className="mb-3 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-body-md font-medium text-ink">{s.companyName}</p>
                  <p className="text-body-xs text-mist">supply.luna.ae/{s.companySlug}</p>
                  {s.materialTypes.length > 0 && (
                    <p className="text-body-xs text-mist mt-1 capitalize">
                      Supplies: {s.materialTypes.join(", ")}
                    </p>
                  )}
                </div>
              </div>
              <SupplierActions supplierId={s.id} status={s.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add "Suppliers" to the admin Sidebar nav**

In `apps/admin/app/(dashboard)/components/Sidebar.tsx`, find the `NAV_ITEMS` array. Insert a
Suppliers entry directly after the `Approvals` entry (`{ icon: "✅", label: "Approvals", href: "/sellers/approvals" },`):
```tsx
  { icon: "🧵", label: "Suppliers", href: "/suppliers/approvals" },
```
So that region of the array reads:
```tsx
  { icon: "🏬", label: "Sellers", href: "/sellers" },
  { icon: "✅", label: "Approvals", href: "/sellers/approvals" },
  { icon: "🧵", label: "Suppliers", href: "/suppliers/approvals" },
  { icon: "📋", label: "Orders", href: "/orders" },
```
The existing active-state chain falls through to `pathname === href` for `/suppliers/approvals`, which
is correct — no change to the `isActive` logic needed.

- [ ] **Step 4: Type-check and lint the admin app**

Run:
```bash
pnpm --filter @e-luna/admin exec tsc --noEmit && pnpm --filter @e-luna/admin lint
```
Expected: no type errors; lint clean.

- [ ] **Step 5: Commit**

```bash
git add "apps/admin/app/(dashboard)/components/SupplierActions.tsx" "apps/admin/app/(dashboard)/suppliers" "apps/admin/app/(dashboard)/components/Sidebar.tsx"
git commit -m "feat(admin): add supplier approvals page, actions component, and nav"
```

---

### Task 10: Env note + full workspace verification

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Add a supplier note to `.env.example`**

Under the `# Clerk` block at the top, append this comment line (keep existing lines intact):
```bash
# NOTE: In production, the supplier app (supply.luna.ae) should use its OWN Clerk
# instance keys — persona logins are kept separate. Local dev can reuse these test keys.
```

- [ ] **Step 2: Full monorepo type-check**

Run:
```bash
pnpm --filter @e-luna/db db:generate && pnpm --filter "@e-luna/*" exec tsc --noEmit
```
Expected: no type errors across all packages/apps (including the new `@e-luna/supplier`).

- [ ] **Step 3: Full lint**

Run:
```bash
pnpm lint
```
Expected: all apps (customer, vendor, admin, supplier) lint clean.

- [ ] **Step 4: Commit**

```bash
git add .env.example
git commit -m "docs(env): note supplier app uses its own Clerk instance in production"
```

---

## Self-Review

**Spec coverage:**
- `SUPPLIER` role + `SupplierStatus` + `Supplier` model + `User` back-relation → Task 1. ✅
- auth `UserRole`/`ROLES`/`supplierId` claim → Task 2. ✅
- New `supply.luna.ae` app (config, layout, middleware, port 3003) → Tasks 3, 6. ✅
- `materialTypes String[]` captured at onboarding, no `commissionRate` → Tasks 1, 4, 5. ✅
- Sign-in + onboarding wizard (name + slug + material multiselect) + `createSupplier` (validation, P2002, role upsert, PENDING) → Tasks 5, 6. ✅
- Status-gated dashboard shell with "Materials/Orders — coming soon" seams → Task 7. ✅
- `getSupplierByUserId` + `safeCurrentUser` helpers → Tasks 3, 4. ✅
- Admin supplier approval (page + actions + `SupplierActions` + nav) mirroring sellers → Tasks 8, 9. ✅
- `.env.example` note re: separate Clerk instance → Task 10. ✅
- Data flow (signup → PENDING → admin approve → ACTIVE dashboard) → covered by Tasks 5–9. ✅
- Testing = generate + tsc + lint → each task + Task 10. ✅

**Placeholder scan:** No TBD/TODO; every code step contains full file contents or an exact anchored edit.

**Type consistency:** `SupplierStatus` (from `@e-luna/db`) used identically in Tasks 4, 8, 9.
`createSupplier(name, slug, materialTypes)` signature matches its call in Task 6. `getSupplierByUserId`
return shape (`companyName`, `materialTypes`, `status`) matches its consumers in Tasks 6, 7.
`sanitizeMaterialTypes` defined in Task 4, used in Task 5. `SupplierActions` prop names
(`supplierId`, `status`) match its usage in Task 9's approvals page. Admin action names
(`approveSupplier`/`rejectSupplier`/`suspendSupplier`/`reactivateSupplier`) defined in Task 8, imported
in Task 9. ✅

**Deviation flagged:** middleware clones the real vendor `clerkMiddleware` pattern (not the spec's
`createLunaMiddleware`) — documented in "Repo Conventions" above.
