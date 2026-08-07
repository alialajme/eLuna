# Phase 6c-ii: Admin Console — Analytics — Design Spec

## Goal

Add a platform analytics dashboard (`/analytics`) to the admin console: period-scoped KPIs with period-over-period change, a GMV trend line chart, top vendors by GMV, and GMV by category. Charts are hand-rolled inline SVG (zero new dependencies). This completes Phase 6c. Fraud/customers/settings remain 6d.

---

## Scope

| Route | Description |
|-------|-------------|
| `/analytics` | Period toggle + 4 KPI cards (with % change) + GMV line chart + top vendors + GMV by category |

**In scope:** period toggle (7/30/90 days), 4 KPIs (GMV, Orders, Avg Order Value, New Vendors) each with % change vs. the prior equal-length window, a GMV-over-time line chart, top-5 vendors by GMV, GMV-by-category bar chart, two reusable inline-SVG chart components, an admin PeriodToggle client component.

**Out of scope:** chart interactivity/tooltips (inline SVG, static), CSV/PDF export, custom date ranges, real-time updates, fraud/customers/settings (6d), any charting library or new dependency, schema changes.

---

## Architecture

A single RSC route under `apps/admin/app/(dashboard)/` (ADMIN role gated by the layout). Charts are **pure server components** — plain functions that return inline SVG from numeric props (no `"use client"`, no new deps). The only client component is the period toggle. No schema changes — everything derives from existing `Order`, `OrderItem`, `ProductVariant`, `Product`, `Vendor`.

### Files

```
apps/admin/app/
├── (dashboard)/
│   ├── components/
│   │   ├── Sidebar.tsx        — MODIFY: add Analytics nav item
│   │   ├── TopBar.tsx        — MODIFY: add page title
│   │   ├── PeriodToggle.tsx  — CREATE: "use client", 7/30/90 pills
│   │   ├── LineChart.tsx     — CREATE: server component, SVG line + area
│   │   └── BarChart.tsx      — CREATE: server component, SVG/flex bars
│   └── analytics/
│       └── page.tsx          — CREATE: queries + derivations + render
```

---

## Sidebar + TopBar (modify)

**Sidebar** — add after the Commissions nav item:
```tsx
{ icon: "📈", label: "Analytics", href: "/analytics" },
```
Extend `isActive` so `/analytics` matches `/analytics` (exact, no sub-routes), following the existing nested-ternary pattern.

**TopBar** — add to `PAGE_TITLES`: `"/analytics": "Analytics"`.

---

## Analytics Page — `/analytics` (`(dashboard)/analytics/page.tsx`)

RSC. `searchParams: Promise<{ period?: string }>` awaited. null-user → `redirect("/")`.

```ts
const raw = (await searchParams).period ?? "30";
const days = ["7", "30", "90"].includes(raw) ? Number(raw) : 30;
const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
const prevCutoff = new Date(cutoff.getTime() - days * 24 * 60 * 60 * 1000);

function pctChange(curr: number, prev: number): number | null {
  if (prev === 0) return null;
  return Math.round(((curr - prev) / prev) * 100);
}
```

### Queries (parallel, `.catch()`-guarded)

1. **Current-period orders** (single rich query — the "fetch once, derive in memory" source):
```ts
prisma.order.findMany({
  where: { status: { notIn: ["CANCELLED", "REFUNDED"] }, createdAt: { gte: cutoff } },
  select: {
    total: true,
    createdAt: true,
    items: {
      select: {
        vendorId: true,
        unitPrice: true,
        quantity: true,
        variant: { select: { product: { select: { category: true } } } },
      },
    },
  },
}).catch(() => [])
```

2. **Previous-period order aggregate + count** (for GMV & Orders % change):
```ts
prisma.order.aggregate({
  _sum: { total: true }, _count: true,
  where: { status: { notIn: ["CANCELLED", "REFUNDED"] }, createdAt: { gte: prevCutoff, lt: cutoff } },
}).catch(() => ({ _sum: { total: null }, _count: 0 }))
```

3. **New vendors** current + previous counts:
```ts
prisma.vendor.count({ where: { createdAt: { gte: cutoff } } }).catch(() => 0)
prisma.vendor.count({ where: { createdAt: { gte: prevCutoff, lt: cutoff } } }).catch(() => 0)
```

