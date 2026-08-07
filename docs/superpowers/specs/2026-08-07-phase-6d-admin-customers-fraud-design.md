# Phase 6d: Admin Console — Customers + Fraud — Design Spec

## Goal

Add two read-only oversight surfaces to the admin console: a customers directory (list + detail with spend/loyalty/order history) and a heuristic fraud review queue (flags risky orders from existing signals). No schema changes. Settings/feature-flags are deferred to a future sub-project (6e) because they require a persistence model + migration.

---

## Scope

| Route | Description |
|-------|-------------|
| `/customers` | All customers with order count, total spent, loyalty, wallet |
| `/customers/[id]` | Customer detail: profile, stats, order history, wishlist/review counts, size profile |
| `/fraud` | Heuristic review queue: orders flagged by rules, with reasons |

**In scope:** customers list + detail (read-only), fraud review queue derived from existing data (three explainable rules), Sidebar/TopBar nav additions.

**Out of scope:** any schema change or Prisma migration, persistent fraud flags / resolve workflow (this queue is computed each load), platform settings / feature flags / category management (deferred to 6e), customer mutations (ban/adjust wallet), risk scoring.

---

## Architecture

Three RSC routes under `apps/admin/app/(dashboard)/` (ADMIN role gated by the layout). All read-only — **no client components, no server actions, no schema changes**. Reads from existing `CustomerProfile`, `User`, `Order`, `OrderItem`, `PaymentTransaction`, `Wishlist`, `Review`, `SizeProfile`, `Address`.

### Files

```
apps/admin/app/(dashboard)/
├── components/
│   ├── Sidebar.tsx        — MODIFY: add Customers + Fraud nav
│   └── TopBar.tsx        — MODIFY: add page titles + "Customer Detail" fallback
├── customers/
│   ├── page.tsx          — CREATE: customer list
│   └── [id]/
│       └── page.tsx      — CREATE: customer detail
└── fraud/
    └── page.tsx          — CREATE: heuristic review queue
```

---

## Verified schema facts

- `User`: `id, email, role` — **no name field** (customer identity = email; a display name can be derived from `Address.fullName`).
- `CustomerProfile`: `id, userId, loyaltyPoints (Int), walletBalance (Decimal), createdAt`. Relations: `user (User)`, `sizeProfile (SizeProfile?)`, `orders (Order[])`, `wishlists (Wishlist[])`, `reviews (Review[])`.
- `Order`: `id, customerId, addressId, total (Decimal), status (OrderStatus), createdAt`. Relations: `customer`, `address`, `paymentTransactions (PaymentTransaction[])`.
- `PaymentTransaction`: `orderId, status (PaymentStatus)`. `PaymentStatus`: PENDING | AUTHORIZED | CAPTURED | FAILED | REFUNDED | PARTIALLY_REFUNDED.
- `OrderStatus`: PENDING | CONFIRMED | PROCESSING | SHIPPED | DELIVERED | CANCELLED | REFUNDED.
- `Address`: `fullName`.

Decimals → `Number()` before arithmetic.

---

## Sidebar + TopBar (modify)

**Sidebar** — add after the Analytics nav item:
```tsx
{ icon: "👥", label: "Customers", href: "/customers" },
{ icon: "🛡️", label: "Fraud", href: "/fraud" },
```
Extend `isActive`: `/customers` matches `/customers` OR `/customers/*`; `/fraud` matches `/fraud` exactly. Follow the existing nested-ternary pattern.

**TopBar** — add to `PAGE_TITLES`: `"/customers": "Customers"`, `"/fraud": "Fraud"`. Extend the fallback so `/customers/*` shows "Customer Detail" (alongside the existing `/sellers/*` and `/orders/*` cases).

---

## Order-status badge map (reused on customer detail)

```
DELIVERED:  "bg-sage/20 text-sage"
CONFIRMED:  "bg-gold/20 text-gold"
PROCESSING: "bg-gold/20 text-gold"
SHIPPED:    "bg-gold/20 text-gold"
PENDING:    "bg-sand text-mist"
CANCELLED:  "bg-coral/20 text-coral"
REFUNDED:   "bg-coral/20 text-coral"
```
Fallback `"bg-sand text-mist"`. Status label: `s.charAt(0) + s.slice(1).toLowerCase()`.

---

## Customers List — `/customers` (`(dashboard)/customers/page.tsx`)

RSC. null-user → `redirect("/")`.

### Data (parallel, `.catch()`-guarded)

1. `prisma.customerProfile.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, loyaltyPoints: true, walletBalance: true, createdAt: true, user: { select: { email: true } } } })`.
2. `prisma.order.findMany({ where: { status: { notIn: ["CANCELLED", "REFUNDED"] } }, select: { customerId: true, total: true } })`.

Derive per customer via a Map keyed by `customerId`: `orderCount` and `totalSpent` (Σ `Number(total)`).

### Layout

Header "Customers". Each row: email (`c.user.email`), join date (`toLocaleDateString("en-AE")`), `orderCount` orders, total spent (`AED ...`), loyalty points, wallet balance (`AED ...`), "View →" link to `/customers/${c.id}`. Empty state: "No customers yet."

---

## Customer Detail — `/customers/[id]` (`(dashboard)/customers/[id]/page.tsx`)

RSC. `params: Promise<{ id: string }>` awaited. null-user → `redirect("/")`.

