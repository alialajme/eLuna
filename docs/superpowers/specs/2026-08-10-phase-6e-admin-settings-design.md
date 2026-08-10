# Phase 6e: Admin Settings (Platform Settings / Feature Flags) — Design Spec

## Goal

Give admins a settings surface: a `PlatformSetting` key/value store (the first admin schema addition), a typed registry + `getSetting` helper in `@e-luna/db`, an admin CRUD page, and real wiring of a small set of currently-hardcoded values (checkout free-shipping threshold/fee) plus a site-wide maintenance banner. Absent settings fall back to today's defaults, so deploying 6e changes nothing until an admin edits.

---

## Scope

**In scope:**
- `PlatformSetting` model + a fixed typed registry (`SETTINGS`) with `getSetting`/`getAllSettings`/`setSetting` in `@e-luna/db`.
- Admin `/settings` CRUD page + `updateSetting` action (ADMIN-gated) + a nav item.
- Wire `free_shipping_threshold` + `shipping_fee` into customer checkout; wire `maintenance_banner` into the customer root layout.

**Out of scope (deferred):**
- Category management (turning `Product.category` into a managed list) — a separate cross-app phase.
- Free-form / arbitrary setting keys — the registry is fixed and typed.
- Per-vendor or per-user settings — this is platform-global only.
- Caching `getSetting` (per-request reads; the table is tiny + PK-indexed).
- Audit trail (`updatedBy`) — YAGNI.

---

## Architecture

### Current state (verified)
- Admin app `(dashboard)/` has analytics/commissions/customers/fraud/orders/payouts/products/sellers — **no settings**. Nav = `apps/admin/app/(dashboard)/components/Sidebar.tsx` (`NAV_ITEMS` array; the active-check ends in a `pathname === href` fallback, so a new item works with no ternary edit).
- Admin actions use `getAuthUser()` from `@e-luna/auth`; pattern: `if (!user) return { error: "Unauthorized" }; if (user.role !== "ADMIN") return { error: "Forbidden" };`. `ActionResult = { success: true } | { error: string }`.
- `Product.category` is a free-form `String` (unrelated to this phase).
- Customer checkout hardcodes `SHIPPING_THRESHOLD = 500` / `SHIPPING_FEE = 15` in `apps/customer/app/actions/checkout.ts` (used in `placeOrder` + `initiateCardPayment`) and again in `apps/customer/app/checkout/page.tsx`.
- Customer root `apps/customer/app/layout.tsx` is a **non-async** server component rendering `<Nav/>`, `<main>`, `<Footer/>`, and the Shopping widget.
- `packages/db` barrel (`src/index.ts`) exports `prisma` + `@prisma/client`; it's a dep of every app. Prisma accessor for the new model: `prisma.platformSetting`.

### Schema (additive, `db push`)
```prisma
model PlatformSetting {
  key       String   @id
  value     String
  updatedAt DateTime @updatedAt
  createdAt DateTime @default(now())
}
```

### Settings module — `packages/db/src/settings.ts`
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
  if (type === "number") { const n = Number(raw); return Number.isFinite(n) ? n : def; }
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
`getSetting("free_shipping_threshold")` is typed `number`; `getSetting("maintenance_banner")` is `string`. `getSetting` is `.catch`-guarded → returns the registry default on any DB error (checkout/layout never break). `packages/db/src/index.ts` adds `export * from "./settings";`.

### Files
```
packages/db/prisma/schema.prisma                          — PlatformSetting model
packages/db/src/settings.ts                                — CREATE registry + helpers
packages/db/src/index.ts                                   — export * from "./settings"
apps/admin/app/actions/settings.ts                         — CREATE updateSetting (ADMIN-gated)
apps/admin/app/(dashboard)/settings/page.tsx               — CREATE settings page
apps/admin/app/(dashboard)/settings/SettingsForm.tsx       — CREATE client form
apps/admin/app/(dashboard)/components/Sidebar.tsx          — add "Settings" nav item
apps/customer/app/actions/checkout.ts                      — getSetting shipping (placeOrder + initiateCardPayment)
apps/customer/app/checkout/page.tsx                        — getSetting shipping
apps/customer/app/layout.tsx                               — maintenance banner (async)
```

