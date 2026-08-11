# Supplier Courier Integration Design

**Status:** Approved (brainstorming) — 2026-08-11
**Relationship:** Extends the existing **Courier Integration** (vendor customer-order shipments,
`apps/vendor/app/lib/courier/`) to the **supplier → vendor** leg of a `MaterialOrder`. Same
credential-gated gateway pattern (Simulated default + config-gated real scaffold + webhook), reused via a
newly extracted shared package.

## Goal

Let a **supplier** ship a fulfilled `MaterialOrder` to the buying **vendor** through a real courier
(Aramex/DHL), and let the vendor see live tracking. Today the supplier's `shipMaterialOrder` only records a
free-text `trackingNote`. This adds structured courier data (courier id, tracking number, external ref,
label URL) sourced from the credential-gated `CourierGateway`, plus a webhook that advances the order on
delivery.

**Success criteria:** an ACTIVE supplier, on an ACCEPTED `MaterialOrder`, picks a courier and ships it; with
no courier API keys the Simulated gateway asks for a manual tracking number (today's behavior, now
structured); with a real courier configured, the gateway returns a tracking number + label and a delivery
webhook moves the order `SHIPPED → COMPLETED`; the buying vendor sees the courier name, a tracking
deep-link, and status on their sourcing order page. The vendor's existing customer-order courier flow keeps
working unchanged after the package extraction.

## Confirmed Decisions

- **Extract a shared `@e-luna/courier` package** from `apps/vendor/app/lib/courier/` (the pure gateway:
  interface + config + Simulated + Aramex/DHL scaffolds + factory), reused by supplier + vendor; repoint the
  vendor. Each app keeps its **own** `apply-status` (the DB-write semantics differ: vendor → `Shipment`,
  supplier → `MaterialOrder`).
- **Generalize the webhook event status** to a neutral `CourierDeliveryStatus = "in_transit" | "delivered"
  | "exception"` (was the customer-order-specific `ShipmentStatus`). Each app maps neutral → its own state.
- **Auto-complete on delivered:** a courier `delivered` webhook idempotently moves `MaterialOrder`
  `SHIPPED → COMPLETED`. The supplier's manual "Mark complete" stays. Locally (Simulated, no webhook)
  nothing changes — manual complete remains the only path.
- **Add DHL scaffold** alongside the existing Aramex scaffold (both config-gated, both fall back to
  Simulated without keys). The shared `@e-luna/ui/couriers` registry already includes Aramex + DHL +
  tracking deep-links.
- Structured courier fields live **on `MaterialOrder`** (no separate shipment table — a material order is a
  single supplier → single parcel; unlike a customer order that fans out to multiple vendors).

## Non-Goals (deferred)

- Real Aramex/DHL API calls (the scaffolds stay `TODO(operator)`, credential-gated — unchanged pattern).
- A vendor-side "confirm received" action (auto-complete-on-delivered covers it; settlement is offline).
- Returns/RMA on material orders; multi-parcel/partial shipments; label re-print history.
- Changing the customer-order (`Shipment`) courier behavior beyond the mechanical repoint + neutral-status map.

## Part A — Extract the shared `@e-luna/courier` package

Move `apps/vendor/app/lib/courier/{gateway,config,simulated,aramex,factory}.ts` into a new workspace package
**`packages/courier`** (`@e-luna/courier`), exporting raw TS (`./src/index.ts`, like `@e-luna/db`/`@e-luna/einvoice`).

**`gateway.ts` (generalized):**
```ts
export type CourierDeliveryStatus = "in_transit" | "delivered" | "exception";

export type CreateShipmentParams = {
  reference: string; // orderId (customer) or materialOrderId (supplier) — opaque to the gateway
  courier: string;
  destination: { name: string; addressLine1: string; city: string; emirate: string | null };
  weightKg?: number;
};
export type CreateShipmentResult =
  | { status: "created"; trackingNumber: string; externalRef: string; labelUrl?: string }
  | { status: "manual" }
  | { status: "failed"; error: string };
export type CourierStatusEvent =
  | { match: { trackingNumber?: string; externalRef?: string }; status: CourierDeliveryStatus }
  | { kind: "ignored" };
export interface CourierGateway {
  createShipment(params: CreateShipmentParams): Promise<CreateShipmentResult>;
  parseWebhook?(rawBody: string, headers: Headers): CourierStatusEvent;
}
```
- `config.ts` — `hasAramex()`, `hasDhl()`, (+ the existing `hasFetchr`/`hasQuiqup`/`hasEmiratesPost` carried
  over unchanged so the vendor factory keeps compiling).
