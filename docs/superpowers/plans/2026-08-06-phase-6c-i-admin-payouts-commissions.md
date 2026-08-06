# Phase 6c-i: Admin Payouts + Commissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin payouts console (compute vendor balances, create payouts, advance payout status) and a commissions page (edit per-vendor commission rate) to the admin app.

**Architecture:** Two RSC routes under the existing `apps/admin/app/(dashboard)/` group (ADMIN role already gated by its layout). Reuse the 6a/6b patterns: status-filtered lists, status-badge maps, hardened `"use server"` action files (with `getAuthUser()` ADMIN check), and small client action components. Payout amounts are always recomputed server-side. No schema changes.

**Tech Stack:** Next.js 15 App Router (RSC + server actions), Prisma (`@e-luna/db`), Clerk auth (`getAuthUser` from `@e-luna/auth`), Tailwind (Warm Oud tokens).

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `(dashboard)/components/Sidebar.tsx` | Modify | Add Payouts + Commissions nav |
| `(dashboard)/components/TopBar.tsx` | Modify | Add page titles |
| `app/actions/payouts.ts` | Create | createPayout, markProcessing, markCompleted, markFailed |
| `app/actions/commissions.ts` | Create | updateCommissionRate |
| `(dashboard)/components/PayoutActions.tsx` | Create | Client status buttons |
| `(dashboard)/components/CreatePayoutButton.tsx` | Create | Client "Create Payout" button |
| `(dashboard)/components/CommissionEditor.tsx` | Create | Client inline rate editor |
| `(dashboard)/payouts/page.tsx` | Create | Vendors-owed + payout history |
| `(dashboard)/commissions/page.tsx` | Create | Vendor list + rate editing |

---

## Shared Context

**Working dir:** `/Users/alialajme/Projects/Luna/e-luna`

**DB:** `import { prisma } from "@e-luna/db"`. Enums (`PayoutStatus`) import from `@e-luna/db`; if a `type` import errors, fall back to `@prisma/client`.

**Auth:** ADMIN enforced centrally by `(dashboard)/layout.tsx`. Pages need only a null-user check via `safeCurrentUser()` (from `../../lib/auth`). Server actions independently re-check ADMIN via `getAuthUser()` from `@e-luna/auth`.

**Next.js 15:** `params` / `searchParams` are Promises — always `await`.

**Verified schema facts:**
- `Payout`: `id, vendorId, amount (Decimal), currency (String, default "AED"), status (PayoutStatus), ibanNumber (String), reference (String?), processedAt (DateTime?), createdAt`. Relation: `vendor`.
- `PayoutStatus`: `PENDING | PROCESSING | COMPLETED | FAILED`.
- `Vendor`: `id, storeName, storeSlug, status (VendorStatus), commissionRate (Decimal(4,2), default 0.15), ibanNumber (String?)`.
- `OrderItem`: `vendorId, unitPrice (Decimal), quantity, fulfillmentStatus (FulfillmentStatus)`. `FulfillmentStatus` DELIVERED is the value used for revenue.

**Shared money formula (per vendor) — matches the vendor payouts page exactly:**
```
grossRevenue     = Σ (Number(unitPrice) * quantity) over that vendor's OrderItem where fulfillmentStatus === "DELIVERED"
commissionRate   = Number(vendor.commissionRate ?? 0.15)
platformFee      = grossRevenue * commissionRate
netEarned        = grossRevenue - platformFee
paidOut          = Σ Number(amount) over that vendor's Payout where status === "COMPLETED"
availableBalance = Math.max(0, netEarned - paidOut)
```

**maskIban(iban)** = `iban.slice(0, 4) + "···" + iban.slice(-4)`.

**Decimals** → `Number()` before arithmetic.

**Warm Oud tokens:** `text-ink/mist/gold`, `bg-ink`, `bg-sand`/`border-sand`, `bg-white`, `bg-sage/20 text-sage`, `bg-gold/20 text-gold`, `bg-coral/20 text-coral`, `bg-sand text-mist`. Typography: `font-display`, `text-display-sm/md`, `text-body-xs/sm/md`.

