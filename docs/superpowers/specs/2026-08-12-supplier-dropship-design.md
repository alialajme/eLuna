# Supplier Dropship → Customer Design

**Status:** Approved (brainstorming) — 2026-08-12
**Relationship:** Builds on the Supplier persona (S1–S3), the 7a per-vendor `Shipment` model, and the shared
`@e-luna/courier` gateway (Supplier Courier feature). This is **feature #3 of 4** the user queued.

## Goal

Let a **vendor** mark a product as *dropshipped by a supplier*, so that when a customer buys it, the
**supplier fulfils and ships directly to the customer** — instead of the vendor holding stock and shipping.
The vendor keeps the listing, price, and the customer relationship; the supplier is the hidden fulfiller.

**Success criteria:** a vendor assigns an ACTIVE supplier to a product; a customer buys it (checkout
unchanged, pays the vendor retail); the supplier sees a **Customer fulfilment** queue with that order's
items and the customer's shipping address; the supplier ships via the courier gateway (Simulated → manual
tracking with no keys), creating a `Shipment` that flips the items to SHIPPED and recomputes the order; the
supplier marks it delivered; the customer sees courier + tracking on their order **with no mention of the
supplier**; the vendor sees "Fulfilled by <supplier>" (read-only) and is not asked to ship those items.

## Confirmed Decisions

- **Money — operational only (defer payout).** The customer pays the vendor retail; **checkout is
  untouched**. The vendor↔supplier wholesale settlement is offline (same PO-record philosophy as
  `MaterialOrder`). No supplier-payout ledger in this phase.
- **Linking — vendor assigns per product.** `Product.dropshipSupplierId` (optional). The vendor picks an
  ACTIVE supplier in the product form. **No relationship-approval subsystem and no per-order accept/reject**
  — the vendor choosing the supplier *is* the authorization (they already transact via material orders).
- **Fulfilment — reuse the 7a `Shipment` model.** Add `Shipment.supplierId` (optional; vendor-created
  shipments leave it null). A dropship shipment sets **both** `vendorId` (the listing vendor, so vendor
  queries + `recomputeOrderStatus` keep working) **and** `supplierId` (the fulfiller).
- **Customer invisibility.** The customer order view shows only courier + tracking (as today). `supplierId`
  is never surfaced customer-side. **No change to the customer order page.**
- **Delivery — manual for this phase.** The supplier marks a dropship shipment delivered (reusing the shared
  status logic). Real-courier webhook auto-delivery for dropship is deferred (operator step; matches how the
  whole courier stack runs locally via Simulated).

## Non-Goals (deferred)