```ts
const { id } = await params;
const customer = await prisma.customerProfile.findUnique({
  where: { id },
  select: {
    id: true, loyaltyPoints: true, walletBalance: true, createdAt: true,
    user: { select: { email: true } },
    sizeProfile: { select: { id: true } },
    _count: { select: { wishlists: true, reviews: true } },
    orders: {
      orderBy: { createdAt: "desc" },
      select: { id: true, total: true, status: true, createdAt: true, address: { select: { fullName: true } } },
    },
  },
}).catch(() => null);
if (!customer) redirect("/customers");
```

`generateMetadata`: title `Customer — Luna Ops` (or the derived name if simple; email is acceptable).

### Derivations
- **Display name**: `customer.orders[0]?.address.fullName ?? "Customer"` (most recent order's address name).
- **totalSpent**: Σ `Number(o.total)` over orders where `status NOT IN (CANCELLED, REFUNDED)`.
- **orderCount**: `customer.orders.length`.

### Layout
- Header: display name, email, "Joined {date}".
- Stats strip (grid): Total Orders, Total Spent (AED), Loyalty Points, Wallet Balance (AED).
- Order history: for each order — `#${id.slice(-8).toUpperCase()}`, date, status badge, total (AED), wrapped in a `<Link href={`/orders/${o.id}`}>`. Empty → "No orders yet."
- Small info row: "{n} wishlist items · {m} reviews · Size profile {present ? "on file" : "not set"}".

---

## Fraud Review Queue — `/fraud` (`(dashboard)/fraud/page.tsx`)

RSC. null-user → `redirect("/")`. Read-only; computed each load (no persistence).

### Data (`.catch()`-guarded)

```ts
const windowStart = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
const orders = await prisma.order.findMany({
  where: { createdAt: { gte: windowStart } },
  orderBy: { createdAt: "desc" },
  select: {
    id: true, total: true, createdAt: true, customerId: true,
    customer: { select: { user: { select: { email: true } } } },
    paymentTransactions: { select: { status: true } },
  },
}).catch(() => []);
```

### Rule computation (in memory)

- **meanOrderValue** = `orders.length === 0 ? 0 : (Σ Number(total)) / orders.length`.
- **Orders-per-customer timestamps**: build `Map<customerId, number[]>` of `createdAt.getTime()` (sorted ascending) to evaluate the rapid-repeat rule.

For each order compute `reasons: string[]`:
1. **"Failed payment"** — `order.paymentTransactions.some(t => t.status === "FAILED")`.
2. **"High value"** — `meanOrderValue > 0 && Number(order.total) >= 3 * meanOrderValue`.
3. **"Rapid repeat"** — within that customer's sorted timestamps, exists a run of ≥ 3 orders spanning ≤ 24h (a sliding window: for index `i`, check `times[i+2] - times[i] <= 24h`). If the order's customer satisfies this, tag every order of that customer OR just tag orders that participate in such a window. **Chosen rule:** tag an order "Rapid repeat" if that customer has ≥ 3 orders total within any 24h window (customer-level flag applied to all that customer's orders in the fetched set).

Keep orders with `reasons.length > 0`, preserving newest-first order.

### Rapid-repeat helper (customer-level boolean)
```ts
function hasRapidRepeat(times: number[]): boolean {
  // times sorted ascending; true if any 3 fall within 24h
  const DAY = 24 * 60 * 60 * 1000;
  for (let i = 0; i + 2 < times.length; i++) {
    if (times[i + 2]! - times[i]! <= DAY) return true;
  }
  return false;
}
```
(Note: `!` non-null assertions are safe here because the loop bound guarantees the indices exist; acceptable under `noUncheckedIndexedAccess`.)

### Layout
Header "Fraud review" + "{n} flagged orders". Each flagged order (newest first): `#${id.slice(-8).toUpperCase()}`, customer email (`o.customer.user.email`), total (AED), date, reason badges, "View order →" link to `/orders/${o.id}`.

**Reason badge colors:** Failed payment → `bg-coral/20 text-coral`; High value → `bg-gold/20 text-gold`; Rapid repeat → `bg-gold/20 text-gold`.

Empty state: "No flagged orders — nothing suspicious right now."

---

## Error Handling

- All Prisma reads `.catch()`-guarded (empty array / null).
- Customer detail not found → `redirect("/customers")`.
- Decimals (`total`, `walletBalance`) → `Number()`.
- Fraud: empty order set → `meanOrderValue = 0` (high-value rule skipped, no divide-by-zero); customers with < 3 orders can't trip rapid-repeat.
- Customer display name falls back to "Customer" when there's no order/address.
- `noUncheckedIndexedAccess` is ON — array index access uses `?? 0` or safe `!` where the loop guarantees the index (see `hasRapidRepeat`).

---

## Testing

No automated suite (consistent with Phases 1–6c). Verification per task:
```bash
cd apps/admin && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts"   # expect clean
cd apps/admin && npx next lint 2>&1 | tail -3                           # expect no errors
```
Final task runs the repo-wide `pnpm lint` + `pnpm --filter "@e-luna/*" exec tsc --noEmit` to keep all 3 CI steps green. New JSX uses `next/link` `<Link>` for internal nav and escaped entities.

---

## Design Tokens (Warm Oud)

- `text-ink / text-mist / text-gold` — text, labels, accents
- `bg-sand / border-sand / bg-white` — surfaces
- `bg-sage/20 text-sage` — DELIVERED badge
- `bg-gold/20 text-gold` — in-progress order statuses, "High value" / "Rapid repeat" fraud badges
- `bg-coral/20 text-coral` — CANCELLED/REFUNDED badge, "Failed payment" fraud badge
- `bg-sand text-mist` — PENDING / fallback
- `font-display`, `text-display-sm/md`, `text-body-xs/sm/md`