**Lint conventions:** `next/link` `<Link>` for internal nav; escape JSX entities; `eslint-disable` above any raw `<img>`.

**Verification commands (run in every task):**
```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/admin && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts" | grep -v "\.next/types" | grep -v "packages/auth/src/middleware"
cd /Users/alialajme/Projects/Luna/e-luna/apps/admin && npx next lint 2>&1 | tail -5
```
tsc expected: empty. lint expected: `✔ No ESLint warnings or errors` (or only `<img>` warnings).

---

## Task 1: Sidebar + TopBar nav additions

**Files:**
- Modify: `apps/admin/app/(dashboard)/components/Sidebar.tsx`
- Modify: `apps/admin/app/(dashboard)/components/TopBar.tsx`

- [ ] **Step 1: Add nav items to `Sidebar.tsx`**

Read the file. In `NAV_ITEMS`, add two entries after the Products item:
```tsx
{ icon: "💸", label: "Payouts", href: "/payouts" },
{ icon: "📊", label: "Commissions", href: "/commissions" },
```

Then extend the `isActive` computation. Replace the existing assignment with:
```tsx
const isActive =
  href === "/"
    ? pathname === "/"
    : href === "/sellers"
      ? (pathname === "/sellers" ||
          (pathname.startsWith("/sellers/") &&
            pathname !== "/sellers/approvals"))
      : href === "/orders"
        ? pathname === "/orders" || pathname.startsWith("/orders/")
        : href === "/products"
          ? pathname === "/products"
          : href === "/payouts"
            ? pathname === "/payouts"
            : href === "/commissions"
              ? pathname === "/commissions"
              : pathname === href;
```

- [ ] **Step 2: Add page titles to `TopBar.tsx`**

Read the file. Add to `PAGE_TITLES`:
```tsx
"/payouts": "Payouts",
"/commissions": "Commissions",
```

- [ ] **Step 3: TypeScript + lint check**

```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/admin && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts" | grep -v "\.next/types" | grep -v "packages/auth/src/middleware"
cd /Users/alialajme/Projects/Luna/e-luna/apps/admin && npx next lint 2>&1 | tail -5
```
Expected: tsc empty; lint clean.

- [ ] **Step 4: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git add "apps/admin/app/(dashboard)/components/Sidebar.tsx" "apps/admin/app/(dashboard)/components/TopBar.tsx" && git commit -m "feat: add Payouts and Commissions nav to admin sidebar and topbar"
```

---

## Task 2: Payout server actions

**Files:**
- Create: `apps/admin/app/actions/payouts.ts`

- [ ] **Step 1: Create the actions file**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma, type PayoutStatus } from "@e-luna/db";
import { getAuthUser } from "@e-luna/auth";

type ActionResult = { success: true } | { error: string };

async function requireAdmin(): Promise<{ ok: true } | ActionResult> {
  const user = await getAuthUser();
  if (!user) return { error: "Unauthorized" };
  if (user.role !== "ADMIN") return { error: "Forbidden" };
  return { ok: true };
}

async function computeAvailableBalance(vendorId: string): Promise<number> {
  const [items, payouts] = await Promise.all([
    prisma.orderItem
      .findMany({
        where: { vendorId, fulfillmentStatus: "DELIVERED" },
        select: { unitPrice: true, quantity: true },
      })
      .catch(() => []),
    prisma.payout
      .findMany({
        where: { vendorId, status: "COMPLETED" },
        select: { amount: true },
      })
      .catch(() => []),
  ]);

  const vendor = await prisma.vendor
    .findUnique({ where: { id: vendorId }, select: { commissionRate: true } })
    .catch(() => null);

  const commissionRate = Number(vendor?.commissionRate ?? 0.15);
  const grossRevenue = items.reduce(
    (sum, i) => sum + Number(i.unitPrice) * i.quantity,
    0
  );
  const netEarned = grossRevenue - grossRevenue * commissionRate;
  const paidOut = payouts.reduce((sum, p) => sum + Number(p.amount), 0);
  return Math.max(0, netEarned - paidOut);
}

export async function createPayout(vendorId: string): Promise<ActionResult> {
  const auth = await requireAdmin();
  if ("error" in auth) return auth;

  const vendor = await prisma.vendor
    .findUnique({ where: { id: vendorId }, select: { ibanNumber: true } })
    .catch(() => null);
  if (!vendor) return { error: "Vendor not found" };
  if (!vendor.ibanNumber) return { error: "Vendor has no IBAN on file" };

  const availableBalance = await computeAvailableBalance(vendorId);
  if (availableBalance <= 0) return { error: "No balance available to pay out" };

  try {
    await prisma.payout.create({
      data: {
        vendorId,
        amount: availableBalance,
        currency: "AED",
        ibanNumber: vendor.ibanNumber,
        status: "PENDING",
      },
    });
    revalidatePath("/payouts");
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Create failed" };
  }
}

async function setPayoutStatus(
  id: string,
  status: PayoutStatus,
  setProcessedAt: boolean
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if ("error" in auth) return auth;

  try {
    await prisma.payout.update({
      where: { id },
      data: setProcessedAt
        ? { status, processedAt: new Date() }
        : { status },
    });
    revalidatePath("/payouts");
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Update failed" };
  }
}

export async function markProcessing(id: string): Promise<ActionResult> {
  return setPayoutStatus(id, "PROCESSING", false);
}

export async function markCompleted(id: string): Promise<ActionResult> {
  return setPayoutStatus(id, "COMPLETED", true);
}

export async function markFailed(id: string): Promise<ActionResult> {
  return setPayoutStatus(id, "FAILED", false);
}
```