- Supplier payout / wholesale-cost capture / earnings ledger for dropship.
- Per-order supplier accept/reject or a supplier↔vendor dropship-relationship handshake.
- Courier-webhook auto-delivery for dropship customer shipments (manual mark-delivered for now).
- Returns/RMA routing to the supplier for dropship items (returns stay vendor-driven — out of scope).
- Multi-vendor-in-one-parcel: the supplier fulfils **one (order, listing-vendor) group per shipment**
  (mirrors the existing per-vendor `Shipment` model, keeps 1 tracking# : 1 shipment for the webhook).

## Part A — Extract shared order-status helpers to `@e-luna/db`

`recomputeOrderStatus` (currently `apps/vendor/app/lib/order-status.ts`) and `applyShipmentStatus`
(currently `apps/vendor/app/lib/courier/apply-status.ts`) encode the customer-order fulfilment state machine.
The supplier now needs the **same** logic (a dropship shipment flips items + recomputes the order, and
mark-delivered must behave identically to the vendor's). Move both into **`@e-luna/db/src/order-status.ts`**
(the package already hosts domain helpers — `settings.ts`, `categories.ts`) and export them from the
`@e-luna/db` barrel. Repoint the vendor (`actions/shipment.ts`, the courier webhook route) to import from
`@e-luna/db`; delete the two vendor-local files. Single source of truth for both apps. (The vendor courier
`apply-status.ts` is replaced by the `@e-luna/db` export; the vendor webhook keeps its neutral→ShipmentStatus map.)

## Part B — Data model (Prisma, `db push`)

- **`Product.dropshipSupplierId String?`** + relation `dropshipSupplier Supplier? @relation("SupplierDropshipProducts", fields: [dropshipSupplierId], references: [id])`; back-relation on `Supplier`:
  `dropshipProducts Product[] @relation("SupplierDropshipProducts")`. Index `@@index([dropshipSupplierId])`.
- **`Shipment.supplierId String?`** + relation `supplier Supplier? @relation("SupplierCustomerShipments", fields: [supplierId], references: [id])`; back-relation on `Supplier`:
  `customerShipments Shipment[] @relation("SupplierCustomerShipments")`. Index `@@index([supplierId])`.
  (`Shipment.vendorId` stays required.)

## Part C — Vendor side (`apps/vendor`)

- **Product form** — add a "Fulfilled by supplier (dropship)" `<select>` (options: "In-house (I ship)" +
  ACTIVE suppliers by `companyName`). The new/edit product pages fetch ACTIVE suppliers and pass them to
  `ProductForm` as a `suppliers` prop. `actions/product.ts` validates `dropshipSupplierId` is either null or
  an existing ACTIVE supplier id; persists it.
- **`createShipment` guard** — the vendor must not ship dropship items. Exclude items whose
  `product.dropshipSupplierId` is set from the vendor's shippable-items query (add
  `variant: { product: { dropshipSupplierId: null } }` to the `where`).
- **Order detail / `FulfillmentPanel`** — render dropship items in a read-only "Fulfilled by <supplier>
  (dropship)" group (the supplier ships these); only in-house items get the create-shipment control. The
  panel receives, per item, an optional `dropshipSupplierName` and renders accordingly.

## Part D — Supplier side (`apps/supplier`)

- **Customer fulfilment queue** — new route `(dashboard)/fulfilment` listing **(order × listing-vendor)
  groups** that need this supplier's dropship fulfilment: order items where
  `variant.product.dropshipSupplierId == supplier.id`, `fulfillmentStatus ∈ {PENDING, PROCESSING}`, and the
  order is a paid sale (`order.status ∈ {CONFIRMED, PROCESSING}`). Each card shows the order ref, the
  customer's shipping address, the items, and a **Ship** control. A second view lists this supplier's already
  shipped/delivered dropship shipments (`Shipment.supplierId == supplier.id`) with courier + tracking + a
  **Mark delivered** button (while IN_TRANSIT).
- **`shipDropshipItems({ orderId, vendorId, courier, trackingNumber?, trackingNote? })`** (supplier action)
  — resolve ACTIVE supplier server-side; load the order's items where
  `vendorId == <vendorId> AND variant.product.dropshipSupplierId == supplier.id AND fulfillmentStatus ∈
  {PENDING, PROCESSING}` and `order.status ∈ {CONFIRMED, PROCESSING}`; guard non-empty + `getCourier(courier)`.
  Call `getCourierGateway(courier).createShipment({ reference: orderId, courier, destination: <customer
  address> })` (`created` → auto tracking/label; `manual` → require trackingNumber; `failed` → error). In a
  `$transaction`: create `Shipment { orderId, vendorId, supplierId: supplier.id, courier, trackingNumber,
  externalRef, labelUrl, status: "IN_TRANSIT", … }`, set those items' `shipmentId` + `fulfillmentStatus:
  "SHIPPED"`; then `recomputeOrderStatus(orderId)` (from `@e-luna/db`). One shipment per call (one
  order-vendor group).
- **`markDropshipDelivered(shipmentId)`** (supplier action) — resolve ACTIVE supplier; load the shipment,
  assert `shipment.supplierId == supplier.id` and `status != "DELIVERED"`; call
  `applyShipmentStatus(shipmentId, "DELIVERED")` (from `@e-luna/db`; flips items + recomputes the order).
- **Sidebar** — add "📦 Customer Orders" nav; dashboard card shows the pending dropship-fulfilment count.
- The supplier reuses `@e-luna/courier` (already a dep from the Supplier Courier feature) and
  `@e-luna/ui/couriers` (COURIERS / trackingUrl). No new supplier deps.

## Part E — Customer side (`apps/customer`)

**No change.** The order page already renders `order.shipments` (courier + tracking + timeline). A dropship
shipment appears there naturally; `supplierId` is not read or displayed → the supplier stays invisible.

## Data Flow

1. Vendor edits a product → "Fulfilled by supplier: <S>" → `Product.dropshipSupplierId = S`.
2. Customer buys it (checkout unchanged) → paid `Order` with a dropship `OrderItem`.
3. Supplier S opens **Customer fulfilment** → sees the (order, vendor) group + customer address → **Ship**
   (courier + tracking) → `Shipment {vendorId, supplierId:S}` created, items SHIPPED, order recomputed.
4. Customer sees courier + tracking on their order (no supplier shown). Vendor sees "Fulfilled by S".
5. Supplier marks delivered → items DELIVERED, order recomputed (→ DELIVERED when all items delivered).

## Error Handling

Actions return `{ success, error? }`; `supplierId`/`vendorId` server-resolved, never client params. Guards:
supplier ACTIVE; order is a paid sale; items belong to the (order, vendor) group and are this supplier's
dropship items and unshipped; `getCourier` valid; gateway `failed`/`manual` handled. Shipment creation +
item flips are transactional; `recomputeOrderStatus`/`applyShipmentStatus` are the shared, idempotent
state-machine. DB reads `.catch`-guarded; `markDropshipDelivered` ownership-checked. The vendor
`createShipment` excludes dropship items (they can't be shipped by the vendor).

## Testing

No automated suite — types + lint + manual:
1. `db:generate` + `db:push` (Product/Shipment fields).
2. `pnpm --filter "@e-luna/*" exec tsc --noEmit` — clean (incl. the repointed vendor + `@e-luna/db` helpers).
3. `pnpm lint` — clean.
4. gitleaks — clean.
5. Manual: vendor assigns supplier S to a product; place a customer order for it; S sees it in Customer
   fulfilment with the customer address; S ships (manual tracking) → order status advances, vendor sees
   "Fulfilled by S" and no ship control for that item, customer sees tracking with **no supplier name**; S
   marks delivered → order DELIVERED. A non-dropship product still ships from the vendor unchanged.

## File Summary

- Modify: `packages/db/prisma/schema.prisma` (`Product.dropshipSupplierId`, `Shipment.supplierId` + relations);
  create `packages/db/src/order-status.ts` (moved `recomputeOrderStatus` + `applyShipmentStatus`), export from
  `packages/db/src/index.ts`.
- Vendor: delete `app/lib/order-status.ts` + `app/lib/courier/apply-status.ts`; repoint
  `app/actions/shipment.ts` + `app/api/webhooks/courier/[courier]/route.ts` to `@e-luna/db`; modify
  `app/actions/product.ts` (validate/persist `dropshipSupplierId`), the new/edit product pages + `ProductForm`
  (supplier picker), `createShipment` (exclude dropship items), order-detail `FulfillmentPanel` (read-only
  dropship group).
- Supplier: create `app/actions/dropship.ts` (`shipDropshipItems`, `markDropshipDelivered`),
  `(dashboard)/fulfilment/page.tsx` + a ship-form island; modify the Sidebar + dashboard card.
- Customer: none.
- Docs: note the dropship fulfilment path in `docs/deployment/couriers.md` (manual delivery this phase).
