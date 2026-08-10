# Couriers — Operator Activation Guide

Courier integration is **author-complete but credential-gated**. With no keys set, every courier uses
`SimulatedCourier`, so the vendor enters the tracking number manually (7a behavior) — nothing changes.

## Model
`apps/vendor/app/lib/courier/`:
- `gateway.ts` — the `CourierGateway` interface: `createShipment(params)` returns
  `created` (tracking + externalRef + labelUrl) / `manual` (vendor types the tracking #) / `failed`;
  optional `parseWebhook(rawBody, headers)` returns a normalized `{ match, status } | { kind: "ignored" }`.
- `factory.ts` — `getCourierGateway(courierId)` returns a real adapter when its config is present, else `SimulatedCourier`.
- `apply-status.ts` — `applyShipmentStatus(shipmentId, status)` (idempotent; DELIVERED also flips items + recomputes the order). Used by both the webhook and `markShipmentDelivered`.

## Adding a real courier (Aramex is the template — `aramex.ts`)
1. Implement `createShipment` against the courier's Shipping API; return `{ status: "created", trackingNumber, externalRef, labelUrl }`.
2. Implement `parseWebhook`: verify the courier's signature/secret, map its status codes → `ShipmentStatus`, return `{ match: { externalRef | trackingNumber }, status }`.
3. Add a factory case: `case "<courierId>": return has<Courier>() ? new <Courier>Courier() : new SimulatedCourier();`.
4. Set the courier's env vars (see `.env.example`).
5. Register the webhook endpoint in the courier dashboard: `https://<host>/api/webhooks/courier/<courierId>`.

`createShipment` (vendor action) auto-uses the returned tracking + label when the gateway returns `created`;
the "Print label" link appears on the shipment once `labelUrl` is set. Live API creation, tracking, label,
and webhook status flow can only be verified with a real merchant account.
