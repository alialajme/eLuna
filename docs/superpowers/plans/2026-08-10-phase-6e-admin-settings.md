# Phase 6e: Admin Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An admin platform-settings store — a `PlatformSetting` key/value model + typed registry/helper in `@e-luna/db`, an ADMIN-gated `/settings` CRUD page, and real wiring (checkout free-shipping + a maintenance banner).

**Architecture:** `PlatformSetting { key @id, value }`; a fixed typed `SETTINGS` registry with `getSetting`/`getAllSettings`/`setSetting` (default-fallback, `.catch`-guarded) in `@e-luna/db`; an admin page/form + `updateSetting` action; customer checkout + root layout read `getSetting`.

**Tech Stack:** Next.js 15 (App Router), Prisma + PostgreSQL (`db push`, no migration files), TypeScript (`noUncheckedIndexedAccess` on), Clerk, `@e-luna/auth` `getAuthUser`.

---

## Context for the implementer (read once)

- **No automated test suite.** "Tests" = `npx tsc --noEmit` and `npx next lint`. Repo uses **`prisma db push`** (no migration files); after editing `schema.prisma`, run `pnpm --filter @e-luna/db db:generate` (offline) to regen the client. `db push` to a live DB is an operator step.
- **`noUncheckedIndexedAccess` is ON** (`arr[k] ?? fallback`).
- **Verified state:**
  - `packages/db/src/index.ts` = `export { prisma } from "./client"; export * from "@prisma/client";`. Prisma accessor for the new model: `prisma.platformSetting`.
  - Admin actions: `import { getAuthUser } from "@e-luna/auth";` then `if (!user) return { error: "Unauthorized" }; if (user.role !== "ADMIN") return { error: "Forbidden" };`. `ActionResult = { success: true } | { error: string }`.
  - Admin nav `apps/admin/app/(dashboard)/components/Sidebar.tsx` — `NAV_ITEMS` array (Overview/Sellers/Approvals/Orders/Products/Payouts/Commissions/Analytics/Customers/Fraud); active-check ends in a `pathname === href` fallback (a new item needs no ternary edit). The `(dashboard)` layout + middleware already gate ADMIN.
  - `apps/customer/app/actions/checkout.ts`: `import { prisma } from "@e-luna/db";` (line ~5); module consts `SHIPPING_THRESHOLD = 500` (line 13) / `SHIPPING_FEE = 15` (line 14); `const shippingFee = subtotal >= SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;` at **line 81** (`placeOrder`) and **line 196** (`initiateCardPayment`).
  - `apps/customer/app/checkout/page.tsx`: `import { prisma } from "@e-luna/db";` (line 4); consts at lines 14-15; usage `const shippingFee = subtotal >= SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;` at line 50; the component is already `async`.
  - `apps/customer/app/layout.tsx`: `export default function RootLayout(...)` (NON-async) rendering `<RTLProvider><Nav /><main>{children}</main><Footer /><LunaChatWidget .../></RTLProvider>`.

---

## File Structure

```
packages/db/prisma/schema.prisma                          — PlatformSetting model
packages/db/src/settings.ts                                — CREATE registry + getSetting/getAllSettings/setSetting
packages/db/src/index.ts                                   — export * from "./settings"
apps/admin/app/actions/settings.ts                         — CREATE updateSetting (ADMIN-gated)
apps/admin/app/(dashboard)/settings/page.tsx               — CREATE settings page
apps/admin/app/(dashboard)/settings/SettingsForm.tsx       — CREATE client form
apps/admin/app/(dashboard)/components/Sidebar.tsx          — add "Settings" nav item
apps/customer/app/actions/checkout.ts                      — getSetting shipping (2 sites)
apps/customer/app/checkout/page.tsx                        — getSetting shipping
apps/customer/app/layout.tsx                               — maintenance banner (async)
```

---

## Task 1: Schema + settings module + regen

