# Phase 4a: Vendor OS Shell + Onboarding — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Vendor OS foundation — a 4-step onboarding wizard, pending-approval holding page, wide sidebar layout shell, and a rich dashboard with 4 KPI cards, Luna AI low-stock alerts, and a 7-day CSS revenue bar chart.

**Architecture:** Next.js 15 App Router with two route groups: `(auth)/` for public onboarding/sign-in and `(dashboard)/` for protected vendor pages. Auth guard lives in the dashboard layout RSC (not middleware) so it can call Prisma. Middleware is simplified to check sign-in state only. All DB calls have `.catch()` guards for dev-without-DB resilience.

**Tech Stack:** Next.js 15 App Router, Prisma 5, TypeScript, Tailwind CSS, Clerk (`@clerk/nextjs`), `@e-luna/db`, `@e-luna/ui`

---

## File Map

**New files:**
```
apps/vendor/app/lib/auth.ts                          — safeCurrentUser() helper
apps/vendor/app/lib/vendor.ts                        — getVendorByUserId() helper
apps/vendor/app/actions/vendor.ts                    — createVendor, updateVendorProfile, updateVendorIBAN
apps/vendor/app/(auth)/onboarding/OnboardingWizard.tsx  — client multi-step wizard
apps/vendor/app/(auth)/onboarding/page.tsx           — onboarding RSC (replaces stub)
apps/vendor/app/pending/page.tsx                     — "under review" holding page
apps/vendor/app/(dashboard)/layout.tsx               — auth guard + sidebar shell
apps/vendor/app/(dashboard)/components/Sidebar.tsx   — client sidebar with active links
apps/vendor/app/(dashboard)/components/TopBar.tsx    — store name + sign-out
apps/vendor/app/(dashboard)/page.tsx                 — dashboard RSC (replaces placeholder)
apps/vendor/app/(dashboard)/products/page.tsx        — stub
apps/vendor/app/(dashboard)/orders/page.tsx          — stub
apps/vendor/app/(dashboard)/inventory/page.tsx       — stub
apps/vendor/app/(dashboard)/analytics/page.tsx       — stub
apps/vendor/app/(dashboard)/payouts/page.tsx         — stub
apps/vendor/app/(dashboard)/settings/page.tsx        — stub
```

**Modified files:**
```
apps/vendor/middleware.ts                            — simplify to signed-in check only, add public routes
apps/vendor/app/page.tsx                            — redirect to (dashboard) or onboarding
```

---

## Context Every Implementer Needs

