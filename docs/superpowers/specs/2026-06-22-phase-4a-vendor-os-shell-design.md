# Phase 4a: Vendor OS Shell + Onboarding — Design Spec

## Goal

Build the foundational shell for the Vendor OS: auth guard, 4-step onboarding wizard, pending-approval holding page, sidebar navigation layout, and a rich dashboard with KPI cards, Luna AI low-stock alerts, and a 7-day revenue bar chart.

---

## Architecture

### Route Groups

```
apps/vendor/app/
├── (auth)/
│   ├── sign-in/[[...sign-in]]/page.tsx   — Clerk sign-in (already exists)
│   └── onboarding/
│       ├── page.tsx                       — RSC shell for wizard
│       └── OnboardingWizard.tsx           — client multi-step wizard
├── (dashboard)/
│   ├── layout.tsx                         — auth guard + sidebar shell
│   ├── page.tsx                           — dashboard RSC
│   └── components/
│       ├── Sidebar.tsx                    — client component (active-link state)
│       └── TopBar.tsx                     — store name + sign-out
├── pending/
│   └── page.tsx                           — "under review" holding page (no shell)
└── actions/
    ├── vendor.ts                          — createVendor(), updateVendorProfile(), updateVendorIBAN()
```

### Auth Guard Pattern

Auth guard lives in `(dashboard)/layout.tsx` — not middleware — to avoid edge-runtime DB constraints:

```
safeVendorGuard(userId):
  1. fetch Vendor by userId
  2. not found → redirect("/onboarding")
  3. status === PENDING → redirect("/pending")
  4. status === SUSPENDED or REJECTED → redirect("/pending") with reason param
  5. status === ACTIVE → render layout
```

In dev without Clerk keys, `safeCurrentUser()` returns null → the layout renders a "Sign in" prompt rather than crashing.

### Vendor Status Flow

```
[Sign up] → /onboarding (4 steps) → Vendor created (PENDING)
         → /pending (waiting room)
         → [Admin approves in ops.luna.ae] → status = ACTIVE
         → (dashboard)/ unlocked
```

---

## Server Actions — `apps/vendor/app/actions/vendor.ts`

All functions are `"use server"` async exports.

### `createVendor(name: string, slug: string)`
- Validates slug is URL-safe (lowercase, hyphens only, 3–40 chars)
- Checks slug uniqueness via `prisma.vendor.findUnique({ where: { storeSlug: slug } })`
- Creates `Vendor` record: `{ userId, storeName: name, storeSlug: slug, status: "PENDING" }`
- Upserts `User` record: `{ id: userId, email, role: "VENDOR" }`
- Returns `{ success: boolean; error?: string }`

### `updateVendorProfile(data: { description?: string; logoUrl?: string })`
- Updates `Vendor.description` and `Vendor.logoUrl` for the current user
- Both fields optional — no-op if both are empty (skip step)
- Returns `{ success: boolean }`

### `updateVendorIBAN(iban: string)`
- Basic format validation: non-empty, strip spaces
- Updates `Vendor.ibanNumber`
- Returns `{ success: boolean; error?: string }`

---

## Onboarding — `(auth)/onboarding/`

### `page.tsx` (RSC)
- Calls `safeCurrentUser()` — if null, shows "Sign in to continue"
- Checks if vendor already exists — if ACTIVE, redirect to `/`; if PENDING, redirect to `/pending`
- Renders `<OnboardingWizard userId={user.id} userEmail={user.emailAddresses[0]?.emailAddress} />`

### `OnboardingWizard.tsx` (client)

4-step wizard with local `step` state (1–4). Progress bar at top shows step N of 4.

**Step 1 — Store Identity**
- Store name input (required, 2–60 chars)
- Store slug input (auto-populated from name via `name.toLowerCase().replace(/[^a-z0-9]+/g, "-")`, editable)
- "Next" → calls `createVendor(name, slug)` → on success, advance to step 2
- Shows inline slug availability error if slug taken

