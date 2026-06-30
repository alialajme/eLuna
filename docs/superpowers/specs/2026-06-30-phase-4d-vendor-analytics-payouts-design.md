# Phase 4d: Vendor Analytics & Payouts — Design Spec

## Goal

Replace the Phase 4a `/analytics` and `/payouts` stubs with working read-only pages: vendors see KPI cards + top products for a selectable time range, and an earnings summary with payout history.

---

## Scope

| Route | Description |
|-------|-------------|
| `/analytics` | KPI cards (Revenue, Orders, Units) + top-5 products table, period toggle |
| `/payouts` | Earnings summary (gross → fee → paid → available) + payout history table |

**Out of scope:** Charts/graphs, payout request button, returns impact on earnings, currency conversion.

---

## File Structure

```
apps/vendor/app/
├── (dashboard)/
│   ├── analytics/
│   │   ├── page.tsx                   — RSC, overwrite stub
│   │   └── components/
│   │       └── PeriodToggle.tsx       — "use client", 7d/30d/90d toggle
│   └── payouts/
│       └── page.tsx                   — RSC, overwrite stub
```

No new server actions — both pages are read-only.

---

## Shared Constraints

- All RSC pages: `safeCurrentUser()` → null check → redirect("/"); `getVendorByUserId()` → null check → redirect("/")
- All Prisma calls have `.catch()` fallbacks returning empty arrays
- Next.js 15: `searchParams` is a Promise — always `await` it
- `unitPrice` from Prisma is Decimal — use `Number()` for arithmetic
- `commissionRate` from Vendor is Decimal — use `Number()` for arithmetic

---

## Analytics Page — `(dashboard)/analytics/page.tsx`

RSC. `searchParams: Promise<{ period?: string }>` — awaited.

**Period resolution:**
```ts
const raw = (await searchParams).period ?? "30";
const days = ["7", "30", "90"].includes(raw) ? Number(raw) : 30;
const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
const prevCutoff = new Date(cutoff.getTime() - days * 24 * 60 * 60 * 1000);
```

**Data fetch — current period:**
```ts
const items = await prisma.orderItem.findMany({
  where: {
    vendorId: vendor.id,
    order: { createdAt: { gte: cutoff } },
  },
  include: {
    order: { select: { id: true } },
    variant: { include: { product: { select: { title: true } } } },
  },
}).catch(() => []);
```

**Data fetch — previous period (for % change):**
```ts
const prevItems = await prisma.orderItem.findMany({
  where: {
    vendorId: vendor.id,
    order: { createdAt: { gte: prevCutoff, lt: cutoff } },
  },
  select: { unitPrice: true, quantity: true, orderId: true },
}).catch(() => []);
```

**Computed values:**
```ts
// Current period
const totalRevenue = items.reduce((s, i) => s + Number(i.unitPrice) * i.quantity, 0);
const orderCount = new Set(items.map(i => i.order.id)).size;
const unitsSold = items.reduce((s, i) => s + i.quantity, 0);

// Previous period
const prevRevenue = prevItems.reduce((s, i) => s + Number(i.unitPrice) * i.quantity, 0);
const prevOrderCount = new Set(prevItems.map(i => i.orderId)).size;
const prevUnitsSold = prevItems.reduce((s, i) => s + i.quantity, 0);

// % change helper (returns null when prev === 0)
function pctChange(curr: number, prev: number): number | null {
  if (prev === 0) return null;
  return Math.round(((curr - prev) / prev) * 100);
}
```

**Top products:**
```ts
// Group items by product title, accumulate units and revenue
const productMap = new Map<string, { units: number; revenue: number }>();
for (const item of items) {
  const title = item.variant.product.title;
  const existing = productMap.get(title) ?? { units: 0, revenue: 0 };
  productMap.set(title, {
    units: existing.units + item.quantity,
    revenue: existing.revenue + Number(item.unitPrice) * item.quantity,
  });
}
const topProducts = [...productMap.entries()]
  .map(([title, stats]) => ({ title, ...stats }))
  .sort((a, b) => b.revenue - a.revenue)
  .slice(0, 5);
```

