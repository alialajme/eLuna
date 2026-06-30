# Phase 4c: Vendor Orders & Fulfillment — Design Spec

## Goal

Replace the Phase 4a `/orders` stub with a working order management experience: vendors see incoming orders scoped to their items, and can advance fulfillment status from PENDING through SHIPPED.

---

## Scope

| Route | Description |
|-------|-------------|
| `/orders` | Order list — one row per order, scoped to this vendor's items |
| `/orders/[id]` | Order detail — vendor's items + fulfillment action panel |

**Out of scope:** Returns (Phase 4d), courier/shipment integration (Phase 7), analytics, payouts.

---

## File Structure

```
apps/vendor/app/
├── (dashboard)/
│   └── orders/
│       ├── page.tsx                    — overwrite stub (RSC, order list)
│       ├── [id]/
│       │   └── page.tsx                — RSC, order detail + guard
│       └── components/
│           └── FulfillmentPanel.tsx    — "use client", status update actions
└── actions/
    └── order.ts                        — "use server" fulfillment action
```

---

## Data Model (relevant fields)

```
OrderItem
  id, orderId, variantId, vendorId, quantity, unitPrice, fulfillmentStatus
  → order: Order { id, createdAt, paymentMethod, address: Address, status }
  → variant: ProductVariant { size, color, product: Product { title } }

FulfillmentStatus enum: PENDING | PROCESSING | SHIPPED | DELIVERED | RETURNED
```

The `OrderItem.vendorId` field lets us query all items belonging to a vendor directly. Orders are customer-level (one Order per cart), but a vendor only owns specific OrderItems within it.

---

## Server Action — `apps/vendor/app/actions/order.ts`

```ts
"use server"

export async function updateFulfillmentStatus(
  orderItemId: string,
  status: "PROCESSING" | "SHIPPED" | "DELIVERED"
): Promise<{ success: boolean; error?: string }>
```

**Logic:**
1. `safeCurrentUser()` → null check
2. `getVendorByUserId(user.id)` → null check
3. `prisma.orderItem.findUnique({ where: { id: orderItemId }, select: { vendorId: true, fulfillmentStatus: true } })` — returns null → `{ success: false, error: "Not found" }`
4. Ownership check: `item.vendorId !== vendor.id` → `{ success: false, error: "Unauthorized" }`
5. Forward-only transition check:

```ts
const ORDER = ["PENDING", "PROCESSING", "SHIPPED", "DELIVERED"];
const currentIndex = ORDER.indexOf(item.fulfillmentStatus);
const nextIndex = ORDER.indexOf(status);
if (nextIndex <= currentIndex) return { success: false, error: "Invalid status transition" };
```

6. `prisma.orderItem.update({ where: { id: orderItemId }, data: { fulfillmentStatus: status } })`
7. `revalidatePath("/orders")` + `revalidatePath(`/orders/${item.orderId}`)`
8. Returns `{ success: true }`

---

## Order List Page — `(dashboard)/orders/page.tsx`

RSC. `searchParams: Promise<{ status?: string }>` — awaited (Next.js 15).

**Data fetch:**
```ts
const items = await prisma.orderItem.findMany({
  where: { vendorId: vendor.id },
  include: {
    order: { include: { address: true } },
    variant: { include: { product: { select: { title: true } } } },
  },
  orderBy: { createdAt: "desc" },
}).catch(() => []);
```

**Group by orderId** in the RSC (plain JS `Map`) to produce one row per order:
```ts
type OrderGroup = {
  orderId: string;
  createdAt: Date;
  city: string;         // order.address.city
  itemCount: number;
  subtotal: number;     // sum of unitPrice × quantity
  worstStatus: FulfillmentStatus;
};
```

**Worst-case status** precedence (lowest = most urgent): PENDING > PROCESSING > SHIPPED > DELIVERED > RETURNED.

**Status filter:** valid values `["PENDING","PROCESSING","SHIPPED","DELIVERED"]`. Filter is applied after grouping (filter groups by `worstStatus`).

