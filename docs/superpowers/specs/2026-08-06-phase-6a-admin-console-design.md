# Phase 6a: Admin Console — Core Dashboard + Seller Management — Design Spec

## Goal

Turn the bare admin app (`apps/admin`, currently a "coming soon" page) into a working operations console: a KPI dashboard and a full vendor approval/management workflow. This is sub-project 6a of the larger Admin Console (Phase 6); orders moderation, products, payouts, commissions, fraud, customers, and settings are deferred to 6b–6d.

---

## Scope

| Route | Description |
|-------|-------------|
| `/` | Dashboard — 4 KPI cards (GMV, orders, active vendors, pending approvals) |
| `/sellers` | All vendors, filterable by status |
| `/sellers/approvals` | Focused queue of PENDING vendors with inline approve/reject |
| `/sellers/[id]` | Vendor detail + status actions |

**In scope:** Dashboard KPIs, seller list with status filter, approvals queue, seller detail page, four status-transition server actions (approve/reject/suspend/reactivate), shared dashboard scaffold (layout, sidebar, topbar, auth helper).

**Out of scope:** Charts/trends (deferred to 6c analytics), status reason notes (fast-follow, needs schema field), orders/products/payouts/commissions/fraud/customers/settings pages (6b–6d), vendor-side display of admin decisions, email/notification on approval.

---

## Architecture

The admin app middleware already enforces the ADMIN role via `createLunaMiddleware("ADMIN")` (`apps/admin/middleware.ts`), so route-level protection is handled. We mirror the vendor app's proven `(dashboard)` structure.

No new DB models or schema changes. All data reads from existing `Vendor`, `Order`, `OrderItem`.

### Files to create

```
apps/admin/app/
├── lib/
│   └── auth.ts                          — safeCurrentUser() (copy of vendor helper)
├── (dashboard)/
│   ├── layout.tsx                       — RSC layout: auth guard + Sidebar + TopBar
│   ├── page.tsx                         — RSC dashboard, 4 KPI cards
│   ├── components/
│   │   ├── Sidebar.tsx                  — nav: Overview, Sellers, Approvals
│   │   ├── TopBar.tsx                   — header bar
│   │   ├── StatusFilter.tsx             — "use client", pushes ?status= to router
│   │   └── VendorActions.tsx            — "use client", status action buttons
│   └── sellers/
│       ├── page.tsx                     — RSC vendor list (status filter)
│       ├── approvals/
│       │   └── page.tsx                 — RSC PENDING queue + inline approve/reject
│       └── [id]/
│           └── page.tsx                 — RSC vendor detail + VendorActions
└── actions/
    └── sellers.ts                       — "use server": approve/reject/suspend/reactivate
```

The existing `apps/admin/app/page.tsx` ("coming soon") is replaced by the new `(dashboard)/page.tsx` route. The current root `page.tsx` is deleted since the dashboard route group serves `/`.

---

## Shared Scaffold

### `app/lib/auth.ts`

Exact copy of `apps/vendor/app/lib/auth.ts`:

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

### `(dashboard)/layout.tsx`

RSC. Guards on `safeCurrentUser()`. If no user, render a "Sign in to access the admin console" panel with a link to `/sign-in` (same pattern as vendor layout). No vendor lookup — admin role is enforced by middleware. Renders `<Sidebar />` + `<TopBar />` + `<main>{children}</main>`.

### `Sidebar.tsx`

Nav links: **Overview** (`/`), **Sellers** (`/sellers`), **Approvals** (`/sellers/approvals`). Warm Oud styling; admin app uses **sage** as its accent (per design system: "Sage → Admin app"). Dark `bg-ink` sidebar, sage highlight on active link.

### `TopBar.tsx`

Simple header with "Luna Ops" title and a Clerk `<UserButton />` (or user email). Mirrors vendor TopBar structure.

---

## Dashboard — `/` (`(dashboard)/page.tsx`)

RSC. Four KPIs computed in parallel via `Promise.all`, each query with a `.catch()` fallback.