**Note:** all exports are async; `requireAdmin`, `computeAvailableBalance`, `setPayoutStatus` are non-exported helpers (required by `"use server"`). If `type PayoutStatus` from `@e-luna/db` errors, use `import type { PayoutStatus } from "@prisma/client"`.

- [ ] **Step 2: TypeScript + lint check**

```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/admin && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts" | grep -v "\.next/types" | grep -v "packages/auth/src/middleware"
cd /Users/alialajme/Projects/Luna/e-luna/apps/admin && npx next lint 2>&1 | tail -5
```
Expected: tsc empty; lint clean.

- [ ] **Step 3: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git add "apps/admin/app/actions/payouts.ts" && git commit -m "feat: payout server actions (create + status transitions) with ADMIN check"
```

---

## Task 3: Commission server action

**Files:**
- Create: `apps/admin/app/actions/commissions.ts`

- [ ] **Step 1: Create the actions file**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@e-luna/db";
import { getAuthUser } from "@e-luna/auth";

type ActionResult = { success: true } | { error: string };

export async function updateCommissionRate(
  vendorId: string,
  percent: number
): Promise<ActionResult> {
  const user = await getAuthUser();
  if (!user) return { error: "Unauthorized" };
  if (user.role !== "ADMIN") return { error: "Forbidden" };

  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    return { error: "Rate must be between 0 and 100" };
  }

  try {
    await prisma.vendor.update({
      where: { id: vendorId },
      data: { commissionRate: percent / 100 },
    });
    revalidatePath("/commissions");
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Update failed" };
  }
}
```

- [ ] **Step 2: TypeScript + lint check**

```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/admin && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts" | grep -v "\.next/types" | grep -v "packages/auth/src/middleware"
cd /Users/alialajme/Projects/Luna/e-luna/apps/admin && npx next lint 2>&1 | tail -5
```
Expected: tsc empty; lint clean.

- [ ] **Step 3: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git add "apps/admin/app/actions/commissions.ts" && git commit -m "feat: updateCommissionRate server action with ADMIN check and range validation"
```

---

## Task 4: Client components (PayoutActions, CreatePayoutButton, CommissionEditor)

**Files:**
- Create: `apps/admin/app/(dashboard)/components/PayoutActions.tsx`
- Create: `apps/admin/app/(dashboard)/components/CreatePayoutButton.tsx`
- Create: `apps/admin/app/(dashboard)/components/CommissionEditor.tsx`

- [ ] **Step 1: Create `PayoutActions.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PayoutStatus } from "@e-luna/db";
import { markProcessing, markCompleted, markFailed } from "../../actions/payouts";