**Layout:**
- Header: "Orders" h2
- Status filter tabs: All | Pending | Processing | Shipped | Delivered (query param `?status=`)
- Table columns: Order # (last 8 chars, monospace) | Date | Ship to (city) | Items | Your subtotal (`AED {n}`) | Status badge | View link
- Status badge colours:
  - PENDING → `bg-sand text-mist`
  - PROCESSING → `bg-gold/20 text-gold`
  - SHIPPED → `bg-gold/40 text-ink`
  - DELIVERED → `bg-sage/20 text-sage`
- "View →" link → `/orders/{orderId}`
- Empty state: "No orders yet."

---

## Order Detail Page — `(dashboard)/orders/[id]/page.tsx`

RSC. `params: Promise<{ id: string }>` — awaited.

**Data fetch:**
```ts
const items = await prisma.orderItem.findMany({
  where: { orderId: id, vendorId: vendor.id },
  include: {
    order: { include: { address: true } },
    variant: { include: { product: { select: { title: true } } } },
  },
}).catch(() => []);

if (items.length === 0) redirect("/orders");
```

The first item's `order` relation gives us order-level metadata (createdAt, paymentMethod, address).

**Metadata:** `"Order #{id.slice(-8).toUpperCase()} — Luna Vendor"`

**Layout — two columns:**

Left column (main):
- Items table: Product title | Variant (size / color) | Qty | Unit price | Line total
- `<FulfillmentPanel>` client component below table

Right sidebar:
- Order # (last 8 chars, monospace)
- Placed date
- Payment method (formatted: `CARD` → "Card", `LUNA_WALLET` → "Luna Wallet", etc.)
- Ship-to address: `address.fullName`, `address.addressLine1`, `address.city`, `address.emirate`, "UAE"
- Your subtotal (sum of this vendor's items)

---

## FulfillmentPanel — `(dashboard)/orders/components/FulfillmentPanel.tsx`

`"use client"`. Props:
```ts
type Props = {
  items: Array<{ id: string; fulfillmentStatus: string }>;
  orderId: string;
};
```

**State:** `useTransition` for async; local `statuses` map (itemId → FulfillmentStatus) initialised from props.

**Logic:**
- Compute `worstStatus` from `statuses` map (same precedence order as list page)
- If all DELIVERED → render "Fulfilled ✓" (no button)
- Otherwise render one action button based on `worstStatus`:
  - PENDING → "Mark as Processing" (advances all PENDING items)
  - PROCESSING → "Mark as Shipped" (advances all PROCESSING items)
  - SHIPPED → "Mark as Delivered" (advances all SHIPPED items)
- On click: call `updateFulfillmentStatus(itemId, nextStatus)` for each eligible item in sequence, update local `statuses` on success
- Button disabled while `isPending`; inline error shown if any call fails

---

## Address Model

The `Address` record (referenced by `order.addressId`) has: `fullName`, `addressLine1`, `addressLine2?`, `city`, `emirate?`, `country`. `fullName`, `addressLine1`, `city`, `emirate` are used in the sidebar.

---

## Shared Constraints

- All RSC pages follow `safeCurrentUser()` + `getVendorByUserId()` → return null pattern
- All Prisma calls have `.catch()` fallbacks
- Next.js 15: `params` and `searchParams` are Promises — always `await` them
- `unitPrice` from Prisma is Decimal → use `Number()` to convert for arithmetic
- `PaymentMethod` enum values: `CARD`, `LUNA_WALLET`, `TABBY`, `TAMARA` — display with a label map

---

## Design Tokens

Same Warm Oud palette as Phase 4b:
- `bg-sand text-mist` — PENDING badge
- `bg-gold/20 text-gold` — PROCESSING badge
- `bg-gold/40 text-ink` — SHIPPED badge
- `bg-sage/20 text-sage` — DELIVERED badge
- `text-coral` — errors
- `text-ink` — primary text
- `text-mist` — secondary/label text