**Files:** Modify `packages/db/prisma/schema.prisma`; Create `packages/db/src/settings.ts`; Modify `packages/db/src/index.ts`.

- [ ] **Step 1: Add the `PlatformSetting` model to `packages/db/prisma/schema.prisma`**

Append (anywhere at model level, e.g. near the other config-ish models):
```prisma
model PlatformSetting {
  key       String   @id
  value     String
  updatedAt DateTime @updatedAt
  createdAt DateTime @default(now())
}
```

- [ ] **Step 2: Create `packages/db/src/settings.ts`**

```ts
import { prisma } from "./client";

export const SETTINGS = {
  free_shipping_threshold: { label: "Free shipping over (AED)", type: "number", default: 500 },
  shipping_fee:            { label: "Shipping fee (AED)",       type: "number", default: 15 },
  maintenance_banner:      { label: "Maintenance banner text",  type: "string", default: "" },
} as const;

export type SettingKey = keyof typeof SETTINGS;
type ValueType<T extends string> = T extends "number" ? number : T extends "boolean" ? boolean : string;

function coerce(type: string, raw: string, def: number | boolean | string): number | boolean | string {
  if (type === "number") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : def;
  }
  if (type === "boolean") return raw === "true";
  return raw;
}

export async function getSetting<K extends SettingKey>(
  key: K,
): Promise<ValueType<(typeof SETTINGS)[K]["type"]>> {
  const def = SETTINGS[key].default;
  const row = await prisma.platformSetting
    .findUnique({ where: { key }, select: { value: true } })
    .catch(() => null);
  const value = row ? coerce(SETTINGS[key].type, row.value, def) : def;
  return value as ValueType<(typeof SETTINGS)[K]["type"]>;
}

export async function getAllSettings(): Promise<Record<SettingKey, number | boolean | string>> {
  const rows = await prisma.platformSetting.findMany({ select: { key: true, value: true } }).catch(() => []);
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const out = {} as Record<SettingKey, number | boolean | string>;
  for (const key of Object.keys(SETTINGS) as SettingKey[]) {
    const raw = byKey.get(key);
    out[key] = raw === undefined ? SETTINGS[key].default : coerce(SETTINGS[key].type, raw, SETTINGS[key].default);
  }
  return out;
}

export async function setSetting(key: string, value: string): Promise<{ ok: boolean; error?: string }> {
  if (!(key in SETTINGS)) return { ok: false, error: "Unknown setting" };
  const type = SETTINGS[key as SettingKey].type;
  if (type === "number" && !Number.isFinite(Number(value))) return { ok: false, error: "Must be a number" };
  if (type === "boolean" && value !== "true" && value !== "false") return { ok: false, error: "Must be true or false" };
  try {
    await prisma.platformSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
    return { ok: true };
  } catch {
    return { ok: false, error: "Failed to save" };
  }
}
```

- [ ] **Step 3: Export from `packages/db/src/index.ts`**

Append:
```ts
export * from "./settings";
```

- [ ] **Step 4: Regenerate the Prisma client (offline)**

Run: `cd /Users/alialajme/Projects/Luna/e-luna && pnpm --filter @e-luna/db db:generate`
Expected: "Generated Prisma Client" success (`prisma.platformSetting` now exists).

- [ ] **Step 5: Type-check the db package**

Run: `cd /Users/alialajme/Projects/Luna/e-luna && pnpm --filter @e-luna/db exec tsc --noEmit 2>&1 | tail -6`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna
git add packages/db/prisma/schema.prisma packages/db/src/settings.ts packages/db/src/index.ts
git commit -m "feat(db): PlatformSetting model + typed settings registry/helpers (6e)

Add getSetting/getAllSettings/setSetting over a fixed typed SETTINGS registry;
default-fallback + .catch-guarded so a settings failure never breaks callers.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Admin settings page, form, action, nav