**Layout:**
- Header: "Analytics" h2 + `<PeriodToggle period={days.toString()} />` right-aligned
- Three KPI cards (white bg, sand border, rounded-lg): Revenue / Orders / Units Sold
  - Each card: label (uppercase mist), large serif number (ink), pct change badge (↑ sage if positive, ↓ coral if negative, mist if null)
- "Top products" section heading below cards
- Table: # | Product | Units | Revenue (AED formatted)
- Empty state (no items): "No orders in this period."

**`PeriodToggle` — `analytics/components/PeriodToggle.tsx`:**
```ts
"use client"
// Props: { period: string }  ("7" | "30" | "90")
// Uses useRouter + usePathname to push ?period=N
// Three buttons in a pill group: "7 days" | "30 days" | "90 days"
// Active button: bg-ink text-gold; inactive: text-mist hover:text-ink
```

---

## Payouts Page — `(dashboard)/payouts/page.tsx`

RSC. No `searchParams`.

**Data fetch:**
```ts
// 1. All-time DELIVERED items for gross revenue calculation
const items = await prisma.orderItem.findMany({
  where: { vendorId: vendor.id, fulfillmentStatus: "DELIVERED" },
  select: { unitPrice: true, quantity: true },
}).catch(() => []);

// 2. All payouts ordered newest first
const payouts = await prisma.payout.findMany({
  where: { vendorId: vendor.id },
  orderBy: { createdAt: "desc" },
}).catch(() => []);
```

**Computed values:**
```ts
const grossRevenue = items.reduce((s, i) => s + Number(i.unitPrice) * i.quantity, 0);
const platformFee = grossRevenue * Number(vendor.commissionRate);
const netEarned = grossRevenue - platformFee;
const paidOut = payouts
  .filter(p => p.status === "COMPLETED")
  .reduce((s, p) => s + Number(p.amount), 0);
const availableBalance = Math.max(0, netEarned - paidOut);
```

**IBAN masking helper:**
```ts
function maskIban(iban: string): string {
  return iban.slice(0, 4) + "···" + iban.slice(-4);
}
```

**Layout:**
- Header: "Payouts" h2
- Earnings summary card (white bg, sand border): four columns
  - Gross Revenue (ink)
  - Platform Fee (`− AED {n}` in coral, label shows actual rate: `Platform fee (${Math.round(Number(vendor.commissionRate) * 100)}%)`)
  - Paid Out (ink)
  - Available Balance (gold, left border `border-l-2 border-gold`) — separated visually
- "Payout history" section heading
- Table: Date | Amount | IBAN (masked) | Reference (— if null) | Status badge
- Empty state (no payouts): "No payouts yet. Luna Operations processes payouts bi-monthly."

**Status badge colours:**
- PENDING → `bg-sand text-mist`
- PROCESSING → `bg-gold/20 text-gold`
- COMPLETED → `bg-sage/20 text-sage`
- FAILED → `bg-coral/20 text-coral`

---

## Design Tokens

Same Warm Oud palette as Phase 4b/4c:
- `text-ink` / `#1a0a00` — primary text, KPI numbers
- `text-mist` / `#888888` — labels, secondary text
- `text-gold` / `#d4a855` — available balance, active toggle, PROCESSING badge
- `text-sage` / `#6dbf8e` — positive % change, COMPLETED badge
- `text-coral` / `#e57373` — negative % change, platform fee, FAILED badge
- `bg-sand` / `#f0e8d8` — borders, PENDING badge background
- `bg-ivory` / `#fff8ee` — page background

---

## Data Model (relevant fields)

```
OrderItem
  vendorId, unitPrice (Decimal), quantity, fulfillmentStatus
  → order: Order { id, createdAt }
  → variant: ProductVariant { product: Product { title } }

Payout
  vendorId, amount (Decimal), currency, status (PayoutStatus), ibanNumber, reference?, processedAt?, createdAt

Vendor
  commissionRate (Decimal, default 0.15)

PayoutStatus enum: PENDING | PROCESSING | COMPLETED | FAILED
```