- **Working dir:** `/Users/alialajme/Projects/Luna/e-luna`
- **Vendor app dir:** `apps/vendor/app/`
- **DB import:** `import { prisma } from "@e-luna/db"` — all Prisma calls need `.catch(fallback)`
- **Next.js 15:** `params`/`searchParams` are `Promise<...>` — always await
- **"use server" exports must be async** — sync exports from server action files cause build errors
- **Tailwind tokens:** `bg-ink` (#1a0a00), `text-ivory` (#fff8ee), `text-gold` (#d4a855), `border-sand` (#f0e8d8), `text-mist` (#888888), `bg-sage` (#6dbf8e), `text-coral` (#e57373)
- **Vendor model fields:** `id`, `userId`, `storeName`, `storeSlug` (unique), `description?`, `logoUrl?`, `status` (VendorStatus enum: PENDING|ACTIVE|SUSPENDED|REJECTED), `ibanNumber?`, `commissionRate`, `mfaVerifiedAt?`
- **User model fields:** `id` (Clerk userId), `email`, `role` (UserRole enum: CUSTOMER|VENDOR|ADMIN), `mfaEnabled`
- **Prisma enums:** `VendorStatus`, `UserRole` — import as string literals in server actions (e.g., `status: "PENDING"`)
- **Dev mode:** `safeCurrentUser()` returns null when NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is unset — all pages must handle null user gracefully with a "Sign in" prompt
- **Dev server port:** vendor app runs on port 3001: `cd apps/vendor && npx next dev --port 3001`

---

## Task 1: Simplify Middleware + Auth Helper

**Files:**
- Modify: `apps/vendor/middleware.ts`
- Create: `apps/vendor/app/lib/auth.ts`
- Create: `apps/vendor/app/lib/vendor.ts`

- [ ] **Step 1: Rewrite `apps/vendor/middleware.ts`**

The existing middleware uses `createLunaMiddleware("VENDOR")` which checks for VENDOR role in Clerk session claims — this blocks users who haven't completed onboarding yet. Replace with a simpler version that only verifies the user is signed in for protected routes:

```typescript
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

- [ ] **Step 2: Create `apps/vendor/app/lib/auth.ts`**

```typescript
import { currentUser } from "@clerk/nextjs/server";
import type { User } from "@clerk/nextjs/server";

export async function safeCurrentUser(): Promise<User | null> {
  try {
    return await currentUser();
  } catch {
    return null;
  }
}
```

- [ ] **Step 3: Create `apps/vendor/app/lib/vendor.ts`**

```typescript
import { prisma } from "@e-luna/db";

export type VendorWithStatus = {
  id: string;
  userId: string;
  storeName: string;
  storeSlug: string;
  status: string;
  description: string | null;
  logoUrl: string | null;
  ibanNumber: string | null;
};

export async function getVendorByUserId(
  userId: string
): Promise<VendorWithStatus | null> {
  return prisma.vendor
    .findUnique({
      where: { userId },
      select: {
        id: true,
        userId: true,
        storeName: true,
        storeSlug: true,
        status: true,
        description: true,
        logoUrl: true,
        ibanNumber: true,
      },
    })
    .catch(() => null);
}
```

- [ ] **Step 4: TypeScript check**

```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/vendor && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git add apps/vendor/middleware.ts apps/vendor/app/lib/ && git commit -m "feat: vendor middleware simplified + auth/vendor lib helpers"
```

---

## Task 2: Vendor Server Actions

**Files:**
- Create: `apps/vendor/app/actions/vendor.ts`

- [ ] **Step 1: Create `apps/vendor/app/actions/vendor.ts`**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../lib/auth";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export async function createVendor(
  name: string,
  slug: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await safeCurrentUser();
    if (!user) return { success: false, error: "Not signed in" };

    const trimmedName = name.trim();
    const trimmedSlug = slug.trim().toLowerCase();

    if (trimmedName.length < 2 || trimmedName.length > 60) {
      return { success: false, error: "Store name must be 2–60 characters" };
    }
    if (!/^[a-z0-9-]{3,40}$/.test(trimmedSlug)) {
      return { success: false, error: "Slug must be 3–40 lowercase letters, numbers, or hyphens" };
    }

    const existing = await prisma.vendor.findUnique({
      where: { storeSlug: trimmedSlug },
      select: { id: true },
    });
    if (existing) {
      return { success: false, error: "That store URL is already taken" };
    }

    // Upsert User record with VENDOR role
    await prisma.user.upsert({
      where: { id: user.id },
      create: {
        id: user.id,
        email: user.emailAddresses[0]?.emailAddress ?? "",
        role: "VENDOR",
      },
      update: { role: "VENDOR" },
    });

    await prisma.vendor.create({
      data: {
        userId: user.id,
        storeName: trimmedName,
        storeSlug: trimmedSlug,
        status: "PENDING",
      },
    });

    return { success: true };
  } catch (err) {
    console.error("[createVendor]", err);
    return { success: false, error: "Could not create store. Please try again." };
  }
}

export async function updateVendorProfile(data: {
  description?: string;
  logoUrl?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await safeCurrentUser();
    if (!user) return { success: false, error: "Not signed in" };

    await prisma.vendor.update({
      where: { userId: user.id },
      data: {
        description: data.description?.trim() || null,
        logoUrl: data.logoUrl?.trim() || null,
      },
    });

    revalidatePath("/");
    return { success: true };
  } catch (err) {
    console.error("[updateVendorProfile]", err);
    return { success: false, error: "Could not update profile" };
  }
}

export async function updateVendorIBAN(
  iban: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await safeCurrentUser();
    if (!user) return { success: false, error: "Not signed in" };

    const trimmed = iban.replace(/\s/g, "");
    if (trimmed.length < 5) {
      return { success: false, error: "Please enter a valid IBAN" };
    }

    await prisma.vendor.update({
      where: { userId: user.id },
      data: { ibanNumber: trimmed },
    });

    return { success: true };
  } catch (err) {
    console.error("[updateVendorIBAN]", err);
    return { success: false, error: "Could not save IBAN" };
  }
}

export { slugify };
```

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/vendor && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors beyond pre-existing ones.

- [ ] **Step 3: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git add apps/vendor/app/actions/ && git commit -m "feat: vendor server actions (createVendor, updateVendorProfile, updateVendorIBAN)"
```

---

## Task 3: Onboarding Wizard

**Files:**
- Create: `apps/vendor/app/(auth)/onboarding/OnboardingWizard.tsx`
- Modify: `apps/vendor/app/(auth)/onboarding/page.tsx`

- [ ] **Step 1: Check if `(auth)/onboarding/page.tsx` exists**

```bash
ls /Users/alialajme/Projects/Luna/e-luna/apps/vendor/app/\(auth\)/onboarding/ 2>/dev/null || echo "does not exist"
```

The existing onboarding page (if any) will be replaced.

- [ ] **Step 2: Create `apps/vendor/app/(auth)/onboarding/OnboardingWizard.tsx`**

```typescript
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createVendor,
  updateVendorProfile,
  updateVendorIBAN,
  slugify,
} from "../../actions/vendor";

type Props = {
  userEmail: string;
};