```ts
const [gmvAgg, orderCount, activeVendors, pendingVendors] = await Promise.all([
  prisma.order.aggregate({
    _sum: { total: true },
    where: { status: { notIn: ["CANCELLED", "REFUNDED"] } },
  }).catch(() => ({ _sum: { total: null } })),
  prisma.order.count({
    where: { status: { notIn: ["CANCELLED", "REFUNDED"] } },
  }).catch(() => 0),
  prisma.vendor.count({ where: { status: "ACTIVE" } }).catch(() => 0),
  prisma.vendor.count({ where: { status: "PENDING" } }).catch(() => 0),
]);

const gmv = Number(gmvAgg._sum.total ?? 0);
```

**KPI cards (StatCard tiles):**
- **Platform GMV** — `AED ${gmv.toLocaleString("en-AE", { maximumFractionDigits: 0 })}`
- **Total Orders** — `orderCount.toLocaleString("en-AE")`
- **Active Vendors** — `activeVendors`
- **Pending Approvals** — `pendingVendors`, rendered in gold, wrapped in a `<Link href="/sellers/approvals">`

**GMV definition:** sum of `Order.total` for all orders whose status is not CANCELLED or REFUNDED. `Order.total` is a Prisma `Decimal` — convert with `Number()` before use.

---

## Seller List — `/sellers` (`(dashboard)/sellers/page.tsx`)

RSC. `searchParams: Promise<{ status?: string }>` — awaited (Next.js 15).

```ts
const raw = (await searchParams).status ?? "all";
const VALID = ["PENDING", "ACTIVE", "SUSPENDED", "REJECTED"];
const where = VALID.includes(raw) ? { status: raw as VendorStatus } : {};

const vendors = await prisma.vendor
  .findMany({ where, orderBy: { createdAt: "desc" } })
  .catch(() => []);
```

**Layout:**
- Header "Sellers" + `<StatusFilter status={raw} />` (client component, pushes `?status=` to router — pattern from vendor `PeriodToggle`). Filter options: All, Pending, Active, Suspended, Rejected.
- Vendor rows: store name, `@slug`, status badge, join date (`toLocaleDateString("en-AE")`), "View →" link to `/sellers/${id}`.
- Empty state: "No vendors found for this filter."

---

## Approvals Queue — `/sellers/approvals` (`(dashboard)/sellers/approvals/page.tsx`)

RSC. Fetches only PENDING vendors:

```ts
const pending = await prisma.vendor
  .findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" } })
  .catch(() => []);
```

**Layout:**
- Header "Pending Approvals" + count.
- Each vendor as a card: store name, description, IBAN presence indicator ("IBAN on file" / "No IBAN"), MFA-verified status (`mfaVerifiedAt ? "MFA verified" : "MFA pending"`), join date, and inline `<VendorActions>` with Approve + Reject buttons.
- Empty state: "No pending approvals — you're all caught up."

Oldest-first ordering (`createdAt: "asc"`) so the longest-waiting vendors surface first.

---

## Seller Detail — `/sellers/[id]` (`(dashboard)/sellers/[id]/page.tsx`)

RSC. `params: Promise<{ id: string }>` — awaited.

```ts
const { id } = await params;
const vendor = await prisma.vendor.findUnique({ where: { id } }).catch(() => null);
if (!vendor) redirect("/sellers");
```

Also fetch that vendor's stats in parallel:

```ts
const [orderItems] = await Promise.all([
  prisma.orderItem.findMany({
    where: { vendorId: id },
    select: { unitPrice: true, quantity: true, orderId: true },
  }).catch(() => []),
]);
const vendorGmv = orderItems.reduce((s, i) => s + Number(i.unitPrice) * i.quantity, 0);
const vendorOrderCount = new Set(orderItems.map((i) => i.orderId)).size;
```