- `simulated.ts` — `SimulatedCourier` (returns `{ status: "manual" }`), unchanged.
- `aramex.ts` — `AramexCourier` scaffold, unchanged except `CreateShipmentParams.orderId`→`reference` and the
  neutral status in `parseWebhook`.
- `dhl.ts` — `DhlCourier` scaffold, a copy of the Aramex template (env `DHL_API_KEY`/`DHL_WEBHOOK_SECRET`,
  `TODO(operator)`), returns `{ status: "failed", error: "DHL API not configured" }` / `{ kind: "ignored" }`.
- `factory.ts` — `getCourierGateway(courierId)`: `aramex` → `hasAramex()?Aramex:Simulated`; `dhl` →
  `hasDhl()?Dhl:Simulated`; default → Simulated. Never throws.
- `index.ts` barrel re-exports all types + `getCourierGateway` + the classes.

**Repoint the vendor:** `apps/vendor/app/lib/courier/` keeps **only** `apply-status.ts` (customer-order
`Shipment` semantics). The vendor `createShipment` action, the webhook route, and `apply-status` import the
gateway/factory from `@e-luna/courier`. Because the event status is now neutral, the vendor webhook maps
`"delivered" → ShipmentStatus.DELIVERED`, `"in_transit"/"exception" → IN_TRANSIT` before calling
`applyShipmentStatus`. `CreateShipmentParams.orderId` call-site becomes `reference: input.orderId`. Add
`@e-luna/courier` to the vendor app deps + `transpilePackages`.

`packages/courier/package.json` = `@e-luna/courier`, `devDependencies`: `@e-luna/config`, `typescript`,
`@types/node` (for `process.env`), `@e-luna/db` only if a type is needed (it is **not** after the neutral
status — the package no longer imports `@e-luna/db`). tsconfig extends `@e-luna/config/tsconfig/base`.

## Part B — Data model (Prisma, `db push`)

Add to **`model MaterialOrder`** (all optional, additive):
```prisma
  courier        String?
  trackingNumber String?
  externalRef    String?
  labelUrl       String?
```
`trackingNote` stays (optional free-text note the supplier may still add). No new enum — `MaterialOrderStatus`
already has `SHIPPED`/`COMPLETED`.

## Part C — Supplier side (`apps/supplier`)

- **`app/lib/courier/apply-status.ts`** (new, supplier-local): `applyMaterialOrderDelivery(materialOrderId)`
  — idempotently moves `SHIPPED → COMPLETED` (guarded `updateMany({ where: { id, status: "SHIPPED" }, data:
  { status: "COMPLETED" } })`); no-op otherwise. (Only "delivered" changes state; "in_transit"/"exception"
  are informational — the order is already `SHIPPED`.)
- **`actions/incoming-order.ts` → `shipMaterialOrder`** changes signature to
  `shipMaterialOrder(orderId, input: { courier: string; trackingNumber?: string; trackingNote?: string })`:
  - Resolve ACTIVE supplier server-side; load owned order; require `status === "ACCEPTED"`.
  - Validate `getCourier(input.courier)` exists (`@e-luna/ui/couriers`).
  - Load the buying vendor's address for the destination (`order.vendor` → a shipping address; if the
    `Vendor` has no structured address, pass `storeName` as `name` and blank address lines — the gateway
    only needs it for a real API, and Simulated ignores it). **Decision:** destination `name =
    vendor.storeName`, address fields best-effort (`""`/`null`) since `Vendor` has no address model today;
    documented as an operator follow-up for real couriers.
  - Call `getCourierGateway(input.courier).createShipment({ reference: orderId, courier, destination })`.
    `failed` → return error; `created` → use returned tracking/externalRef/labelUrl; `manual` → require
    `input.trackingNumber` (else error "Tracking number is required").
  - `update` the order: `status: "SHIPPED"`, `courier`, `trackingNumber`, `externalRef`, `labelUrl`,
    `trackingNote` (trimmed ≤200 or null). `revalidatePath`.
- **`app/api/webhooks/courier/[courier]/route.ts`** (new): mirror the vendor route — `getCourierGateway`,
  `parseWebhook` (400 on throw/bad-sig), `match` on `{ courier, OR: [{externalRef},{trackingNumber}] }`
  against `MaterialOrder`; on a `delivered` event call `applyMaterialOrderDelivery(order.id)`; always 200
  for ignored/unmatched.