export function OnboardingWizard({ userEmail }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Step 1 state
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");

  // Step 2 state
  const [description, setDescription] = useState("");
  const [logoUrl, setLogoUrl] = useState("");

  // Step 3 state
  const [iban, setIban] = useState("");

  function handleNameChange(val: string) {
    setName(val);
    if (!slug || slug === slugify(name)) {
      setSlug(slugify(val));
    }
  }

  function handleStep1() {
    setError(null);
    startTransition(async () => {
      const result = await createVendor(name, slug);
      if (!result.success) {
        setError(result.error ?? "Something went wrong");
        return;
      }
      setStep(2);
    });
  }

  function handleStep2Skip() {
    setStep(3);
  }

  function handleStep2() {
    setError(null);
    startTransition(async () => {
      const result = await updateVendorProfile({ description, logoUrl });
      if (!result.success) {
        setError(result.error ?? "Something went wrong");
        return;
      }
      setStep(3);
    });
  }

  function handleStep3Skip() {
    setStep(4);
  }

  function handleStep3() {
    setError(null);
    startTransition(async () => {
      const result = await updateVendorIBAN(iban);
      if (!result.success) {
        setError(result.error ?? "Invalid IBAN");
        return;
      }
      setStep(4);
    });
  }

  function handleFinish() {
    router.push("/pending");
  }

  const STEPS = ["Store identity", "About your boutique", "Payout details", "Secure your account"];

  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      {/* Progress bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          {STEPS.map((label, i) => (
            <div key={label} className="flex flex-col items-center gap-1 flex-1">
              <div
                className={`h-2 w-full rounded-full ${
                  i + 1 <= step ? "bg-gold" : "bg-sand"
                }`}
              />
              <span className={`text-body-xs hidden sm:block ${i + 1 === step ? "text-ink" : "text-mist"}`}>
                {label}
              </span>
            </div>
          ))}
        </div>
        <p className="text-body-sm text-mist">Step {step} of {STEPS.length}</p>
      </div>

      {/* Step 1 — Store Identity */}
      {step === 1 && (
        <div className="space-y-6">
          <div>
            <h1 className="font-display text-display-md text-ink">Name your boutique</h1>
            <p className="text-body-md text-mist mt-1">This is what customers will see on Luna.</p>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-label text-mist block mb-2">STORE NAME</label>
              <input
                type="text"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g. Hessa's Abayas"
                maxLength={60}
                className="w-full rounded-xl border border-sand px-4 py-3 text-body-md text-ink bg-ivory focus:outline-none focus:border-ink"
              />
            </div>
            <div>
              <label className="text-label text-mist block mb-2">STORE URL</label>
              <div className="flex items-center rounded-xl border border-sand overflow-hidden">
                <span className="px-3 py-3 text-body-sm text-mist bg-sand/50 border-r border-sand">
                  luna.ae/vendors/
                </span>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  placeholder="hessas-abayas"
                  maxLength={40}
                  className="flex-1 px-3 py-3 text-body-md text-ink bg-ivory focus:outline-none"
                />
              </div>
              <p className="text-body-xs text-mist mt-1">Lowercase letters, numbers, and hyphens only</p>
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
            disabled={isPending || !name.trim() || !slug.trim()}
            className="w-full rounded-full bg-ink px-6 py-3 text-body-md font-medium text-ivory hover:bg-ink/90 transition-colors disabled:opacity-50"
          >
            {isPending ? "Creating…" : "Next →"}
          </button>
        </div>
      )}

      {/* Step 2 — About Your Boutique */}
      {step === 2 && (
        <div className="space-y-6">
          <div>
            <h1 className="font-display text-display-md text-ink">Tell us about your boutique</h1>
            <p className="text-body-md text-mist mt-1">Optional — you can add this later in Settings.</p>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-label text-mist block mb-2">DESCRIPTION</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Share your story, your style, what makes your abayas unique…"
                maxLength={400}
                rows={4}
                className="w-full rounded-xl border border-sand px-4 py-3 text-body-md text-ink bg-ivory focus:outline-none focus:border-ink resize-none"
              />
              <p className="text-body-xs text-mist mt-1">{description.length}/400</p>
            </div>
            <div>
              <label className="text-label text-mist block mb-2">LOGO URL</label>
              <input
                type="url"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://example.com/logo.png"
                className="w-full rounded-xl border border-sand px-4 py-3 text-body-md text-ink bg-ivory focus:outline-none focus:border-ink"
              />
              <p className="text-body-xs text-mist mt-1">Direct image URL — upload support coming soon</p>
            </div>
          </div>
          {error && (
            <div className="rounded-xl bg-coral/10 border border-coral px-4 py-3 text-body-sm text-coral">
              {error}
            </div>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleStep2Skip}
              className="flex-1 rounded-full border border-sand px-6 py-3 text-body-md text-mist hover:border-ink hover:text-ink transition-colors"
            >
              Skip for now
            </button>
            <button
              type="button"
              onClick={handleStep2}
              disabled={isPending}
              className="flex-1 rounded-full bg-ink px-6 py-3 text-body-md font-medium text-ivory hover:bg-ink/90 transition-colors disabled:opacity-50"
            >
              {isPending ? "Saving…" : "Save & Continue →"}
            </button>
          </div>
        </div>
      )}

      {/* Step 3 — Payout Details */}
      {step === 3 && (
        <div className="space-y-6">
          <div>
            <h1 className="font-display text-display-md text-ink">Set up payouts</h1>
            <p className="text-body-md text-mist mt-1">Required before your first payout. You can update this in Settings anytime.</p>
          </div>
          <div>
            <label className="text-label text-mist block mb-2">IBAN</label>
            <input
              type="text"
              value={iban}
              onChange={(e) => setIban(e.target.value)}
              placeholder="AE07 0331 2345 6789 0123 456"
              className="w-full rounded-xl border border-sand px-4 py-3 text-body-md text-ink bg-ivory focus:outline-none focus:border-ink font-mono"
            />
            <p className="text-body-xs text-mist mt-1">UAE IBAN format · Luna pays out weekly</p>
          </div>
          {error && (
            <div className="rounded-xl bg-coral/10 border border-coral px-4 py-3 text-body-sm text-coral">
              {error}
            </div>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleStep3Skip}
              className="flex-1 rounded-full border border-sand px-6 py-3 text-body-md text-mist hover:border-ink hover:text-ink transition-colors"
            >
              Skip for now
            </button>
            <button
              type="button"
              onClick={handleStep3}
              disabled={isPending || !iban.trim()}
              className="flex-1 rounded-full bg-ink px-6 py-3 text-body-md font-medium text-ivory hover:bg-ink/90 transition-colors disabled:opacity-50"
            >
              {isPending ? "Saving…" : "Save & Continue →"}
            </button>
          </div>
        </div>
      )}

      {/* Step 4 — MFA */}
      {step === 4 && (
        <div className="space-y-6">
          <div>
            <h1 className="font-display text-display-md text-ink">Secure your account</h1>
            <p className="text-body-md text-mist mt-1">
              Luna requires two-factor authentication for all sellers to protect your earnings and your customers.
            </p>
          </div>
          <div className="rounded-2xl border border-sand bg-sand/30 p-5 space-y-3">
            <p className="text-body-md text-ink font-medium">How to enable MFA:</p>
            <ol className="list-decimal list-inside space-y-2 text-body-md text-mist">
              <li>Click "Enable MFA" below — your account settings will open in a new tab</li>
              <li>Choose Authenticator app or SMS</li>
              <li>Follow the steps to set it up</li>
              <li>Return here and click "Finish setup"</li>
            </ol>
          </div>
          <a
            href="https://accounts.clerk.dev/user"
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-full border border-ink px-6 py-3 text-body-md font-medium text-ink hover:bg-ink hover:text-ivory transition-colors"
          >
            Enable MFA ↗
          </a>
          <button
            type="button"
            onClick={handleFinish}
            className="w-full rounded-full bg-gold px-6 py-3 text-body-md font-medium text-ink hover:bg-gold/90 transition-colors"
          >
            Finish setup ✦
          </button>
          <p className="text-body-xs text-mist text-center">
            Submitted as {userEmail}
          </p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Rewrite `apps/vendor/app/(auth)/onboarding/page.tsx`**

```typescript
import { redirect } from "next/navigation";
import { Metadata } from "next";
import { safeCurrentUser } from "../../lib/auth";
import { getVendorByUserId } from "../../lib/vendor";
import { OnboardingWizard } from "./OnboardingWizard";

export const metadata: Metadata = {
  title: "Set up your boutique — Luna Vendor",
};

export default async function OnboardingPage() {
  const user = await safeCurrentUser();

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ink">
        <div className="text-center">
          <p className="font-display text-display-md text-gold mb-4">Luna Vendor OS</p>
          <a
            href="/sign-in"
            className="inline-flex rounded-full bg-gold px-6 py-3 text-body-md font-medium text-ink"
          >
            Sign in to continue
          </a>
        </div>
      </main>
    );
  }

  const vendor = await getVendorByUserId(user.id);

  // Already onboarded — redirect based on status
  if (vendor?.status === "ACTIVE") redirect("/");
  if (vendor?.status === "PENDING") redirect("/pending");

  const userEmail = user.emailAddresses[0]?.emailAddress ?? "";

  return (
    <main className="min-h-screen bg-ivory">
      {/* Logo strip */}
      <div className="border-b border-sand px-6 py-4">
        <span className="font-display text-display-sm text-gold">✦ Luna</span>
        <span className="text-body-md text-mist ml-2">Vendor setup</span>
      </div>
      <OnboardingWizard userEmail={userEmail} />
    </main>
  );
}
```

- [ ] **Step 4: TypeScript check**

```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/vendor && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git add apps/vendor/app/\(auth\)/onboarding/ && git commit -m "feat: 4-step vendor onboarding wizard (name, profile, IBAN, MFA)"
```

---

## Task 4: Pending Page

**Files:**
- Create: `apps/vendor/app/pending/page.tsx`

- [ ] **Step 1: Create `apps/vendor/app/pending/page.tsx`**

```typescript
import { Metadata } from "next";
import { SignOutButton } from "@clerk/nextjs";
import { safeCurrentUser } from "../lib/auth";

export const metadata: Metadata = {
  title: "Application Under Review — Luna Vendor",
};

export default async function PendingPage() {
  const user = await safeCurrentUser();
  const email = user?.emailAddresses[0]?.emailAddress ?? "your email";

  return (
    <main className="flex min-h-screen flex-col bg-ivory">
      {/* Top strip */}
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

      {/* Content */}
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="max-w-md text-center space-y-6">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gold/20">
            <span className="font-display text-display-lg text-gold">✦</span>
          </div>
          <div>
            <h1 className="font-display text-display-lg text-ink">
              Your boutique is under review
            </h1>
            <p className="mt-3 text-body-md text-mist">
              Our team reviews every seller application within{" "}
              <strong className="text-ink">2–3 business days</strong>. You&apos;ll
              receive an email at <strong className="text-ink">{email}</strong> once
              you&apos;re approved.
            </p>
          </div>
          <div className="rounded-2xl border border-sand bg-sand/30 p-5 text-left space-y-2">
            <p className="text-body-sm font-medium text-ink">What happens next?</p>
            <ul className="space-y-1 text-body-sm text-mist">
              <li>✦ We verify your store details</li>
              <li>✦ We review your product categories</li>
              <li>✦ You receive an approval email</li>
              <li>✦ Your boutique goes live on Luna</li>
            </ul>
          </div>
          <p className="text-body-sm text-mist">
            Questions?{" "}
            <a
              href="mailto:sellers@luna.ae"
              className="text-gold hover:underline"
            >
              sellers@luna.ae
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Test the route**

Start the vendor dev server if not running: `cd /Users/alialajme/Projects/Luna/e-luna/apps/vendor && npx next dev --port 3001`

```bash
sleep 4 && curl -s -o /dev/null -w "pending: %{http_code}\n" http://localhost:3001/pending
```

Expected: `200`

- [ ] **Step 3: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git add apps/vendor/app/pending/ && git commit -m "feat: vendor pending-approval holding page"
```

---

## Task 5: Dashboard Shell (Layout + Sidebar + TopBar)

**Files:**
- Create: `apps/vendor/app/(dashboard)/layout.tsx`
- Create: `apps/vendor/app/(dashboard)/components/Sidebar.tsx`
- Create: `apps/vendor/app/(dashboard)/components/TopBar.tsx`

- [ ] **Step 1: Create `apps/vendor/app/(dashboard)/components/Sidebar.tsx`**

```typescript
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "@clerk/nextjs";

const NAV_ITEMS = [
  { icon: "📊", label: "Dashboard", href: "/" },
  { icon: "📦", label: "Products", href: "/products" },
  { icon: "📋", label: "Orders", href: "/orders" },
  { icon: "🏭", label: "Inventory", href: "/inventory" },
  { icon: "📈", label: "Analytics", href: "/analytics" },
  { icon: "💸", label: "Payouts", href: "/payouts" },
  { icon: "⚙️", label: "Settings", href: "/settings" },
] as const;

type Props = {
  storeName: string;
};

export function Sidebar({ storeName }: Props) {
  const pathname = usePathname();

  return (
    <aside className="flex w-56 shrink-0 flex-col bg-ink min-h-screen">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-white/10">
        <p className="font-display text-display-sm text-gold">✦ Luna</p>
        <p className="text-body-xs text-mist mt-0.5">Vendor OS</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map(({ icon, label, href }) => {
          const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-body-md transition-colors ${
                isActive
                  ? "bg-gold/20 text-gold"
                  : "text-mist hover:text-ivory hover:bg-white/5"
              }`}
            >
              <span className="text-base">{icon}</span>
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-white/10 space-y-2">
        <p className="text-body-xs text-gold truncate">{storeName}</p>
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

- [ ] **Step 2: Create `apps/vendor/app/(dashboard)/components/TopBar.tsx`**

```typescript
"use client";

import { usePathname } from "next/navigation";

const PAGE_TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/products": "Products",
  "/orders": "Orders",
  "/inventory": "Inventory",
  "/analytics": "Analytics",
  "/payouts": "Payouts",
  "/settings": "Settings",
};

type Props = {
  storeName: string;
};

export function TopBar({ storeName }: Props) {
  const pathname = usePathname();
  const title = PAGE_TITLES[pathname] ?? "Vendor OS";

  return (
    <header className="flex h-14 items-center justify-between border-b border-sand bg-ivory px-6">
      <h1 className="font-display text-display-sm text-ink">{title}</h1>
      <div className="flex items-center gap-3">
        <span className="rounded-full bg-sand px-3 py-1 text-body-sm text-ink">
          {storeName}
        </span>
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Create `apps/vendor/app/(dashboard)/layout.tsx`**

```typescript
import { redirect } from "next/navigation";
import { safeCurrentUser } from "../lib/auth";
import { getVendorByUserId } from "../lib/vendor";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";

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
            Sign in to access your vendor dashboard
          </p>
          <a
            href="/sign-in"
            className="inline-flex rounded-full bg-ink px-6 py-3 text-body-md font-medium text-ivory"
          >
            Sign in
          </a>
        </div>
      </div>
    );
  }

  const vendor = await getVendorByUserId(user.id);

  if (!vendor) redirect("/onboarding");
  if (vendor.status === "PENDING") redirect("/pending");
  if (vendor.status === "SUSPENDED" || vendor.status === "REJECTED") {
    redirect("/pending?reason=" + vendor.status.toLowerCase());
  }

  return (
    <div className="flex min-h-screen bg-ivory">
      <Sidebar storeName={vendor.storeName} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar storeName={vendor.storeName} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: TypeScript check**

```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/vendor && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git add apps/vendor/app/\(dashboard\)/ && git commit -m "feat: vendor dashboard shell (layout, Sidebar, TopBar) with auth guard"
```

---

## Task 6: Dashboard Page

**Files:**
- Create: `apps/vendor/app/(dashboard)/page.tsx`

- [ ] **Step 1: Move existing root page.tsx into (dashboard)**

The existing `apps/vendor/app/page.tsx` is a placeholder ("coming soon"). It needs to be replaced. The new dashboard page lives at `apps/vendor/app/(dashboard)/page.tsx` — Next.js will route `/` to the `(dashboard)` group's `page.tsx` since route groups don't add path segments.

First, overwrite the old page to simply redirect:

```typescript
// apps/vendor/app/page.tsx — this file should be DELETED or kept empty
// Next.js 15 routes "/" to (dashboard)/page.tsx when (dashboard)/page.tsx exists
// If both exist, (dashboard)/page.tsx takes precedence due to the group
// Safe to delete: the (dashboard)/layout.tsx + (dashboard)/page.tsx combo handles "/"
```

Delete the old page: `rm apps/vendor/app/page.tsx`

- [ ] **Step 2: Create `apps/vendor/app/(dashboard)/page.tsx`**

```typescript
import { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../lib/auth";
import { getVendorByUserId } from "../lib/vendor";

export const metadata: Metadata = {
  title: "Dashboard — Luna Vendor",
};

type DailyRevenue = { day: string; total: number };

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function buildChart(data: DailyRevenue[]): DailyRevenue[] {
  const days: DailyRevenue[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dayStr = d.toISOString().slice(0, 10);
    const found = data.find((r) => r.day === dayStr);
    days.push({ day: dayStr, total: found?.total ?? 0 });
  }
  return days;
}

export default async function DashboardPage() {
  const user = await safeCurrentUser();
  if (!user) return null; // Layout handles redirect

  const vendor = await getVendorByUserId(user.id);
  if (!vendor) return null; // Layout handles redirect

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const [revenueAgg, orderCount, pendingCount, productCount, lowStock, rawDaily] =
    await Promise.all([
      // Revenue: sum of (unitPrice × quantity) for this vendor's order items, last 30 days
      prisma.orderItem
        .findMany({
          where: {
            vendorId: vendor.id,
            order: {
              createdAt: { gte: thirtyDaysAgo },
              status: { not: "CANCELLED" },
            },
          },
          select: { unitPrice: true, quantity: true },
        })
        .catch(() => []),

      prisma.order
        .count({ where: { items: { some: { vendorId: vendor.id } } } })
        .catch(() => 0),

      prisma.order
        .count({
          where: {
            items: { some: { vendorId: vendor.id } },
            status: "PENDING",
          },
        })
        .catch(() => 0),

      prisma.product
        .count({ where: { vendorId: vendor.id, status: "ACTIVE" } })
        .catch(() => 0),

      prisma.productVariant
        .findMany({
          where: {
            product: { vendorId: vendor.id },
            stock: { lte: 3, gt: 0 },
          },
          include: { product: { select: { title: true } } },
          take: 5,
          orderBy: { stock: "asc" },
        })
        .catch(() => []),

      prisma.orderItem
        .findMany({
          where: {
            vendorId: vendor.id,
            order: {
              createdAt: { gte: sevenDaysAgo },
              status: { not: "CANCELLED" },
            },
          },
          select: {
            unitPrice: true,
            quantity: true,
            order: { select: { createdAt: true } },
          },
        })
        .catch(() => []),
    ]);

  const revenue30d = revenueAgg.reduce(
    (sum, item) => sum + Number(item.unitPrice) * item.quantity,
    0
  );

  // Group daily revenue for chart
  const dailyMap: Record<string, number> = {};
  for (const item of rawDaily) {
    const day = item.order.createdAt.toISOString().slice(0, 10);
    dailyMap[day] = (dailyMap[day] ?? 0) + Number(item.unitPrice) * item.quantity;
  }
  const dailyData = buildChart(
    Object.entries(dailyMap).map(([day, total]) => ({ day, total }))
  );
  const maxRevenue = Math.max(...dailyData.map((d) => d.total), 1);

  const today = new Date().toLocaleDateString("en-AE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Greeting */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-display-md text-ink">
            {getGreeting()}, {vendor.storeName} ✦
          </h2>
          <p className="text-body-md text-mist">{today}</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-sand bg-ivory p-5">
          <p className="text-body-sm text-mist">Revenue (30d)</p>
          <p className="font-display text-display-md text-gold mt-1">
            AED {revenue30d.toLocaleString("en-AE", { minimumFractionDigits: 0 })}
          </p>
        </div>

        <div className="rounded-2xl border border-sand bg-ivory p-5">
          <p className="text-body-sm text-mist">Total Orders</p>
          <p className="font-display text-display-md text-ink mt-1">{orderCount}</p>
        </div>

        <div
          className={`rounded-2xl border p-5 ${
            pendingCount > 0
              ? "border-coral/50 bg-coral/5"
              : "border-sand bg-ivory"
          }`}
        >
          <p className="text-body-sm text-mist">Pending</p>
          <p
            className={`font-display text-display-md mt-1 ${
              pendingCount > 0 ? "text-coral" : "text-ink"
            }`}
          >
            {pendingCount}
          </p>
          {pendingCount > 0 && (
            <Link
              href="/orders"
              className="text-body-xs text-coral hover:underline"
            >
              View orders →
            </Link>
          )}
        </div>

        <div className="rounded-2xl border border-sand bg-ivory p-5">
          <p className="text-body-sm text-mist">Active Products</p>
          <p className="font-display text-display-md text-ink mt-1">{productCount}</p>
        </div>
      </div>

      {/* Luna AI Alert Strip */}
      {lowStock.length > 0 && (
        <div className="rounded-2xl bg-ink px-5 py-4">
          <p className="text-label text-gold mb-2">✦ LUNA AI — LOW STOCK ALERT</p>
          <div className="space-y-1">
            {lowStock.map((variant) => (
              <div
                key={variant.id}
                className="flex items-center justify-between"
              >
                <p className="text-body-sm text-ivory">
                  {variant.product.title} — {variant.size} · {variant.color}
                </p>
                <span
                  className={`text-body-xs font-medium ${
                    variant.stock <= 1 ? "text-coral" : "text-gold"
                  }`}
                >
                  {variant.stock} left
                </span>
              </div>
            ))}
          </div>
          <Link
            href="/inventory"
            className="mt-3 inline-block text-body-sm text-gold hover:underline"
          >
            Manage inventory →
          </Link>
        </div>
      )}

      {/* 7-Day Revenue Chart */}
      <div className="rounded-2xl border border-sand bg-ivory p-5">
        <p className="text-body-sm font-medium text-ink mb-4">Revenue — last 7 days</p>
        <div className="flex items-end gap-2 h-28">
          {dailyData.map(({ day, total }) => {
            const heightPct = total > 0 ? Math.max((total / maxRevenue) * 100, 8) : 0;
            const label = new Date(day + "T00:00:00").toLocaleDateString("en-AE", {
              weekday: "short",
            });
            return (
              <div
                key={day}
                className="flex flex-1 flex-col items-center gap-1"
              >
                <p className="text-body-xs text-mist">
                  {total > 0
                    ? `${Math.round(total / 1000)}k`
                    : ""}
                </p>
                <div className="w-full flex items-end" style={{ height: "80px" }}>
                  <div
                    className={`w-full rounded-t-md transition-all ${
                      total > 0 ? "bg-gold" : "bg-sand"
                    }`}
                    style={{ height: `${heightPct}%` }}
                  />
                </div>
                <p className="text-body-xs text-mist">{label}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Delete old placeholder**

```bash
rm /Users/alialajme/Projects/Luna/e-luna/apps/vendor/app/page.tsx
```

- [ ] **Step 4: TypeScript check**

```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/vendor && npx tsc --noEmit 2>&1 | head -30
```

Expected: no new errors.

- [ ] **Step 5: Test the dashboard route**

```bash
sleep 3 && curl -s -o /dev/null -w "dashboard: %{http_code}\n" http://localhost:3001/
```

Expected: `200` (in dev without Clerk keys, safeCurrentUser returns null → shows "Sign in" prompt from layout, which is still a 200)

- [ ] **Step 6: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git add apps/vendor/app/\(dashboard\)/page.tsx && git rm apps/vendor/app/page.tsx && git commit -m "feat: vendor dashboard with KPI cards, Luna AI low-stock alerts, and 7-day revenue chart"
```

---

## Task 7: Stub Pages + Full Route Sweep

**Files:**
- Create: `apps/vendor/app/(dashboard)/products/page.tsx`
- Create: `apps/vendor/app/(dashboard)/orders/page.tsx`
- Create: `apps/vendor/app/(dashboard)/inventory/page.tsx`
- Create: `apps/vendor/app/(dashboard)/analytics/page.tsx`
- Create: `apps/vendor/app/(dashboard)/payouts/page.tsx`
- Create: `apps/vendor/app/(dashboard)/settings/page.tsx`

- [ ] **Step 1: Create all stub pages**

Each stub follows this exact pattern. Create all 6 files:

`apps/vendor/app/(dashboard)/products/page.tsx`:
```typescript
import { Metadata } from "next";
import Link from "next/link";
export const metadata: Metadata = { title: "Products — Luna Vendor" };
export default function ProductsPage() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <p className="font-display text-display-md text-ink mb-2">Products</p>
      <p className="text-body-md text-mist mb-6">Product management coming in Phase 4b</p>
      <Link href="/" className="text-body-sm text-gold hover:underline">← Back to Dashboard</Link>
    </div>
  );
}
```

`apps/vendor/app/(dashboard)/orders/page.tsx`:
```typescript
import { Metadata } from "next";
import Link from "next/link";
export const metadata: Metadata = { title: "Orders — Luna Vendor" };
export default function OrdersPage() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <p className="font-display text-display-md text-ink mb-2">Orders</p>
      <p className="text-body-md text-mist mb-6">Order fulfillment coming in Phase 4c</p>
      <Link href="/" className="text-body-sm text-gold hover:underline">← Back to Dashboard</Link>
    </div>
  );
}
```

`apps/vendor/app/(dashboard)/inventory/page.tsx`:
```typescript
import { Metadata } from "next";
import Link from "next/link";
export const metadata: Metadata = { title: "Inventory — Luna Vendor" };
export default function InventoryPage() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <p className="font-display text-display-md text-ink mb-2">Inventory</p>
      <p className="text-body-md text-mist mb-6">Inventory management coming in Phase 4b</p>
      <Link href="/" className="text-body-sm text-gold hover:underline">← Back to Dashboard</Link>
    </div>
  );
}
```

`apps/vendor/app/(dashboard)/analytics/page.tsx`:
```typescript
import { Metadata } from "next";
import Link from "next/link";
export const metadata: Metadata = { title: "Analytics — Luna Vendor" };
export default function AnalyticsPage() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <p className="font-display text-display-md text-ink mb-2">Analytics</p>
      <p className="text-body-md text-mist mb-6">Revenue analytics coming in Phase 4d</p>
      <Link href="/" className="text-body-sm text-gold hover:underline">← Back to Dashboard</Link>
    </div>
  );
}
```

`apps/vendor/app/(dashboard)/payouts/page.tsx`:
```typescript
import { Metadata } from "next";
import Link from "next/link";
export const metadata: Metadata = { title: "Payouts — Luna Vendor" };
export default function PayoutsPage() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <p className="font-display text-display-md text-ink mb-2">Payouts</p>
      <p className="text-body-md text-mist mb-6">Payout management coming in Phase 4d</p>
      <Link href="/" className="text-body-sm text-gold hover:underline">← Back to Dashboard</Link>
    </div>
  );
}
```

`apps/vendor/app/(dashboard)/settings/page.tsx`:
```typescript
import { Metadata } from "next";
import Link from "next/link";
export const metadata: Metadata = { title: "Settings — Luna Vendor" };
export default function SettingsPage() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <p className="font-display text-display-md text-ink mb-2">Settings</p>
      <p className="text-body-md text-mist mb-6">Store settings coming in Phase 4b</p>
      <Link href="/" className="text-body-sm text-gold hover:underline">← Back to Dashboard</Link>
    </div>
  );
}
```

- [ ] **Step 2: Full route sweep**

```bash
sleep 3 && for route in "/" "/onboarding" "/pending" "/products" "/orders" "/inventory" "/analytics" "/payouts" "/settings"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3001${route}")
  echo "${route}: ${code}"
done
```

Expected: all `200`.

- [ ] **Step 3: Final TypeScript check**

```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/vendor && npx tsc --noEmit 2>&1 | head -30
```

Expected: no new errors.

- [ ] **Step 4: Commit + push**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git add apps/vendor/app/\(dashboard\)/ && git commit -m "feat: vendor OS stub pages for all sidebar routes" && git push
```

---

## Self-Review

**Spec coverage:**
- ✅ Wide sidebar with labels — Sidebar.tsx
- ✅ Auth guard (signed-in + vendor status check) — DashboardLayout
- ✅ 4-step onboarding (name/slug, profile, IBAN, MFA) — OnboardingWizard
- ✅ Pending holding page — /pending/page.tsx
- ✅ 4 KPI cards (revenue, orders, pending, products) — DashboardPage
- ✅ Luna AI low-stock alert strip — DashboardPage
- ✅ 7-day revenue CSS bar chart — DashboardPage
- ✅ Stub pages for all sidebar routes — Task 7
- ✅ Graceful dev degradation (safeCurrentUser returns null) — all pages
- ✅ Middleware simplified — Task 1

**Type consistency:**
- `VendorWithStatus` defined in `lib/vendor.ts` and used in layout + dashboard
- `safeCurrentUser` imported from `lib/auth` consistently across all files
- Server action return types: `{ success: boolean; error?: string }` used consistently
