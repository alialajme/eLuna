# Couriers — Operator Activation Guide

Courier integration is **author-complete but credential-gated**. With no keys set, every courier uses
`SimulatedCourier`, so the vendor enters the tracking number manually (7a behavior) — nothing changes.

## Model
The gateway is a **shared package** `packages/courier/` (`@e-luna/courier`), used by both the vendor
(customer-order shipments) and the supplier (material-order shipments):
- `gateway.ts` — the `CourierGateway` interface: `createShipment(params)` returns
  `created` (tracking + externalRef + labelUrl) / `manual` (the shipper types the tracking #) / `failed`;
  optional `parseWebhook(rawBody, headers)` returns a normalized `{ match, status } | { kind: "ignored" }`,
  where `status` is the neutral `CourierDeliveryStatus = "in_transit" | "delivered" | "exception"`.
- `factory.ts` — `getCourierGateway(courierId)` returns a real adapter when its config is present, else `SimulatedCourier`.
- `aramex.ts` / `dhl.ts` — config-gated real-adapter scaffolds (`TODO(operator)`).

Each **app keeps its own `apply-status`** (the DB write differs): `apps/vendor/app/lib/courier/apply-status.ts`
`applyShipmentStatus(shipmentId, status)` (customer-order `Shipment`; DELIVERED flips items + recomputes the
order) and `apps/supplier/app/lib/courier/apply-status.ts` `applyMaterialOrderDelivery(materialOrderId)`
(`MaterialOrder` SHIPPED→COMPLETED). Each app's webhook maps the neutral `CourierDeliveryStatus` to its own state.

## Adding a real courier (Aramex is the template — `packages/courier/src/aramex.ts`)
1. Implement `createShipment` against the courier's Shipping API; return `{ status: "created", trackingNumber, externalRef, labelUrl }`.
2. Implement `parseWebhook`: verify the courier's signature/secret, map its status codes → `CourierDeliveryStatus`, return `{ match: { externalRef | trackingNumber }, status }`.
3. Add a factory case: `case "<courierId>": return has<Courier>() ? new <Courier>Courier() : new SimulatedCourier();`.
4. Set the courier's env vars (see `.env.example`).
5. Register the webhook endpoint in the courier dashboard: `https://<host>/api/webhooks/courier/<courierId>`.

`createShipment` (vendor action) auto-uses the returned tracking + label when the gateway returns `created`;
the "Print label" link appears on the shipment once `labelUrl` is set. Live API creation, tracking, label,
and webhook status flow can only be verified with a real merchant account.

## Supplier → vendor material orders

The supplier's `MaterialOrder` shipping reuses the same `@e-luna/courier` gateway. `shipMaterialOrder`
calls `getCourierGateway(courier).createShipment(...)`; with no keys the Simulated gateway asks the supplier
to enter a tracking number (manual). The webhook `POST /api/webhooks/courier/[courier]` (supplier app) moves
the order `SHIPPED → COMPLETED` on a `delivered` event.

**Operator note:** the `Vendor` has no structured address model yet, so the real-courier destination is
best-effort (`storeName` only). Before enabling a real courier for the supplier leg, add a vendor
shipping-address source and populate `destination.addressLine1`/`city`/`emirate` in `shipMaterialOrder`.
