# Supplier S3 — Sourcing & Orders Design

**Status:** Approved (brainstorming) — 2026-08-10
**Phase:** Supplier S3 (final of the 3-phase Supplier build: S1 Foundation ✅ → S2 Materials Catalog ✅ → **S3 Sourcing & Orders**)

## Goal

Close the supplier loop: let a **vendor** browse the materials suppliers list (S2) and place an order,
and let the **supplier** receive and fulfil that order. This replaces the "Incoming Orders — coming
soon" seam in the supplier dashboard and adds a **Sourcing** section to the vendor dashboard.

**Success criteria:** a vendor can browse ACTIVE materials from ACTIVE suppliers, open one, and place a
single-material order (quantity ≥ the material's MOQ, ≤ stock), creating a `MaterialOrder`; the owning
supplier sees it under Incoming Orders and can accept (committing stock), reject, ship (with a tracking
note), and complete it; the vendor can track their orders and cancel one while it is still PENDING.
All access is scoped — a vendor sees only their own material orders, a supplier only orders addressed
to them; neither can act on the other's records.

## Context & Rationale

- S1 shipped the Supplier persona + app; S2 shipped the `Material` catalog. S3 makes materials
  transactable between the two existing marketplace personas (Vendor buys, Supplier sells) — the
  upstream B2B leg of the "commerce OS for the abaya industry."
- Per the brainstorming decision, the vendor places a **single-material quick order** (open a material,
  enter a quantity, order it) — **no cart**. The schema still models `MaterialOrder → MaterialOrderItem[]`
  (a header + line rows) so multi-line orders are possible later, but the S3 UI creates one-line orders.
- This mirrors the customer `Order → OrderItem` shape and the existing vendor/supplier dashboard
  patterns, so it reuses well-worn conventions.

## Non-Goals (deferred)

- **Payment integration.** A `MaterialOrder` is a purchase-order record with a computed `total`;
  vendor↔supplier settlement happens offline (or a future phase). The payments gateway is intentionally
  NOT wired into B2B ordering.
- **Courier gateway.** Fulfilment is a simple status machine with an optional free-text tracking note;
  no `CourierGateway`/webhook machinery (that lives in the customer-facing 7a courier work).
- Multi-line carts, supplier payouts/analytics for material sales, a Supplier AI agent, returns/refunds
  on material orders, MOQ tiers/price breaks.

## Data Model (Prisma — repo uses `prisma db push`, NO migration files)

All changes in `packages/db/prisma/schema.prisma`.

1. **New `enum MaterialOrderStatus`:**
   ```prisma
   enum MaterialOrderStatus {
     PENDING
     ACCEPTED
     SHIPPED
     COMPLETED
     CANCELLED
     REJECTED
   }
   ```

2. **New `model MaterialOrder`** (the order header — one supplier, one vendor):
   ```prisma
   model MaterialOrder {
     id           String              @id @default(cuid())
     vendorId     String              // buyer
     supplierId   String              // seller
     status       MaterialOrderStatus @default(PENDING)
     total        Decimal             @db.Decimal(10, 2)
     note         String?             // vendor → supplier, at placement
     trackingNote String?             // supplier → vendor, at ship
     createdAt    DateTime            @default(now())
     updatedAt    DateTime            @updatedAt

     vendor   Vendor              @relation(fields: [vendorId], references: [id])
     supplier Supplier            @relation(fields: [supplierId], references: [id])
     items    MaterialOrderItem[]

     @@index([vendorId])
     @@index([supplierId])
     @@index([supplierId, status])
     @@index([vendorId, status])
   }
   ```

3. **New `model MaterialOrderItem`** (line row — snapshotted for history integrity):
   ```prisma
   model MaterialOrderItem {
     id           String       @id @default(cuid())
     orderId      String
     materialId   String?      // FK kept for reference; nulled if the material is later deleted
     materialName String       // snapshot
     unit         MaterialUnit // snapshot
     unitPrice    Decimal      @db.Decimal(10, 2) // snapshot of wholesalePrice at order time
     quantity     Int

     order    MaterialOrder @relation(fields: [orderId], references: [id], onDelete: Cascade)
     material Material?     @relation(fields: [materialId], references: [id], onDelete: SetNull)

     @@index([orderId])
     @@index([materialId])
   }
   ```

4. **Back-relations** to add:
   - `model Vendor` → `materialOrders MaterialOrder[]`
   - `model Supplier` → `materialOrders MaterialOrder[]`
   - `model Material` → `orderItems MaterialOrderItem[]`

Regenerate offline: `pnpm --filter @e-luna/db db:generate`; apply: `pnpm --filter @e-luna/db db:push`.
`MaterialOrderStatus`, `MaterialOrder`, `MaterialOrderItem` re-export through the `@e-luna/db` barrel.

Rationale for snapshots: `materialName`/`unit`/`unitPrice` are copied onto the line at order time so an
order's history is stable even if the supplier later edits or deletes the material (`materialId` then
becomes `null` via `SetNull`, but the line still shows what was ordered).