**Step 2 — About Your Boutique**
- Description textarea (optional, max 400 chars)
- Logo URL input (optional — plain URL, Cloudinary upload deferred to Phase 5)
- "Save & Continue" → calls `updateVendorProfile({ description, logoUrl })` → advance to step 3
- "Skip for now" → advance to step 3 without saving

**Step 3 — Payout Details**
- IBAN input with placeholder `AE07 0331 2345 6789 0123 456`
- Helper text: "Required before your first payout. You can update this in Settings."
- "Save & Continue" → calls `updateVendorIBAN(iban)` → advance to step 4
- "Skip for now" → advance without saving

**Step 4 — Secure Your Account**
- Explains MFA is mandatory for all vendors
- "Enable MFA" button opens Clerk's account portal in a new tab (`https://accounts.clerk.dev/user`)
- "Finish setup" button → redirects to `/pending`
- Note: MFA enforcement will be added in Phase 8 (AI Agent Mesh) when Clerk webhooks are wired

---

## Pending Page — `/pending/page.tsx`

Full-page centered layout (no sidebar shell). Content:

- Luna wordmark (gold on ink background strip at top)
- Headline: "Your boutique is under review"
- Body: "Our team reviews every seller application within 2–3 business days. You'll receive an email at {userEmail} once you're approved."
- Support link: `mailto:sellers@luna.ae`
- Sign out button (Clerk `<SignOutButton />`)

No Prisma call needed. `safeCurrentUser()` used only to get the email address for the message.

---

## Dashboard Shell — `(dashboard)/layout.tsx`

RSC that:
1. Calls `safeCurrentUser()` → null → renders "Sign in" prompt
2. Fetches `Vendor` by `userId` → runs the guard logic above
3. Returns:

```tsx
<div className="flex min-h-screen bg-ivory">
  <Sidebar storeName={vendor.storeName} />
  <div className="flex flex-1 flex-col">
    <TopBar storeName={vendor.storeName} />
    <main className="flex-1 p-6">{children}</main>
  </div>
</div>
```

### `Sidebar.tsx` (client)

Wide sidebar, `w-56`, `bg-ink`. Nav items with icons + labels:

| Icon | Label | href |
|------|-------|------|
| 📊 | Dashboard | `/` |
| 📦 | Products | `/products` |
| 📋 | Orders | `/orders` |
| 🏭 | Inventory | `/inventory` |
| 📈 | Analytics | `/analytics` |
| 💸 | Payouts | `/payouts` |
| ⚙️ | Settings | `/settings` |

Active link: `bg-gold/20 text-gold rounded-lg`. Inactive: `text-mist hover:text-ivory`.

Uses `usePathname()` for active detection (client component).

Footer of sidebar: vendor store name in small gold text + Clerk `<SignOutButton />`.

### `TopBar.tsx` (client)

Slim `h-14` bar, `bg-ivory border-b border-sand`. Left: page title (passed as prop or derived from pathname). Right: vendor store name chip + sign-out.

---

## Dashboard Page — `(dashboard)/page.tsx`

RSC. Fetches all data in `Promise.all` with `.catch()` guards.

### Data fetched

```ts
const [revenue30d, orderCount, pendingCount, productCount, lowStockVariants, dailyRevenue] = await Promise.all([
  // Sum of order totals via OrderItem for this vendor, last 30 days
  prisma.orderItem.aggregate({
    where: { vendorId: vendor.id, order: { createdAt: { gte: thirtyDaysAgo }, status: { not: "CANCELLED" } } },
    _sum: { unitPrice: true },  // approximate — unitPrice × qty handled below
  }).catch(() => ({ _sum: { unitPrice: null } })),

  prisma.order.count({
    where: { items: { some: { vendorId: vendor.id } } },
  }).catch(() => 0),

  prisma.order.count({
    where: { items: { some: { vendorId: vendor.id } }, status: "PENDING" },
  }).catch(() => 0),

  prisma.product.count({
    where: { vendorId: vendor.id, status: "ACTIVE" },
  }).catch(() => 0),

  prisma.productVariant.findMany({
    where: { product: { vendorId: vendor.id }, stock: { lte: 3, gt: 0 } },
    include: { product: { select: { title: true } } },
    take: 5,
  }).catch(() => []),

  // 7 days of daily revenue for the bar chart
  prisma.$queryRaw`
    SELECT DATE(o.created_at) as day, SUM(oi.unit_price * oi.quantity) as total
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE oi.vendor_id = ${vendor.id}
      AND o.created_at >= NOW() - INTERVAL '7 days'
      AND o.status != 'CANCELLED'
    GROUP BY DATE(o.created_at)
    ORDER BY day ASC
  `.catch(() => []),
])
```