**Files:** Create `apps/admin/app/actions/settings.ts`, `apps/admin/app/(dashboard)/settings/page.tsx`, `apps/admin/app/(dashboard)/settings/SettingsForm.tsx`; Modify `apps/admin/app/(dashboard)/components/Sidebar.tsx`.

- [ ] **Step 1: Create `apps/admin/app/actions/settings.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { setSetting, type SettingKey } from "@e-luna/db";
import { getAuthUser } from "@e-luna/auth";

type ActionResult = { success: true } | { error: string };

export async function updateSetting(key: SettingKey, value: string): Promise<ActionResult> {
  const user = await getAuthUser();
  if (!user) return { error: "Unauthorized" };
  if (user.role !== "ADMIN") return { error: "Forbidden" };

  const r = await setSetting(key, value);
  if (!r.ok) return { error: r.error ?? "Invalid setting" };
  revalidatePath("/settings");
  return { success: true };
}
```

- [ ] **Step 2: Create `apps/admin/app/(dashboard)/settings/SettingsForm.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SettingKey } from "@e-luna/db";
import { updateSetting } from "../../actions/settings";

type Field = { key: string; label: string; type: "number" | "boolean" | "string" };
type Props = { fields: Field[]; values: Record<string, number | boolean | string> };

export function SettingsForm({ fields, values }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [state, setState] = useState<Record<string, string>>(
    Object.fromEntries(fields.map((f) => [f.key, String(values[f.key] ?? "")])),
  );
  const [msg, setMsg] = useState<Record<string, string>>({});

  const save = (key: string) => {
    setMsg((m) => ({ ...m, [key]: "" }));
    startTransition(async () => {
      const r = await updateSetting(key as SettingKey, state[key] ?? "");
      if ("error" in r) {
        setMsg((m) => ({ ...m, [key]: r.error }));
        return;
      }
      setMsg((m) => ({ ...m, [key]: "Saved" }));
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      {fields.map((f) => (
        <div key={f.key} className="rounded-lg border border-sand bg-ivory p-4">
          <label className="mb-2 block text-body-sm font-medium text-ink">{f.label}</label>
          <div className="flex items-center gap-3">
            {f.type === "boolean" ? (
              <input
                type="checkbox"
                checked={state[f.key] === "true"}
                onChange={(e) => setState((s) => ({ ...s, [f.key]: e.target.checked ? "true" : "false" }))}
                className="h-5 w-5 accent-sage"
              />
            ) : (
              <input
                type={f.type === "number" ? "number" : "text"}
                value={state[f.key] ?? ""}
                onChange={(e) => setState((s) => ({ ...s, [f.key]: e.target.value }))}
                className="flex-1 rounded-lg border border-sand bg-white px-3 py-2 text-body-sm text-ink"
              />
            )}
            <button
              type="button"
              onClick={() => save(f.key)}
              disabled={isPending}
              className="rounded-full bg-ink px-4 py-2 text-body-sm font-medium text-ivory hover:bg-sage hover:text-ink disabled:opacity-50 transition-colors"
            >
              {isPending ? "…" : "Save"}
            </button>
          </div>
          {msg[f.key] && (
            <p className={`mt-1 text-body-xs ${msg[f.key] === "Saved" ? "text-sage" : "text-coral"}`}>
              {msg[f.key]}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create `apps/admin/app/(dashboard)/settings/page.tsx`**

```tsx
import { Metadata } from "next";
import { SETTINGS, getAllSettings } from "@e-luna/db";
import { SettingsForm } from "./SettingsForm";

export const metadata: Metadata = { title: "Settings — Luna Ops" };

