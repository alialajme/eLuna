# Phase 6b: Admin Console — Orders + Products Moderation — Design Spec

## Goal

Extend the admin console (built in 6a) with two oversight surfaces: read-only visibility into all platform orders, and moderation of the product catalog across all vendors. This is sub-project 6b of Phase 6; payouts/commissions/analytics (6c) and fraud/customers/settings (6d) remain deferred.

---

## Scope

| Route | Description |
|-------|-------------|
| `/orders` | All platform orders, filterable by status (read-only) |
| `/orders/[id]` | Full order detail: items, per-vendor breakdown, customer, address, shipments (read-only) |
| `/products` | All products across vendors, filterable by status, inline Reject/Reinstate |

**In scope:** Orders list + detail (read-only), products list with inline moderation (Reject → REJECTED, Reinstate → ACTIVE), two product server actions, generalizing the 6a `StatusFilter` to be reusable, Sidebar/TopBar nav additions.

**Out of scope:** Order mutations (cancel/refund belong to Logistics/Payment phases 7–8), product detail page (moderate inline; view the live listing on the storefront if needed), force-archive of products (ARCHIVED is a vendor-owned state), DRAFT→ACTIVE publishing (vendor's job), analytics/charts (6c), schema changes.

---

## Architecture

All three routes live under the existing `apps/admin/app/(dashboard)/` group, whose `layout.tsx` already enforces the ADMIN role via `getAuthUser()` (built in 6a). No new auth wiring. No schema changes — reads from existing `Order`, `OrderItem`, `Product`, `ProductVariant`, `Vendor`, `CustomerProfile`, `Address`, `Shipment`.

### Files

```
apps/admin/app/
├── (dashboard)/
│   ├── components/
│   │   ├── Sidebar.tsx              — MODIFY: add Orders + Products nav items
│   │   ├── TopBar.tsx              — MODIFY: add page titles
│   │   ├── StatusFilter.tsx        — MODIFY: generalize to accept `options` prop
│   │   └── ProductActions.tsx      — CREATE: client Reject/Reinstate buttons
│   ├── orders/
│   │   ├── page.tsx                — CREATE: RSC orders list + status filter
│   │   └── [id]/
│   │       └── page.tsx            — CREATE: RSC order detail
│   └── products/
│       └── page.tsx                — CREATE: RSC products list + inline moderation
└── actions/
    └── products.ts                 — CREATE: rejectProduct / reinstateProduct
```

Also MODIFY `apps/admin/app/(dashboard)/sellers/page.tsx` to pass the vendor-status list to the generalized `StatusFilter`.

---

## Shared Scaffold Changes

### `Sidebar.tsx` (modify)

Add two `NAV_ITEMS` after Approvals:
```ts
{ icon: "📋", label: "Orders", href: "/orders" },
{ icon: "🛍️", label: "Products", href: "/products" },
```
The existing `isActive` ternary needs a branch so `/orders` matches `/orders` and `/orders/*`, and `/products` matches `/products`. Follow the same nested-route pattern already used for `/sellers`.

### `TopBar.tsx` (modify)

Add to `PAGE_TITLES`:
```ts
"/orders": "Orders",
"/products": "Products",
```
And extend the fallback so `/orders/*` shows "Order Detail".

### `StatusFilter.tsx` (generalize)

Currently hardcodes the five vendor filter pills. Change to accept an `options` prop:

```tsx
type FilterOption = { label: string; value: string };
type Props = { status: string; options: FilterOption[] };

export function StatusFilter({ status, options }: Props) { /* same render, maps over options */ }
```

The "all" pill is represented as `{ label: "All", value: "all" }` passed in by each caller. Navigation logic unchanged: `router.push(value === "all" ? pathname : \`${pathname}?status=${value}\`)`.

### `sellers/page.tsx` (modify — 6a consumer)

Define the vendor options locally and pass them:
```tsx
const SELLER_FILTERS = [
  { label: "All", value: "all" },
  { label: "Pending", value: "PENDING" },
  { label: "Active", value: "ACTIVE" },
  { label: "Suspended", value: "SUSPENDED" },
  { label: "Rejected", value: "REJECTED" },
];
// ...
<StatusFilter status={raw} options={SELLER_FILTERS} />
```

---

## Orders List — `/orders` (`(dashboard)/orders/page.tsx`)

RSC. `searchParams: Promise<{ status?: string }>` awaited.

```ts
const raw = (await searchParams).status ?? "all";
const VALID: OrderStatus[] = ["PENDING","CONFIRMED","PROCESSING","SHIPPED","DELIVERED","CANCELLED","REFUNDED"];
const where = VALID.includes(raw as OrderStatus) ? { status: raw as OrderStatus } : {};

const orders = await prisma.order.findMany({
  where,
  orderBy: { createdAt: "desc" },
  include: {
    address: { select: { fullName: true } },
    items: { select: { id: true } },
  },
}).catch(() => []);
```

**Filter options (passed to StatusFilter):** All, Pending, Confirmed, Processing, Shipped, Delivered, Cancelled, Refunded.

**Each row:** short id (`#${order.id.slice(-8).toUpperCase()}`), customer name (`order.address.fullName`), date (`toLocaleDateString("en-AE")`), item count (`order.items.length`), total (`AED ${Number(order.total).toLocaleString("en-AE")}`), status badge, "View →" link to `/orders/${order.id}`.

**Empty state:** "No orders found for this filter."

### Order-status badge map (`ORDER_STATUS_BADGE`)
```
DELIVERED:  "bg-sage/20 text-sage"
CONFIRMED:  "bg-gold/20 text-gold"
PROCESSING: "bg-gold/20 text-gold"
SHIPPED:    "bg-gold/20 text-gold"
PENDING:    "bg-sand text-mist"
CANCELLED:  "bg-coral/20 text-coral"
REFUNDED:   "bg-coral/20 text-coral"
```
Fallback `"bg-sand text-mist"`. This map is reused on the detail page.

---

## Order Detail — `/orders/[id]` (`(dashboard)/orders/[id]/page.tsx`)

RSC. `params: Promise<{ id: string }>` awaited.

```ts
const { id } = await params;
const order = await prisma.order.findUnique({
  where: { id },
  include: {
    address: true,
    customer: { include: { user: { select: { email: true } } } },
    items: {
      include: {
        variant: {
          include: {
            product: { select: { title: true, vendor: { select: { storeName: true } } } },
          },
        },
      },
    },
    shipments: true,
  },
}).catch(() => null);
if (!order) redirect("/orders");
```

`generateMetadata`: title `Order #${id.slice(-8).toUpperCase()} — Luna Ops`.

**Layout (two-column):**

**Left — items + per-vendor breakdown:**
- Header: `#${id.slice(-8).toUpperCase()}`, status badge, placed date, payment method (label map: CARD→"Card", LUNA_WALLET→"Luna Wallet", TABBY→"Tabby", TAMARA→"Tamara", CASH_ON_DELIVERY→"Cash on Delivery").
- Items table: product title (`item.variant.product.title`), vendor (`item.variant.product.vendor.storeName`), size/color (`item.variant.size` / `item.variant.color`), qty, unit price, line total (`Number(item.unitPrice) * item.quantity`).
- Per-vendor breakdown: group items by `item.variant.product.vendor.storeName`, show each vendor's subtotal.

**Right — sidebar:**
- Customer: `order.address.fullName`, `order.customer.user.email`, `order.address.phone`.
- Shipping address: addressLine1, addressLine2 (if present), city, emirate (if present), country.
- Totals: subtotal, discount, shipping fee, total (all `Number()`-converted, AED-formatted).
- Shipments: for each — courier, tracking number (or "—"), status, estimated delivery (if present). Empty → "No shipments yet."

No admin actions (read-only oversight).

---

## Products List — `/products` (`(dashboard)/products/page.tsx`)

RSC. `searchParams: Promise<{ status?: string }>` awaited.

```ts
const raw = (await searchParams).status ?? "all";
const VALID: ProductStatus[] = ["DRAFT","ACTIVE","REJECTED","ARCHIVED"];
const where = VALID.includes(raw as ProductStatus) ? { status: raw as ProductStatus } : {};

const products = await prisma.product.findMany({
  where,
  orderBy: { createdAt: "desc" },
  include: { vendor: { select: { storeName: true } } },
}).catch(() => []);
```

**Filter options:** All, Draft, Active, Rejected, Archived.

**Each row:**
- Thumbnail: first entry of `aiImages` (Json array). Parse safely: `const imgs = product.aiImages as string[]; const thumb = Array.isArray(imgs) ? imgs[0] : undefined;`. Render raw `<img>` with `eslint-disable-next-line @next/next/no-img-element` (aiImages are URLs/data URLs), else a `bg-sand` placeholder.
- Title, vendor store name (`product.vendor.storeName`), category, price (`AED ${Number(product.price)...}`), status badge.
- `<ProductActions productId={product.id} status={product.status} />`.

**Empty state:** "No products found for this filter."

### Product-status badge map (`PRODUCT_STATUS_BADGE`)
```
ACTIVE:   "bg-sage/20 text-sage"
DRAFT:    "bg-gold/20 text-gold"
REJECTED: "bg-coral/20 text-coral"
ARCHIVED: "bg-sand text-mist"
```
Fallback `"bg-sand text-mist"`.

---

## Product Server Actions — `app/actions/products.ts` (`"use server"`)

Mirrors the hardened `sellers.ts` pattern exactly (defense-in-depth ADMIN check).

```ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma, type ProductStatus } from "@e-luna/db";
import { getAuthUser } from "@e-luna/auth";

type ActionResult = { success: true } | { error: string };

async function setProductStatus(id: string, status: ProductStatus): Promise<ActionResult> {
  const user = await getAuthUser();
  if (!user) return { error: "Unauthorized" };
  if (user.role !== "ADMIN") return { error: "Forbidden" };

  try {
    await prisma.product.update({ where: { id }, data: { status } });
    revalidatePath("/products");
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Update failed" };
  }
}

export async function rejectProduct(id: string): Promise<ActionResult> {
  return setProductStatus(id, "REJECTED");
}

export async function reinstateProduct(id: string): Promise<ActionResult> {
  return setProductStatus(id, "ACTIVE");
}
```

`setProductStatus` is non-exported (required by `"use server"`). If `type ProductStatus` from `@e-luna/db` errors, use `import type { ProductStatus } from "@prisma/client"`.

---

## ProductActions Client Component — `components/ProductActions.tsx` (`"use client"`)

Same shape as 6a's `VendorActions`.

```tsx
type Props = { productId: string; status: ProductStatus };
```

- Local `isLoading` + `error` state; `run(action)` calls it, sets error on `{ error }`, `router.refresh()` on success.
- Buttons by status:
  - `REJECTED` → **Reinstate** (sage button, `reinstateProduct`)
  - `ACTIVE` or `DRAFT` → **Reject** (coral button, `rejectProduct`)
  - `ARCHIVED` → no buttons (vendor-owned state)
- Error rendered in coral text.
- Button styles reuse the sage/coral classes from `VendorActions`.

---

## Error Handling

- All Prisma reads use `.catch()` fallbacks (`[]` / `null`).
- Server actions wrap the mutation in try/catch, return `{ success } | { error }`.
- Order detail not found → `redirect("/orders")`.
- Decimals (`total`, `subtotal`, `discount`, `shippingFee`, `price`, `unitPrice`) converted with `Number()` before arithmetic.
- `aiImages` accessed defensively (`Array.isArray` guard) since it's a Json field.

---

## Testing

No automated suite (consistent with Phases 1–6a). Verification per task:
```bash
cd apps/admin && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts"   # expect clean
cd apps/admin && npx next lint                                          # expect no errors (warnings OK)
```

New JSX must follow the established lint conventions: `next/link` `<Link>` for internal navigation, escaped JSX entities, `eslint-disable-next-line @next/next/no-img-element` on the product thumbnail `<img>`.

---

## Design Tokens (Warm Oud)

- `text-ink` / `text-mist` / `text-gold` — text, labels, accents
- `bg-sand` / `border-sand` / `bg-white` / `bg-ivory` — surfaces, borders
- `bg-sage/20 text-sage` — DELIVERED / ACTIVE badges, Reinstate button (admin accent)
- `bg-gold/20 text-gold` — in-progress order statuses, DRAFT badge
- `bg-coral/20 text-coral` — CANCELLED / REFUNDED / REJECTED badges, Reject button
- `bg-sand text-mist` — PENDING / ARCHIVED badges, fallback
- `font-display`, `text-display-sm/md`, `text-body-xs/sm/md` — typography
