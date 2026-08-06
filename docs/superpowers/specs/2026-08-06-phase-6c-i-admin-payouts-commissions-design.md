# Phase 6c-i: Admin Console — Payouts + Commissions — Design Spec

## Goal

Extend the admin console with the vendor-money loop: a payouts console where admins compute what each vendor is owed, initiate payouts, and settle them through their status lifecycle; and a commissions page where admins edit each vendor's commission rate. Analytics/charts are a separate sub-project (6c-ii). Fraud/customers/settings are 6d.

---

## Scope

| Route | Description |
|-------|-------------|
| `/payouts` | Vendors owed a balance (with Create Payout) + full payout history (with process actions) |
| `/commissions` | All vendors with editable per-vendor commission rate + commission revenue |

**In scope:** compute available balance per vendor, create payouts, advance payout status (PENDING→PROCESSING→COMPLETED / →FAILED), edit per-vendor commission rate, three server-action files hardened with the ADMIN check.

**Out of scope:** analytics dashboards & charts (6c-ii), global default commission setting (the schema's per-vendor default of 0.15 already acts as the effective global default), automated/scheduled payouts, real bank transfers (status is manual/simulated), editing payout amounts after creation, refund/clawback flows.

---

## Architecture

Two RSC routes under `apps/admin/app/(dashboard)/` — the layout already enforces the ADMIN role via `getAuthUser()` (6a). No schema changes. Reads from existing `Payout`, `Vendor`, `OrderItem`. Reuses the generic `StatusFilter` (6b) for payout-history filtering.

### Files

```
apps/admin/app/
├── (dashboard)/
│   ├── components/
│   │   ├── Sidebar.tsx            — MODIFY: add Payouts + Commissions nav
│   │   ├── TopBar.tsx            — MODIFY: add page titles
│   │   ├── PayoutActions.tsx     — CREATE: client status buttons (Processing/Completed/Failed)
│   │   ├── CreatePayoutButton.tsx — CREATE: client "Create Payout" button
│   │   └── CommissionEditor.tsx  — CREATE: client inline rate editor
│   ├── payouts/
│   │   └── page.tsx              — CREATE: vendors-owed + payout history
│   └── commissions/
│       └── page.tsx             — CREATE: vendor list + rate editing
└── actions/
    ├── payouts.ts               — CREATE: createPayout, markProcessing, markCompleted, markFailed
    └── commissions.ts           — CREATE: updateCommissionRate
```

---

## Shared Money Logic (matches the vendor payouts page exactly)

For a given vendor:
- `grossRevenue` = Σ over that vendor's `OrderItem` where `fulfillmentStatus === "DELIVERED"` of `Number(unitPrice) * quantity`
- `commissionRate` = `Number(vendor.commissionRate ?? 0.15)`
- `platformFee` = `grossRevenue * commissionRate`
- `netEarned` = `grossRevenue - platformFee`
- `paidOut` = Σ of `Number(amount)` over that vendor's `Payout` where `status === "COMPLETED"`
- `availableBalance` = `Math.max(0, netEarned - paidOut)`

**maskIban(iban)** = `iban.slice(0, 4) + "···" + iban.slice(-4)` (same as vendor/seller pages).

Currency formatting: `AED ${n.toLocaleString("en-AE", { maximumFractionDigits: 0 })}` for summary figures; `minimumFractionDigits: 2` for precise payout amounts.

---

## Sidebar + TopBar (modify)

**Sidebar** — add after the Products nav item:
```tsx
{ icon: "💸", label: "Payouts", href: "/payouts" },
{ icon: "📊", label: "Commissions", href: "/commissions" },
```
Extend `isActive` so `/payouts` matches `/payouts` and `/commissions` matches `/commissions` (both exact — no sub-routes). Follow the existing nested-ternary pattern.

**TopBar** — add to `PAGE_TITLES`: `"/payouts": "Payouts"`, `"/commissions": "Commissions"`.

---

## Payouts Page — `/payouts` (`(dashboard)/payouts/page.tsx`)

RSC. `searchParams: Promise<{ status?: string }>` awaited (for the history filter). null-user → `redirect("/")`.

### Data fetching (parallel, `.catch()`-guarded)

1. All ACTIVE vendors: `prisma.vendor.findMany({ where: { status: "ACTIVE" }, select: { id, storeName, ibanNumber, commissionRate } })`.
2. All DELIVERED order items grouped-in-memory by vendor: `prisma.orderItem.findMany({ where: { fulfillmentStatus: "DELIVERED" }, select: { vendorId, unitPrice, quantity } })`.
3. All payouts (with vendor store name) for both the paidOut computation and the history list: `prisma.payout.findMany({ orderBy: { createdAt: "desc" }, include: { vendor: { select: { storeName: true } } } })`.

Compute per-vendor `grossRevenue` (from #2), `paidOut` (COMPLETED payouts from #3), and `availableBalance` using the shared formula.

### Section ① — Vendors owed

Header "Vendors owed". For each ACTIVE vendor with `availableBalance > 0`, a card/row: store name, net earned, paid out, **available balance** (bold), and `<CreatePayoutButton vendorId={vendor.id} disabled={!vendor.ibanNumber} />`. If `!ibanNumber`, the button is disabled with a "No IBAN" note. Vendors with zero balance are omitted. Empty state: "No vendors currently owed a payout."

### Section ② — Payout history

Header "Payout history" + `<StatusFilter status={raw} options={PAYOUT_FILTERS} />`. The `status` searchParam filters the already-fetched payouts in memory (or refetch with `where` — either is fine; prefer filtering in memory since payouts are already loaded). Each row: vendor store name, amount (AED, 2dp), masked IBAN, reference (`?? "—"`), created date, status badge, and `<PayoutActions payoutId={p.id} status={p.status} />`. Empty state: "No payouts found for this filter."

`PAYOUT_FILTERS` = All / Pending / Processing / Completed / Failed.

### Payout-status badge map (`PAYOUT_STATUS_BADGE`)
```
COMPLETED:  "bg-sage/20 text-sage"
PROCESSING: "bg-gold/20 text-gold"
PENDING:    "bg-sand text-mist"
FAILED:     "bg-coral/20 text-coral"
```
Fallback `"bg-sand text-mist"`.

---

## Commissions Page — `/commissions` (`(dashboard)/commissions/page.tsx`)

RSC. null-user → `redirect("/")`. No searchParams.

### Data fetching (parallel, `.catch()`-guarded)

1. All vendors: `prisma.vendor.findMany({ orderBy: { createdAt: "desc" }, select: { id, storeName, storeSlug, status, commissionRate } })`.
2. All DELIVERED order items: `prisma.orderItem.findMany({ where: { fulfillmentStatus: "DELIVERED" }, select: { vendorId, unitPrice, quantity } })`.

Per vendor: `grossRevenue` (from #2), `commissionRevenue` = `grossRevenue * Number(commissionRate)`.

### Layout

Header "Commissions" + a summary line: total platform commission revenue = Σ of all vendors' `commissionRevenue`.

Each vendor row: store name, `@slug`, status badge (reuse the vendor STATUS_BADGE map: PENDING→gold, ACTIVE→sage, SUSPENDED→coral, REJECTED→sand/mist), **commission revenue** (`AED …`), and `<CommissionEditor vendorId={v.id} ratePercent={Math.round(Number(v.commissionRate) * 100)} />`.

Empty state: "No vendors yet."

---

## Client Components

### `CreatePayoutButton.tsx` (`"use client"`)
Props `{ vendorId: string; disabled?: boolean }`. Renders a sage "Create Payout" button (disabled when `disabled` prop set, with a "No IBAN" hint). On click: `createPayout(vendorId)`, local loading/error state, `router.refresh()` on success. The amount is NOT passed from the client — the server recomputes it.

### `PayoutActions.tsx` (`"use client"`)
Props `{ payoutId: string; status: PayoutStatus }`. Same shape as `VendorActions`.
- `PENDING` → **Mark Processing** (gold), **Mark Failed** (coral)
- `PROCESSING` → **Mark Completed** (sage), **Mark Failed** (coral)
- `COMPLETED` / `FAILED` → no buttons (terminal)
Local loading/error, `router.refresh()` on success.

### `CommissionEditor.tsx` (`"use client"`)
Props `{ vendorId: string; ratePercent: number }`. Default view: shows `${ratePercent}%` + an "Edit" text button. Edit mode: a `<input type="number" min={0} max={100} step={1}>` seeded with `ratePercent`, plus Save / Cancel. On Save: `updateCommissionRate(vendorId, value)`, loading/error state, `router.refresh()` on success (which re-renders with the new rate). Cancel restores the display view.

---

## Server Actions

### `app/actions/payouts.ts` (`"use server"`)

```ts
type ActionResult = { success: true } | { error: string };
```

**`createPayout(vendorId: string): Promise<ActionResult>`**
1. `getAuthUser()` → `!user` → Unauthorized; `role !== "ADMIN"` → Forbidden.
2. Fetch vendor (`id, ibanNumber, commissionRate, status`). Not found → error.
3. `!vendor.ibanNumber` → `{ error: "Vendor has no IBAN on file" }`.
4. Recompute `availableBalance` server-side (fetch that vendor's DELIVERED order items + COMPLETED payouts; apply the shared formula). Never trust a client amount.
5. `availableBalance <= 0` → `{ error: "No balance available to pay out" }`.
6. `prisma.payout.create({ data: { vendorId, amount: availableBalance, currency: "AED", ibanNumber: vendor.ibanNumber, status: "PENDING" } })`.
7. `revalidatePath("/payouts")`; return `{ success: true }`.

**Status transitions** via a non-exported helper `setPayoutStatus(id, status, opts?)`:
- `markProcessing(id)` → status PROCESSING
- `markCompleted(id)` → status COMPLETED **and** `processedAt: new Date()`
- `markFailed(id)` → status FAILED
Each: ADMIN check, try/catch, `revalidatePath("/payouts")`, typed result.

### `app/actions/commissions.ts` (`"use server"`)

**`updateCommissionRate(vendorId: string, percent: number): Promise<ActionResult>`**
1. ADMIN check.
2. Validate `Number.isFinite(percent) && percent >= 0 && percent <= 100` → else `{ error: "Rate must be between 0 and 100" }`.
3. `prisma.vendor.update({ where: { id: vendorId }, data: { commissionRate: percent / 100 } })`.
4. `revalidatePath("/commissions")`; return `{ success: true }`.

`commissionRate` is `Decimal(4,2)` — values 0.00–1.00 (and up to 99.99) fit.

---

## Error Handling

- All Prisma reads use `.catch()` fallbacks (`[]` / `null`).
- Server actions wrap mutations in try/catch, return `{ success } | { error }`.
- **Payout amounts are always recomputed server-side** — the client never sends an amount (prevents tampering).
- Decimals (`unitPrice`, `amount`, `commissionRate`) converted with `Number()` before arithmetic.
- Commission rate range-validated before write.

---

## Testing

No automated suite (consistent with Phases 1–6b). Verification per task:
```bash
cd apps/admin && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts"   # expect clean
cd apps/admin && npx next lint 2>&1 | tail -3                           # expect no errors
```
Final task runs the repo-wide `pnpm lint` + `pnpm --filter "@e-luna/*" exec tsc --noEmit` to keep all 3 CI steps green. New JSX follows the established conventions: `next/link` `<Link>` for internal nav, escaped entities, `eslint-disable` on any raw `<img>`.

---

## Design Tokens (Warm Oud)

- `text-ink / text-mist / text-gold` — text, labels, accents
- `bg-sand / border-sand / bg-white / bg-ivory` — surfaces
- `bg-sage/20 text-sage` — COMPLETED/ACTIVE badges, Create Payout & Mark Completed & Reinstate-style positive buttons
- `bg-gold/20 text-gold` — PROCESSING/PENDING-ish, Mark Processing
- `bg-coral/20 text-coral` — FAILED badge, Mark Failed
- `bg-sand text-mist` — PENDING/terminal fallback
- `font-display`, `text-display-sm/md`, `text-body-xs/sm/md`