## Vendor Sourcing (apps/vendor)

New `(dashboard)/sourcing` section. All vendor scoping resolves server-side from
`safeCurrentUser` → `getVendorByUserId` (never a client param).

- **`(dashboard)/sourcing/page.tsx`** (RSC) — browse listings: `prisma.material.findMany` where
  `status: "ACTIVE"` AND `supplier.status: "ACTIVE"`, `include: { supplier: { select: { companyName } } }`,
  `orderBy: { updatedAt: "desc" }`, `.catch(() => [])`. Optional `?type=` filter over `MATERIAL_TYPES`.
  Cards show name, supplier company, `AED {wholesalePrice} / {unit}`, MOQ, stock, link to detail.
- **`sourcing/[id]/page.tsx`** (RSC) — the material (must be ACTIVE and its supplier ACTIVE, else
  `notFound()`), supplier name, composition/description, and a `PlaceOrderForm` client island.
- **`components/PlaceOrderForm.tsx`** (client) — quantity input (defaults to `moq`, `min={moq}`,
  `max={stock}`), a live line total (`wholesalePrice × quantity`), an optional note, "Place order"
  button → `createMaterialOrder(materialId, quantity, note?)`; on success routes to `/sourcing/orders`.
- **`sourcing/orders/page.tsx`** (RSC) — the vendor's material orders (`where: { vendorId }`, status
  filter), each showing supplier, total, status, created date, link to detail.
- **`sourcing/orders/[id]/page.tsx`** (RSC) — order detail (ownership-checked → `notFound`): line items,
  total, status timeline, supplier tracking note, and a **Cancel** control shown only while PENDING.
- **`actions/sourcing.ts`** (server):
  - `createMaterialOrder(materialId: string, quantity: number, note?: string)` — resolve vendor; load
    the material with its supplier; require `material.status === "ACTIVE"` and
    `material.supplier.status === "ACTIVE"`; validate `Number.isInteger(quantity)`,
    `quantity >= material.moq`, `quantity <= material.stock`; `note` trimmed ≤ 500. Compute
    `unitPrice = material.wholesalePrice`, `total = unitPrice × quantity`. Create the `MaterialOrder`
    (PENDING) with one nested `MaterialOrderItem` snapshotting `materialName`/`unit`/`unitPrice`/`quantity`.
    Returns `{ success, id?, error? }`. (No stock change at placement — stock is committed on accept.)
  - `cancelMaterialOrder(orderId: string)` — resolve vendor; load order; require
    `order.vendorId === vendor.id` and `order.status === "PENDING"`; set `CANCELLED`. Returns `{ success, error? }`.
- **Vendor Sidebar** — add `{ icon: "🧶", label: "Sourcing", href: "/sourcing" }` to `NAV_ITEMS`
  (placed after an existing sensible entry, e.g. after Inventory).

## Supplier Fulfilment (apps/supplier)

New `(dashboard)/orders` section. Supplier scoping resolves server-side from
`safeCurrentUser` → `getSupplierByUserId`.

- **`(dashboard)/orders/page.tsx`** (RSC) — incoming orders: `where: { supplierId }` (+ status filter),
  `include: { items: true, vendor: { select: { storeName } } }`, newest first. Each row: vendor store,
  item summary, total, status badge, link to detail.
- **`orders/[id]/page.tsx`** (RSC) — order detail (ownership-checked → `notFound`): buyer, line items,
  total, vendor note, status, and an `OrderActions` client island with the buttons valid for the current
  status.