type Props = { payoutId: string; status: PayoutStatus };
type ActionResult = { success: true } | { error: string };

export function PayoutActions({ payoutId, status }: Props) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: (id: string) => Promise<ActionResult>) {
    setIsLoading(true);
    setError(null);
    const result = await action(payoutId);
    if ("error" in result) {
      setError(result.error);
      setIsLoading(false);
      return;
    }
    router.refresh();
    setIsLoading(false);
  }

  const goldBtn =
    "rounded-full bg-gold/20 px-4 py-2 text-body-sm font-medium text-gold hover:bg-gold/30 disabled:opacity-50";
  const sageBtn =
    "rounded-full bg-sage/20 px-4 py-2 text-body-sm font-medium text-sage hover:bg-sage/30 disabled:opacity-50";
  const coralBtn =
    "rounded-full bg-coral/20 px-4 py-2 text-body-sm font-medium text-coral hover:bg-coral/30 disabled:opacity-50";

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-2">
        {status === "PENDING" && (
          <>
            <button onClick={() => run(markProcessing)} disabled={isLoading} className={goldBtn}>
              Mark Processing
            </button>
            <button onClick={() => run(markFailed)} disabled={isLoading} className={coralBtn}>
              Mark Failed
            </button>
          </>
        )}
        {status === "PROCESSING" && (
          <>
            <button onClick={() => run(markCompleted)} disabled={isLoading} className={sageBtn}>
              Mark Completed
            </button>
            <button onClick={() => run(markFailed)} disabled={isLoading} className={coralBtn}>
              Mark Failed
            </button>
          </>
        )}
      </div>
      {error && <p className="text-body-xs text-coral">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Create `CreatePayoutButton.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createPayout } from "../../actions/payouts";

type Props = { vendorId: string; disabled?: boolean };

export function CreatePayoutButton({ vendorId, disabled }: Props) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setIsLoading(true);
    setError(null);
    const result = await createPayout(vendorId);
    if ("error" in result) {
      setError(result.error);
      setIsLoading(false);
      return;
    }
    router.refresh();
    setIsLoading(false);
  }

  return (
    <div className="space-y-1 text-right">
      <button
        onClick={handleClick}
        disabled={disabled || isLoading}
        className="rounded-full bg-sage/20 px-4 py-2 text-body-sm font-medium text-sage hover:bg-sage/30 disabled:opacity-50"
      >
        {isLoading ? "Creating…" : "Create Payout"}
      </button>
      {disabled && <p className="text-body-xs text-mist">No IBAN</p>}
      {error && <p className="text-body-xs text-coral">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Create `CommissionEditor.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateCommissionRate } from "../../actions/commissions";

type Props = { vendorId: string; ratePercent: number };