**Layout:**
- Store header: `logoUrl` (raw `<img>` with eslint-disable for external URLs, or fallback initial), store name, `@slug`, status badge.
- Info grid: description, masked IBAN (`iban.slice(0,4) + "···" + iban.slice(-4)`, or "Not provided"), commission rate (`${Math.round(Number(commissionRate) * 100)}%`), MFA verified (`mfaVerifiedAt` formatted or "Pending"), join date.
- Stats strip: total orders (`vendorOrderCount`), vendor GMV (`AED ${vendorGmv...}`).
- `<VendorActions vendorId={id} status={vendor.status} />`.

---

## Client Components

### `StatusFilter.tsx` (`"use client"`)

Receives `status: string` prop. Renders filter pills (All / Pending / Active / Suspended / Rejected). Uses `useRouter` + `usePathname`; on click pushes `${pathname}?status=${value}` (value `""`/`all` clears the param). Same architecture as vendor `PeriodToggle` (RSC parent passes current value; client only handles navigation).

### `VendorActions.tsx` (`"use client"`)

Receives `vendorId: string` and `status: VendorStatus`. Renders buttons by current status:

| Current status | Buttons |
|----------------|---------|
| PENDING | Approve, Reject |
| ACTIVE | Suspend |
| SUSPENDED | Reactivate |
| REJECTED | Approve |

Each button calls the matching server action, uses `useState` for a per-action `isLoading` + `error`, and `router.refresh()` on success. Approve/Reactivate → sage button; Reject/Suspend → coral button.

---

## Server Actions — `app/actions/sellers.ts` (`"use server"`)

Four actions. Each: guard with `safeCurrentUser()` (→ `{ error: "Unauthorized" }` if null — middleware already enforces ADMIN role, so no extra role check), update `Vendor.status`, revalidate paths, return typed result.

```ts
type ActionResult = { success: true } | { error: string };

async function setVendorStatus(id: string, status: VendorStatus): Promise<ActionResult> {
  const user = await safeCurrentUser();
  if (!user) return { error: "Unauthorized" };

  try {
    await prisma.vendor.update({ where: { id }, data: { status } });
    revalidatePath("/");
    revalidatePath("/sellers");
    revalidatePath("/sellers/approvals");
    revalidatePath(`/sellers/${id}`);
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Update failed" };
  }
}

export async function approveVendor(id: string)    { return setVendorStatus(id, "ACTIVE"); }
export async function rejectVendor(id: string)     { return setVendorStatus(id, "REJECTED"); }
export async function suspendVendor(id: string)    { return setVendorStatus(id, "SUSPENDED"); }
export async function reactivateVendor(id: string) { return setVendorStatus(id, "ACTIVE"); }
```

**"use server" constraint:** all exports must be async functions. `setVendorStatus` is a non-exported helper (fine — not exported). The four exported wrappers are async.

---

## Error Handling

- All Prisma reads use `.catch()` with sensible fallbacks (0, `[]`, `null`, or empty aggregate).
- Server actions wrap the mutation in try/catch and return `{ error }` on failure.
- Detail page redirects to `/sellers` if the vendor id is not found.
- Decimal fields (`Order.total`, `OrderItem.unitPrice`, `commissionRate`) converted with `Number()` before arithmetic.

---

## Testing

No automated test suite exists in this repo (consistent with Phases 1–5). Verification is via TypeScript:

```bash
cd apps/admin && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts"
```

Expected: clean (only the known pre-existing `tailwind.config.ts` module-resolution error, if present).

---

## Design Tokens (Warm Oud)

- `text-ink` — headings, primary text
- `text-mist` — labels, secondary text, empty states
- `text-gold` — pending-approval emphasis, accents
- `bg-ink` — sidebar, primary buttons
- `bg-sand` / `border-sand` — borders, dividers
- `bg-sage/20 text-sage` — ACTIVE badge, approve buttons (admin accent)
- `bg-gold/20 text-gold` — PENDING badge
- `bg-coral/20 text-coral` — SUSPENDED badge, reject/suspend buttons
- `bg-sand text-mist` — REJECTED badge