- **`components/OrderActions.tsx`** (client) — Accept / Reject (when PENDING), Ship + a tracking-note
  input (when ACCEPTED), Complete (when SHIPPED). Calls the actions below via `useTransition`; shows
  inline errors; `router.refresh()` on success.
- **`actions/incoming-order.ts`** (server) — supplier-scoped, ownership + state-precursor guards:
  - `acceptMaterialOrder(id)` — require owner + `status === "PENDING"`. In a `prisma.$transaction`:
    for the order's single line, reload `Material.stock`; if `materialId` is null or `stock < quantity`
    → return `{ success: false, error: "Insufficient stock" }` (abort, no writes); else decrement
    `Material.stock` by `quantity` and set the order `ACCEPTED`. (Stock is committed here, preventing
    oversell across concurrent orders.)
  - `rejectMaterialOrder(id)` — owner + PENDING → `REJECTED` (no stock change).
  - `shipMaterialOrder(id, trackingNote?)` — owner + `ACCEPTED` → `SHIPPED`, store `trackingNote`
    (trimmed ≤ 200, nullable).
  - `completeMaterialOrder(id)` — owner + `SHIPPED` → `COMPLETED`.
  - All return `{ success, error? }`, `revalidatePath("/orders")` + `/orders/${id}`.
- **Supplier Sidebar** — move "Incoming Orders" from `SOON_ITEMS` to a real `NAV_ITEMS` link
  (`{ icon: "📋", label: "Incoming Orders", href: "/orders" }`); `SOON_ITEMS` becomes empty and its
  rendering block is removed (no more "coming soon" items).
- **Supplier dashboard `(dashboard)/page.tsx`** — replace the "Incoming orders — COMING SOON" card with
  a live `Link` to `/orders` showing the count of PENDING orders (mirrors how S2 made the Materials card
  live). Leave the Materials card as-is.

## Data Flow

1. Vendor → Sourcing → material detail → `PlaceOrderForm` → `createMaterialOrder` → `MaterialOrder(PENDING)`
   + one line (snapshot). Vendor sees it under `/sourcing/orders`.
2. Supplier → Incoming Orders → detail → **Accept** (stock committed transactionally) or **Reject**.
3. Supplier → **Ship** (tracking note) → **Complete**.
4. Vendor may **Cancel** only while PENDING.

## Error Handling

- All actions return `{ success: boolean; error?: string }` (create also `id`); scoping ids are
  server-resolved; every mutation ownership-checks and guards the precursor status.
- Placement validates ACTIVE material + ACTIVE supplier + integer qty in `[moq, stock]`.
- Accept re-checks stock inside a transaction (oversell-safe); insufficient stock aborts with an error.
- DB reads `.catch(() => fallback)`; `[id]` pages `notFound()` on missing/unowned records.

## Testing

No automated suite — verification is types + lint + manual:
1. `pnpm --filter @e-luna/db db:generate` (regenerate with the new models/enum).
2. `pnpm --filter "@e-luna/*" exec tsc --noEmit` — clean.
3. `pnpm lint` — clean (vendor + supplier apps included).
4. gitleaks — clean.
5. Manual: as a vendor, browse Sourcing, place an order (qty < MOQ and qty > stock both rejected); as
   the supplier, Accept (material stock drops by qty), Ship (tracking note), Complete; as the vendor,
   Cancel a different PENDING order; confirm a second vendor cannot see/cancel the first vendor's order
   and a second supplier cannot act on another supplier's order.

## File Summary

- Modify: `packages/db/prisma/schema.prisma` (enum + `MaterialOrder` + `MaterialOrderItem` + 3 back-relations)
- Vendor: create `actions/sourcing.ts`, `(dashboard)/sourcing/page.tsx`,
  `sourcing/[id]/page.tsx`, `sourcing/orders/page.tsx`, `sourcing/orders/[id]/page.tsx`,
  `components/PlaceOrderForm.tsx`; modify `(dashboard)/components/Sidebar.tsx`.
- Supplier: create `actions/incoming-order.ts`, `(dashboard)/orders/page.tsx`, `orders/[id]/page.tsx`,
  `components/OrderActions.tsx`; modify `(dashboard)/components/Sidebar.tsx` and `(dashboard)/page.tsx`.