export function CommissionEditor({ vendorId, ratePercent }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(ratePercent);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setIsLoading(true);
    setError(null);
    const result = await updateCommissionRate(vendorId, value);
    if ("error" in result) {
      setError(result.error);
      setIsLoading(false);
      return;
    }
    setEditing(false);
    setIsLoading(false);
    router.refresh();
  }

  function handleCancel() {
    setValue(ratePercent);
    setError(null);
    setEditing(false);
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-body-sm font-medium text-ink">{ratePercent}%</span>
        <button
          onClick={() => setEditing(true)}
          className="text-body-xs text-gold hover:underline"
        >
          Edit
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={0}
          max={100}
          step={1}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          className="w-16 rounded border border-sand px-2 py-1 text-body-sm text-ink"
        />
        <span className="text-body-xs text-mist">%</span>
        <button
          onClick={handleSave}
          disabled={isLoading}
          className="rounded-full bg-sage/20 px-3 py-1 text-body-xs font-medium text-sage hover:bg-sage/30 disabled:opacity-50"
        >
          Save
        </button>
        <button
          onClick={handleCancel}
          disabled={isLoading}
          className="rounded-full px-3 py-1 text-body-xs text-mist hover:text-ink disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-body-xs text-coral">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 4: TypeScript + lint check**

```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/admin && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts" | grep -v "\.next/types" | grep -v "packages/auth/src/middleware"
cd /Users/alialajme/Projects/Luna/e-luna/apps/admin && npx next lint 2>&1 | tail -5
```
Expected: tsc empty; lint clean.

- [ ] **Step 5: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git add "apps/admin/app/(dashboard)/components/PayoutActions.tsx" "apps/admin/app/(dashboard)/components/CreatePayoutButton.tsx" "apps/admin/app/(dashboard)/components/CommissionEditor.tsx" && git commit -m "feat: payout + commission client action components"
```

---

## Task 5: Payouts page — `/payouts`

**Files:**
- Create: `apps/admin/app/(dashboard)/payouts/page.tsx`

- [ ] **Step 1: Create the payouts page**

```tsx
import { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma, type PayoutStatus } from "@e-luna/db";
import { safeCurrentUser } from "../../lib/auth";
import { StatusFilter } from "../components/StatusFilter";
import { PayoutActions } from "../components/PayoutActions";
import { CreatePayoutButton } from "../components/CreatePayoutButton";

export const metadata: Metadata = { title: "Payouts — Luna Ops" };

const PAYOUT_STATUS_BADGE: Record<string, string> = {
  COMPLETED: "bg-sage/20 text-sage",
  PROCESSING: "bg-gold/20 text-gold",
  PENDING: "bg-sand text-mist",
  FAILED: "bg-coral/20 text-coral",
};

const PAYOUT_FILTERS = [
  { label: "All", value: "all" },
  { label: "Pending", value: "PENDING" },
  { label: "Processing", value: "PROCESSING" },
  { label: "Completed", value: "COMPLETED" },
  { label: "Failed", value: "FAILED" },
];

const VALID: PayoutStatus[] = ["PENDING", "PROCESSING", "COMPLETED", "FAILED"];

function maskIban(iban: string): string {
  if (iban.length <= 8) return iban;
  return iban.slice(0, 4) + "···" + iban.slice(-4);
}

function fmtAED(n: number, dp = 0): string {
  return `AED ${n.toLocaleString("en-AE", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
}

type Props = { searchParams: Promise<{ status?: string }> };

export default async function PayoutsPage({ searchParams }: Props) {
  const user = await safeCurrentUser();
  if (!user) redirect("/");

  const raw = (await searchParams).status ?? "all";

  const [vendors, deliveredItems, payouts] = await Promise.all([
    prisma.vendor
      .findMany({
        where: { status: "ACTIVE" },
        select: { id: true, storeName: true, ibanNumber: true, commissionRate: true },
      })
      .catch(() => []),
    prisma.orderItem
      .findMany({
        where: { fulfillmentStatus: "DELIVERED" },
        select: { vendorId: true, unitPrice: true, quantity: true },
      })
      .catch(() => []),
    prisma.payout
      .findMany({
        orderBy: { createdAt: "desc" },
        include: { vendor: { select: { storeName: true } } },
      })
      .catch(() => []),
  ]);

  // Gross revenue per vendor from delivered items
  const grossByVendor = new Map<string, number>();
  for (const item of deliveredItems) {
    grossByVendor.set(
      item.vendorId,
      (grossByVendor.get(item.vendorId) ?? 0) + Number(item.unitPrice) * item.quantity
    );
  }
  // Completed payout total per vendor
  const paidByVendor = new Map<string, number>();
  for (const p of payouts) {
    if (p.status === "COMPLETED") {
      paidByVendor.set(p.vendorId, (paidByVendor.get(p.vendorId) ?? 0) + Number(p.amount));
    }
  }

  const owed = vendors
    .map((v) => {
      const gross = grossByVendor.get(v.id) ?? 0;
      const rate = Number(v.commissionRate ?? 0.15);
      const netEarned = gross - gross * rate;
      const paidOut = paidByVendor.get(v.id) ?? 0;
      const availableBalance = Math.max(0, netEarned - paidOut);
      return { ...v, netEarned, paidOut, availableBalance };
    })
    .filter((v) => v.availableBalance > 0);

  const history = VALID.includes(raw as PayoutStatus)
    ? payouts.filter((p) => p.status === raw)
    : payouts;

  return (
    <div className="max-w-4xl space-y-8">
      {/* Section 1: Vendors owed */}
      <div className="space-y-4">
        <h2 className="font-display text-display-md text-ink">Vendors owed</h2>
        {owed.length === 0 ? (
          <div className="rounded-lg border border-sand bg-white py-12 text-center">
            <p className="text-body-sm text-mist">No vendors currently owed a payout.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {owed.map((v) => (
              <div
                key={v.id}
                className="flex items-center gap-4 rounded-lg border border-sand bg-white p-4"
              >
                <div className="flex-1 min-w-0">
                  <p className="truncate text-body-sm font-medium text-ink">{v.storeName}</p>
                  <p className="text-body-xs text-mist">
                    Net earned {fmtAED(v.netEarned)} · Paid out {fmtAED(v.paidOut)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-body-xs text-mist">Available</p>
                  <p className="text-body-md font-semibold text-ink">
                    {fmtAED(v.availableBalance)}
                  </p>
                </div>
                <CreatePayoutButton vendorId={v.id} disabled={!v.ibanNumber} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 2: Payout history */}
      <div className="space-y-4">
        <h2 className="font-display text-display-md text-ink">Payout history</h2>
        <StatusFilter status={raw} options={PAYOUT_FILTERS} />
        {history.length === 0 ? (
          <div className="rounded-lg border border-sand bg-white py-12 text-center">
            <p className="text-body-sm text-mist">No payouts found for this filter.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {history.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-4 rounded-lg border border-sand bg-white p-4"
              >
                <div className="flex-1 min-w-0">
                  <p className="truncate text-body-sm font-medium text-ink">
                    {p.vendor.storeName}
                  </p>
                  <p className="text-body-xs text-mist">
                    {maskIban(p.ibanNumber)} · {p.reference ?? "—"}
                  </p>
                </div>
                <p className="shrink-0 text-body-sm font-medium text-ink">
                  {fmtAED(Number(p.amount), 2)}
                </p>
                <p className="shrink-0 text-body-xs text-mist">
                  {new Date(p.createdAt).toLocaleDateString("en-AE", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-body-xs font-medium ${PAYOUT_STATUS_BADGE[p.status] ?? "bg-sand text-mist"}`}
                >
                  {p.status.charAt(0) + p.status.slice(1).toLowerCase()}
                </span>
                <PayoutActions payoutId={p.id} status={p.status} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript + lint check**

```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/admin && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts" | grep -v "\.next/types" | grep -v "packages/auth/src/middleware"
cd /Users/alialajme/Projects/Luna/e-luna/apps/admin && npx next lint 2>&1 | tail -5
```
Expected: tsc empty; lint clean.

- [ ] **Step 3: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git add "apps/admin/app/(dashboard)/payouts/page.tsx" && git commit -m "feat: admin payouts page with vendors-owed and payout history"
```

---

## Task 6: Commissions page — `/commissions`

**Files:**
- Create: `apps/admin/app/(dashboard)/commissions/page.tsx`

- [ ] **Step 1: Create the commissions page**

```tsx
import { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../../lib/auth";
import { CommissionEditor } from "../components/CommissionEditor";

export const metadata: Metadata = { title: "Commissions — Luna Ops" };

const STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-gold/20 text-gold",
  ACTIVE: "bg-sage/20 text-sage",
  SUSPENDED: "bg-coral/20 text-coral",
  REJECTED: "bg-sand text-mist",
};

function fmtAED(n: number): string {
  return `AED ${n.toLocaleString("en-AE", { maximumFractionDigits: 0 })}`;
}

export default async function CommissionsPage() {
  const user = await safeCurrentUser();
  if (!user) redirect("/");

  const [vendors, deliveredItems] = await Promise.all([
    prisma.vendor
      .findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          storeName: true,
          storeSlug: true,
          status: true,
          commissionRate: true,
        },
      })
      .catch(() => []),
    prisma.orderItem
      .findMany({
        where: { fulfillmentStatus: "DELIVERED" },
        select: { vendorId: true, unitPrice: true, quantity: true },
      })
      .catch(() => []),
  ]);

  const grossByVendor = new Map<string, number>();
  for (const item of deliveredItems) {
    grossByVendor.set(
      item.vendorId,
      (grossByVendor.get(item.vendorId) ?? 0) + Number(item.unitPrice) * item.quantity
    );
  }

  const rows = vendors.map((v) => {
    const gross = grossByVendor.get(v.id) ?? 0;
    const commissionRevenue = gross * Number(v.commissionRate);
    return { ...v, commissionRevenue };
  });

  const totalCommission = rows.reduce((sum, r) => sum + r.commissionRevenue, 0);

  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <h2 className="font-display text-display-md text-ink">Commissions</h2>
        <p className="mt-1 text-body-sm text-mist">
          Total platform commission revenue: {fmtAED(totalCommission)}
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-sand bg-white py-16 text-center">
          <p className="text-body-sm text-mist">No vendors yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((v) => (
            <div
              key={v.id}
              className="flex items-center gap-4 rounded-lg border border-sand bg-white p-4"
            >
              <div className="flex-1 min-w-0">
                <p className="truncate text-body-sm font-medium text-ink">{v.storeName}</p>
                <p className="text-body-xs text-mist">@{v.storeSlug}</p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-body-xs font-medium ${STATUS_BADGE[v.status] ?? "bg-sand text-mist"}`}
              >
                {v.status.charAt(0) + v.status.slice(1).toLowerCase()}
              </span>
              <div className="shrink-0 text-right">
                <p className="text-body-xs text-mist">Commission earned</p>
                <p className="text-body-sm text-ink">{fmtAED(v.commissionRevenue)}</p>
              </div>
              <CommissionEditor
                vendorId={v.id}
                ratePercent={Math.round(Number(v.commissionRate) * 100)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: TypeScript + lint check**

```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/admin && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts" | grep -v "\.next/types" | grep -v "packages/auth/src/middleware"
cd /Users/alialajme/Projects/Luna/e-luna/apps/admin && npx next lint 2>&1 | tail -5
```
Expected: tsc empty; lint clean.

- [ ] **Step 3: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git add "apps/admin/app/(dashboard)/commissions/page.tsx" && git commit -m "feat: admin commissions page with per-vendor rate editing"
```

---

## Task 7: Final verification

**Files:** None (verification only)

- [ ] **Step 1: Full repo typecheck (exact CI command)**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && pnpm --filter "@e-luna/*" exec tsc --noEmit; echo "EXIT: $?"
```
Expected: `EXIT: 0` (all 8 packages/apps clean).

- [ ] **Step 2: Full repo lint (exact CI command)**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && pnpm lint 2>&1 | tail -6
```
Expected: `Tasks: 3 successful, 3 total`, admin `✔ No ESLint warnings or errors`.

- [ ] **Step 3: Confirm route files + git log**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && find "apps/admin/app/(dashboard)/payouts" "apps/admin/app/(dashboard)/commissions" -name "*.tsx" | sort && ls apps/admin/app/actions/payouts.ts apps/admin/app/actions/commissions.ts "apps/admin/app/(dashboard)/components/PayoutActions.tsx" "apps/admin/app/(dashboard)/components/CreatePayoutButton.tsx" "apps/admin/app/(dashboard)/components/CommissionEditor.tsx" && git log --oneline -6
```
Expected files: `payouts/page.tsx`, `commissions/page.tsx`, the two action files, the three components.

Expected commits (newest first):
- feat: admin commissions page with per-vendor rate editing
- feat: admin payouts page with vendors-owed and payout history
- feat: payout + commission client action components
- feat: updateCommissionRate server action with ADMIN check and range validation
- feat: payout server actions (create + status transitions) with ADMIN check
- feat: add Payouts and Commissions nav to admin sidebar and topbar

Report the actual SHAs.