4. **Vendor store names** for the top-vendors join (fetch all active/any vendors' `{ id, storeName }`, or fetch after computing the top ids). Simplest: `prisma.vendor.findMany({ select: { id: true, storeName: true } }).catch(() => [])` and look up names in memory.

### Derivations (in memory from query #1)

- **GMV** = Σ `Number(o.total)`. **Orders** = `orders.length`.
- **AOV** = `orders === 0 ? 0 : GMV / orders`.
- **prevGMV** = `Number(prevAgg._sum.total ?? 0)`, **prevOrders** = `prevAgg._count`, **prevAOV** = `prevOrders === 0 ? 0 : prevGMV / prevOrders`.
- **KPI % changes**: `pctChange(GMV, prevGMV)`, `pctChange(orders, prevOrders)`, `pctChange(AOV, prevAOV)`, `pctChange(newVendors, prevNewVendors)`. Each rendered as a sage ▲ badge (positive), coral ▼ badge (negative), or hidden (null / zero).
- **Daily GMV series** (line chart): array of length `days`; for each order, `dayIndex = Math.floor((o.createdAt.getTime() - cutoff.getTime()) / 86_400_000)`, clamp to `[0, days-1]`, add `Number(o.total)` to `series[dayIndex]`. Pass `series` to `<LineChart>`.
- **Top vendors by GMV**: Map `vendorId → Σ Number(unitPrice)*quantity` over all `orders[].items`; sort desc; take 5; resolve `storeName` from the vendor list (fallback "Unknown"). Render as a div-based horizontal bar list (bar width = `value / topMax * 100%`).
- **GMV by category**: Map `category → Σ Number(unitPrice)*quantity` over all items (`item.variant.product.category`); build `bars: { label, value }[]` sorted desc. Pass to `<BarChart>`.

**Note on GMV definitions (intentional, matches 6b/6c-i):** the GMV KPI and daily series use order-level `Order.total`; top-vendors and by-category use item-level `unitPrice × quantity` (attribution across vendors/categories within an order). These can differ slightly (shipping/discount live at order level) — this is expected.

### Layout

- Header: "Analytics" + `<PeriodToggle period={String(days)} />`.
- 4 KPI cards (grid) with value + change badge.
- GMV line chart card: label "GMV — last N days" + `<LineChart values={series} />`.
- Two-column row: "Top vendors by GMV" (bar list) + "GMV by category" (`<BarChart bars={...} />`).
- Empty states: line chart with all-zero data renders a flat baseline; top vendors / category show "No data yet." when empty.

---

## Chart Components

### `LineChart.tsx` (server component — no "use client")

```tsx
type Props = { values: number[]; height?: number };

export function LineChart({ values, height = 120 }: Props) { ... }
```

- Uses a fixed `viewBox="0 0 600 {height}"` with `preserveAspectRatio="none"` and `width="100%"` so it scales to the container.
- `max = Math.max(...values, 0)`. If `values.length < 2` or `max === 0`, render a single flat baseline (`y = height`).
- Point mapping: `x = (i / (values.length - 1)) * 600`, `y = height - (value / max) * height`.
- Renders: a gold (`#d4a855`) `<polyline>` (`stroke-width="2.5"`, `fill="none"`) and a faint area `<polygon>` (same points closed to the baseline, `fill="#d4a855"`, `opacity="0.08"`).
- Guard against `NaN`: when `values.length < 2`, still render without dividing by zero.

### `BarChart.tsx` (server component — no "use client")

```tsx
type Props = { bars: { label: string; value: number }[] };

export function BarChart({ bars }: Props) { ... }
```

- If `bars.length === 0`, render `<p class="text-body-sm text-mist">No data yet.</p>`.
- `max = Math.max(...bars.map(b => b.value), 0)`.
- Flex row of columns; each column: a `div` whose height is `${max === 0 ? 0 : (value / max) * 100}%` of a fixed-height track (e.g. `h-28`), gold fill (`bg-gold`), rounded top, with the label beneath (`text-body-xs text-mist`).

### `PeriodToggle.tsx` (`"use client"`)

```tsx
type Props = { period: string };
```
Three pills (`7 days` / `30 days` / `90 days`, values `"7"/"30"/"90"`). `useRouter` + `usePathname`; on click `router.push(\`${pathname}?period=${value}\`)`. Active pill: `bg-ink ... text-sage` (admin accent); inactive: `text-mist hover:text-ink`. Same architecture as the vendor PeriodToggle and admin StatusFilter (RSC parent passes current value).

---

## Error Handling

- All Prisma reads `.catch()`-guarded (empty array / zero-aggregate fallbacks).
- Decimals (`total`, `unitPrice`) → `Number()` before arithmetic.
- Chart components guard degenerate inputs: empty arrays, `max === 0`, `< 2` points — no `NaN`/`Infinity` in SVG coords, no divide-by-zero.
- `pctChange` returns `null` when prev = 0 (badge hidden) — new platforms don't show misleading percentages.
- AOV guards `orders === 0 → 0`.
- Period validated against `["7","30","90"]`, default `"30"`.

---

## Testing

No automated suite (consistent with Phases 1–6c-i). Verification per task:
```bash
cd apps/admin && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts"   # expect clean
cd apps/admin && npx next lint 2>&1 | tail -3                           # expect no errors
```
Final task runs the repo-wide `pnpm lint` + `pnpm --filter "@e-luna/*" exec tsc --noEmit` to keep all 3 CI steps green. New JSX follows established conventions (`next/link` for nav, escaped entities; charts are inline SVG so no `<img>`).

---

## Design Tokens (Warm Oud)

- `text-ink / text-mist` — text, labels
- `text-gold` (`#d4a855`) — chart line/bars/area (literal hex inside SVG)
- `text-sage` / `bg-sage/20` — positive change badge, active period pill
- `text-coral` / `bg-coral/20` — negative change badge
- `bg-white / border-sand` (`#f0e8d8`) — cards, bar tracks
- `font-display`, `text-display-sm/md`, `text-body-xs/sm/md`