- **Ship form** (the island rendered on the supplier order-detail when `status === "ACCEPTED"`): courier
  `<select>` (from `COURIERS`), optional tracking-number input (required when the gateway returns manual —
  simplest: always show it, labeled "Tracking number (required unless auto-generated)"), optional note.
  On success shows tracking + "Print label" link when `labelUrl` present. Replaces today's plain
  ship/trackingNote control.
- **Supplier order-detail** shows courier name + tracking deep-link (`trackingUrl`) + label link for a
  SHIPPED/COMPLETED order.

## Part D — Vendor side (buyer view, `apps/vendor`)

- **`(dashboard)/sourcing/orders/[id]/page.tsx`** — replace the bare `trackingNote` block with a shipment
  panel: when `courier` is set, show `courierName(order.courier)` + (if `trackingNumber`) a
  `trackingUrl(...)` deep-link "Track <n> →" (or plain text if no URL) + the order status; still show
  `trackingNote` if present. Read-only (the vendor doesn't act on it).

## Part E — Fold-in fix (from Vendor Invoicing review)

- **I1:** `apps/vendor/app/actions/invoice.ts` P2002 compound-key check — replace
  `target.includes("orderId") || target.includes("vendorId")` with
  `target.some((t) => t.includes("orderId") && t.includes("vendorId"))` so the Postgres compound constraint
  name (`OrderInvoice_orderId_vendorId_key`) is matched (→ "already invoiced" instead of a wasted retry).

## Data Flow

1. Supplier accepts a `MaterialOrder` (stock committed — existing S3 behavior).
2. Supplier opens the order → "Ship" → picks courier (+ tracking if manual) → `shipMaterialOrder` →
   gateway `createShipment` → order `SHIPPED` with structured courier fields.
3. Vendor opens their sourcing order → sees courier + tracking deep-link + status.
4. (Real courier only) courier posts a webhook → `parseWebhook` → `delivered` → `applyMaterialOrderDelivery`
   → order `COMPLETED`. Or the supplier clicks "Mark complete" manually (any time from SHIPPED).

## Error Handling

- Actions return `{ success, error? }`; `supplierId`/`vendorId` server-resolved; ownership + status guards
  on every mutation (`shipMaterialOrder` requires ACCEPTED + owned). Gateway `failed` surfaces its error;
  `manual` requires a tracking number. Webhook: 400 on bad signature, 200 otherwise (idempotent apply,
  `.catch`-logged). DB reads `.catch`-guarded. The factory never throws (unconfigured → Simulated).

## Testing

No automated suite — types + lint + manual:
1. `pnpm install` (new `@e-luna/courier` + vendor/supplier deps) + `db:generate` + `db:push`.
2. `pnpm --filter "@e-luna/*" exec tsc --noEmit` — clean (incl. the repointed vendor).
3. `pnpm lint` — clean.
4. gitleaks — clean.
5. Manual: supplier ships an ACCEPTED order via Simulated (enter tracking) → order SHIPPED, vendor sees the
   courier + deep-link; supplier "Mark complete" → COMPLETED; the vendor's **customer-order** shipment flow
   (7a + Courier Integration) still creates shipments and marks delivered after the extraction.

## File Summary

- Create: `packages/courier/` (`package.json`, `tsconfig.json`, `src/{gateway,config,simulated,aramex,dhl,factory,index}.ts`).
- Modify: `apps/vendor/app/lib/courier/` — delete `{gateway,config,simulated,aramex,factory}.ts` (moved),
  keep `apply-status.ts`; repoint `actions/shipment.ts`, `api/webhooks/courier/[courier]/route.ts`,
  `apply-status.ts` imports to `@e-luna/courier` + neutral-status map; `apps/vendor/package.json` +
  `next.config.ts` (add `@e-luna/courier`).
- Modify: `packages/db/prisma/schema.prisma` (`MaterialOrder` courier fields).
- Supplier: create `app/lib/courier/apply-status.ts`, `api/webhooks/courier/[courier]/route.ts`, a ship-form
  island; modify `actions/incoming-order.ts` (`shipMaterialOrder`), the supplier order-detail page,
  `package.json` + `next.config.ts` (add `@e-luna/courier`).
- Vendor buyer view: modify `(dashboard)/sourcing/orders/[id]/page.tsx`.
- Fix: `apps/vendor/app/actions/invoice.ts` (I1).
- `.env.example`: `DHL_API_KEY` / `DHL_WEBHOOK_SECRET` (Aramex vars already present); doc note in
  `docs/deployment/couriers.md` that the supplier leg reuses the same gateway.