---

## Admin action — `apps/admin/app/actions/settings.ts`

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

## Admin page — `apps/admin/app/(dashboard)/settings/page.tsx`

Server component: renders a heading + `<SettingsForm settings={SETTINGS} values={await getAllSettings()} />`. (The `(dashboard)` layout + middleware already gate ADMIN; the action re-checks defense-in-depth.) Imports `SETTINGS`, `getAllSettings` from `@e-luna/db`. Passes the registry (as a serializable array of `{ key, label, type }`) + current values to the client form.

## Admin form — `apps/admin/app/(dashboard)/settings/SettingsForm.tsx`

Client component (`useTransition`). For each registry entry, renders a labeled control by `type` (`number` → number input, `boolean` → checkbox, `string` → text input) seeded with the current value, and a **Save** button per row that calls `updateSetting(key, String(value))` → inline "Saved"/error + `router.refresh()`. Sage-accent admin styling (Warm Oud tokens).

## Nav — `Sidebar.tsx`

Add to `NAV_ITEMS` (e.g. after Fraud): `{ icon: "⚙️", label: "Settings", href: "/settings" }`. The active-check's `pathname === href` fallback handles it.

---

## Real wiring

### Checkout free-shipping — `apps/customer/app/actions/checkout.ts` + `checkout/page.tsx`
Add `import { getSetting } from "@e-luna/db";`. Remove the module-level `SHIPPING_THRESHOLD`/`SHIPPING_FEE` consts. In each place that computed `shippingFee` (both `placeOrder` and `initiateCardPayment` in the action, and the `checkout/page.tsx` RSC), replace with:
```ts
    const threshold = await getSetting("free_shipping_threshold");
    const fee = await getSetting("shipping_fee");
    const shippingFee = subtotal >= threshold ? 0 : fee;
```

### Maintenance banner — `apps/customer/app/layout.tsx`
Make `RootLayout` `async`; add `import { getSetting } from "@e-luna/db";` and `const maintenanceBanner = await getSetting("maintenance_banner");`. Inside `<body>`, immediately above `<Nav />`, render when non-empty:
```tsx
{maintenanceBanner && (
  <div className="bg-gold px-4 py-2 text-center text-body-sm font-medium text-ink">
    {maintenanceBanner}
  </div>
)}
```

---

## Error Handling

- `updateSetting`: ADMIN-gated (`getAuthUser` → Unauthorized/Forbidden); `setSetting` validates the key is in the registry and the value coerces to the declared type (rejects a non-numeric number / non-boolean) → error surfaced in the form.
- **`getSetting`/`getAllSettings` are `.catch`-guarded** → registry defaults on any DB error, so checkout and the layout are never broken by a settings failure.
- Absent settings → defaults = today's behavior (no change on deploy until edited).
- The maintenance banner only renders when the string is non-empty.

---

## Testing

No automated suite (repo-consistent). Per task:
```bash
pnpm --filter @e-luna/db db:generate                                       # regen client for PlatformSetting
cd apps/admin && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts"       # clean
cd apps/customer && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts"    # clean
# lint admin + customer
```
Final task: repo-wide `pnpm lint` + `pnpm --filter "@e-luna/*" exec tsc --noEmit`.

**Operator:** `pnpm --filter @e-luna/db db:push` to add `PlatformSetting`. **Manual smoke (DB):** admin `/settings` → change the free-shipping threshold → a customer's checkout uses the new value; set a maintenance banner → it appears site-wide; clear it → banner gone.

---

## Boundary

This is platform-global settings only. **Category management** (managed `Category` list replacing the free-form `Product.category`) is a separate future phase spanning customer/vendor/admin. New settings are added by extending the `SETTINGS` registry (and wiring the read where needed) — no schema change per new setting.