export default async function SettingsPage() {
  const values = await getAllSettings();
  const fields = Object.entries(SETTINGS).map(([key, def]) => ({
    key,
    label: def.label,
    type: def.type,
  }));

  return (
    <div className="max-w-2xl space-y-5">
      <h2 className="font-display text-display-md text-ink">Settings</h2>
      <p className="text-body-md text-mist">Platform-wide configuration.</p>
      <SettingsForm fields={fields} values={values} />
    </div>
  );
}
```

- [ ] **Step 4: Add the "Settings" nav item in `Sidebar.tsx`**

In `apps/admin/app/(dashboard)/components/Sidebar.tsx`, in `NAV_ITEMS`, add after the Fraud entry (`{ icon: "🛡️", label: "Fraud", href: "/fraud" },`):
```tsx
  { icon: "⚙️", label: "Settings", href: "/settings" },
```

- [ ] **Step 5: Type-check + lint the admin app**

Run:
```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/admin
npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts" | tail -8
npx next lint 2>&1 | tail -5
```
Expected: tsc clean; no new lint errors. (`def.type` is the literal union `"number"|"boolean"|"string"`, matching `Field.type`; `values` is serializable primitives.)

- [ ] **Step 6: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna
git add apps/admin/app/actions/settings.ts "apps/admin/app/(dashboard)/settings/page.tsx" "apps/admin/app/(dashboard)/settings/SettingsForm.tsx" "apps/admin/app/(dashboard)/components/Sidebar.tsx"
git commit -m "feat(admin): platform settings CRUD page + nav (6e)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Wire settings into customer checkout + banner

**Files:** Modify `apps/customer/app/actions/checkout.ts`, `apps/customer/app/checkout/page.tsx`, `apps/customer/app/layout.tsx`.

- [ ] **Step 1: `checkout.ts` — import `getSetting` + remove the module consts**

Change `import { prisma } from "@e-luna/db";` to:
```ts
import { prisma, getSetting } from "@e-luna/db";
```
Delete the two module-level lines:
```ts
const SHIPPING_THRESHOLD = 500;
const SHIPPING_FEE = 15;
```

- [ ] **Step 2: `checkout.ts` — replace BOTH `shippingFee` computations**

In `placeOrder` (was line 81) AND `initiateCardPayment` (was line 196), replace each:
```ts
    const shippingFee = subtotal >= SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
```
with:
```ts
    const threshold = await getSetting("free_shipping_threshold");
    const fee = await getSetting("shipping_fee");
    const shippingFee = subtotal >= threshold ? 0 : fee;
```
(Both functions are already `async`.)

- [ ] **Step 3: `checkout/page.tsx` — same treatment**

Change `import { prisma } from "@e-luna/db";` to `import { prisma, getSetting } from "@e-luna/db";`. Delete the consts:
```ts
const SHIPPING_THRESHOLD = 500;
const SHIPPING_FEE = 15;
```
Replace (was line 50):
```ts
  const shippingFee = subtotal >= SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
```
with:
```ts
  const threshold = await getSetting("free_shipping_threshold");
  const fee = await getSetting("shipping_fee");
  const shippingFee = subtotal >= threshold ? 0 : fee;