**Note:** Revenue is calculated as `SUM(unitPrice × quantity)` via raw query for accuracy. The aggregate fallback uses `unitPrice` only as a rough stat.

### Layout

```
┌─────────────────────────────────────────────────┐
│ Good morning, {storeName} ✦        [date]        │
├──────────┬──────────┬──────────┬────────────────┤
│ Revenue  │  Orders  │ Pending  │    Products     │
│ AED 12k  │   34     │   5 ⚠️   │      12         │
│  (30d)   │  total   │ to ship  │    active       │
├─────────────────────────────────────────────────┤
│ ✦ LUNA AI  │ Low stock: Classic Black S (2 left) │
│  ALERTS   │ Embroidered Evening M (1 left)  →   │
├─────────────────────────────────────────────────┤
│                 7-day revenue                    │
│  [CSS bar chart — pure Tailwind, no lib]         │
└─────────────────────────────────────────────────┘
```

### Stat card colors

- Revenue value: `font-display text-display-sm text-gold` (gold for money)
- Orders, Pending, Products values: `font-display text-display-sm text-ink` (dark, high contrast)
- Pending card background becomes `bg-coral/10 border-coral` when `pendingCount > 0`
- All cards: `bg-ivory border border-sand rounded-2xl` base

### Luna AI Alert strip

`bg-ink rounded-2xl px-5 py-4`. Only rendered if `lowStockVariants.length > 0`. Each variant shows product title + size + stock count. "View inventory →" link to `/inventory`.

### Revenue bar chart

Pure CSS — no charting library. Each day is a `div` with `height` proportional to that day's revenue relative to the max. Gold bars (`bg-gold`), grey for days with no data (`bg-sand`). Day labels below in `text-body-xs text-mist`.

---

## Placeholder Pages (stub routes)

To avoid 404s when sidebar links are clicked, create stub pages for routes not implemented in 4a:

- `(dashboard)/products/page.tsx` → "Products coming in Phase 4b"
- `(dashboard)/orders/page.tsx` → "Orders coming in Phase 4c"
- `(dashboard)/inventory/page.tsx` → "Inventory coming in Phase 4b"
- `(dashboard)/analytics/page.tsx` → "Analytics coming in Phase 4d"
- `(dashboard)/payouts/page.tsx` → "Payouts coming in Phase 4d"
- `(dashboard)/settings/page.tsx` → "Settings coming in Phase 4b"

Each stub: centered text on ivory background with a "Coming soon" message and a back-to-dashboard link.

---

## Scope Exclusions

- Product CRUD (Phase 4b)
- Order fulfillment (Phase 4c)
- Analytics charts beyond 7-day revenue (Phase 4d)
- Payout requests (Phase 4d)
- Cloudinary logo upload (Phase 5)
- Real AI agent alerts (Phase 8)
- MFA enforcement webhook (Phase 8)
- Admin approval flow (Phase 6)

---

## Dev Behaviour (no Clerk keys / no DB)

- `safeCurrentUser()` returns null → all pages show "Sign in to continue" — no crash
- All Prisma calls have `.catch()` guards → dashboard renders with zero values
- Sidebar and TopBar still render (vendor name shows as "Your Store" fallback)