```
(The component is already `async`.)

- [ ] **Step 4: `layout.tsx` — async + maintenance banner**

Add `import { getSetting } from "@e-luna/db";` to the imports. Change the signature:
```tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
```
to:
```tsx
export default async function RootLayout({ children }: { children: React.ReactNode }) {
```
Immediately inside the function body (before `return`), add:
```tsx
  const maintenanceBanner = await getSetting("maintenance_banner");
```
Then, inside `<body>`, immediately BEFORE `<Nav />`, add:
```tsx
            {maintenanceBanner && (
              <div className="bg-gold px-4 py-2 text-center text-body-sm font-medium text-ink">
                {maintenanceBanner}
              </div>
            )}
```

- [ ] **Step 5: Type-check + lint the customer app**

Run:
```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/customer
npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts" | tail -8
npx next lint 2>&1 | tail -5
```
Expected: tsc clean (`getSetting("free_shipping_threshold")` is typed `number`; `maintenance_banner` is `string`); no new lint errors. Confirm no leftover `SHIPPING_THRESHOLD`/`SHIPPING_FEE` references remain (they'd error).

- [ ] **Step 6: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna
git add apps/customer/app/actions/checkout.ts apps/customer/app/checkout/page.tsx apps/customer/app/layout.tsx
git commit -m "feat(customer): read free-shipping + maintenance banner from platform settings (6e)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Repo-wide green check

**Files:** none (verification only).

- [ ] **Step 1: Frozen install + regen**

Run:
```bash
cd /Users/alialajme/Projects/Luna/e-luna
pnpm install --frozen-lockfile 2>&1 | tail -3
pnpm --filter @e-luna/db db:generate 2>&1 | tail -2
```
Expected: no lockfile change; client regen succeeds.

- [ ] **Step 2: Confirm no stale shipping consts in the customer app**

Run: `grep -rn "SHIPPING_THRESHOLD\|SHIPPING_FEE" apps/customer && echo "STALE (bad)" || echo "no stale shipping consts (good)"`
Expected: no matches.

- [ ] **Step 3: Repo-wide lint**

Run: `cd /Users/alialajme/Projects/Luna/e-luna && pnpm lint 2>&1 | tail -12`
Expected: all apps pass (pre-existing `<img>` warnings acceptable).

- [ ] **Step 4: Repo-wide type check**

Run: `cd /Users/alialajme/Projects/Luna/e-luna && pnpm --filter "@e-luna/*" exec tsc --noEmit 2>&1 | tail -12`
Expected: clean (includes `@e-luna/db` with the new settings module).

- [ ] **Step 5: Confirm the wiring (inspection)**

Run:
```bash
cd /Users/alialajme/Projects/Luna/e-luna
grep -c 'getSetting("free_shipping_threshold")' apps/customer/app/actions/checkout.ts   # expect 2
grep -c 'getSetting("free_shipping_threshold")' apps/customer/app/checkout/page.tsx     # expect 1
grep -n "model PlatformSetting" packages/db/prisma/schema.prisma
grep -n 'label: "Settings"' "apps/admin/app/(dashboard)/components/Sidebar.tsx"
```
Expected: 2 + 1 checkout reads; the model + the nav item present.

- [ ] **Step 6: Final commit (only if Steps 3-4 required fixes; otherwise skip)**

```bash
cd /Users/alialajme/Projects/Luna/e-luna
git add -A
git commit -m "chore(6e): lint/type fixes for admin settings

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 7: Manual/operator smoke note (not automated)**

`pnpm --filter @e-luna/db db:push` applies `PlatformSetting`. Smoke (running apps + DB): admin `/settings` → change the free-shipping threshold → a customer's checkout uses the new value; set a maintenance banner → it appears site-wide; clear it → gone. Absent settings = today's defaults (no change on deploy).

---

## Self-Review (completed)

**Spec coverage:**
- `PlatformSetting` model → Task 1 ✓
- Typed `SETTINGS` registry + `getSetting`/`getAllSettings`/`setSetting` (default-fallback, `.catch`-guarded) → Task 1 ✓
- Admin `/settings` page + `SettingsForm` + `updateSetting` (ADMIN-gated) + nav → Task 2 ✓
- Checkout free-shipping wiring (2 action sites + page) → Task 3 ✓
- Maintenance banner (async root layout) → Task 3 ✓
- Repo-wide green + stale-const check → Task 4 ✓

**Placeholder scan:** none — every code step is complete.

**Type consistency:** `getSetting`/`getAllSettings`/`setSetting`/`SETTINGS`/`SettingKey` signatures match between `settings.ts` (Task 1), the admin action/page (Task 2), and the customer reads (Task 3). `updateSetting(key: SettingKey, value: string)` matches the form's `updateSetting(key as SettingKey, ...)` call. `Field.type` (`"number"|"boolean"|"string"`) matches the registry's `type`. `ActionResult` = `{success:true}|{error:string}` narrowed via `"error" in r`. `prisma.platformSetting` accessor matches the model name.
```
