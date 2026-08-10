# Live Courier Integration — Design Spec

## Goal

Make the shipment flow ready for real courier APIs: a `CourierGateway` abstraction in the vendor app that (when a courier is configured) creates a shipment via the courier's API — returning a tracking number + waybill label — and receives webhook status events that auto-advance the shipment. A `SimulatedCourier` fallback preserves today's manual-tracking behavior (7a) when no courier is configured. Real per-courier API implementations + credentials + webhook registration are operator activation steps (this dev environment has none) — mirroring the payments-gateway phase.

---

## Scope

**In scope:**
- `Shipment.externalRef?` + `labelUrl?` (schema add).
- `apps/vendor/app/lib/courier/`: `CourierGateway` interface + types, env-presence `config`, `SimulatedCourier`, one representative `AramexCourier` scaffold/template, env-aware `factory`, and a shared `applyShipmentStatus` helper.
- `createShipment` calls the gateway (created → auto tracking/label; manual → vendor enters tracking).
- Webhook route `api/webhooks/courier/[courier]` + status mapping (idempotent).
- `FulfillmentPanel`: tracking optional + "Print label" link.
- `.env.example` + `docs/deployment/couriers.md`.

**Out of scope (operator / future):** real per-courier API client code + credentials + webhook registration; rate shopping / multi-rate quotes; return-label generation; pickup scheduling; a shared package (only the vendor app needs this).

---

## Architecture

### Current state (verified)
- Courier registry `@e-luna/ui/couriers` (id/name/`trackingUrl` deep-link; 5 UAE couriers).
- `apps/vendor/app/actions/shipment.ts` — `createShipment({ orderId, courier, trackingNumber, estimatedDelivery? })`: validates `trackingNumber` non-empty + `getCourier(courier)`, gathers the vendor's `PENDING`/`PROCESSING` items (error if none), in a `$transaction` creates `Shipment` (`status:"IN_TRANSIT"`) + links items `SHIPPED`, `recomputeOrderStatus`. `markShipmentDelivered(shipmentId)`: auth + ownership + already-delivered guards → `$transaction` shipment `DELIVERED`+`deliveredAt`, items `DELIVERED`, `recomputeOrderStatus`. Both revalidate `/orders` + `/orders/[id]`.
- `recomputeOrderStatus` in `apps/vendor/app/lib/order-status.ts`. `Shipment { courier String, trackingNumber String?, status ShipmentStatus, estimatedDelivery?, deliveredAt?, cost }`; `ShipmentStatus = CREATED|PICKED_UP|IN_TRANSIT|OUT_FOR_DELIVERY|DELIVERED|FAILED|RETURNED`. `@e-luna/db` re-exports `ShipmentStatus` type.
- Only the vendor app creates shipments; the customer tracking page reads `Shipment` status (no API call).

### Schema (additive, `db push`)
```prisma
model Shipment {
  // ...existing...
  externalRef String?
  labelUrl    String?
  @@index([externalRef])
}
```

### `CourierGateway` — `lib/courier/gateway.ts`
```ts
import type { ShipmentStatus } from "@e-luna/db";

export type CreateShipmentParams = {
  orderId: string;
  courier: string;
  destination: { name: string; addressLine1: string; city: string; emirate: string | null };
  weightKg?: number;
};

export type CreateShipmentResult =
  | { status: "created"; trackingNumber: string; externalRef: string; labelUrl?: string }
  | { status: "manual" }
  | { status: "failed"; error: string };

export type CourierStatusEvent =
  | { match: { trackingNumber?: string; externalRef?: string }; status: ShipmentStatus }
  | { kind: "ignored" };

export interface CourierGateway {
  createShipment(params: CreateShipmentParams): Promise<CreateShipmentResult>;
  parseWebhook?(rawBody: string, headers: Headers): CourierStatusEvent; // only real adapters implement
}
```

### `config.ts`
```ts
export const hasAramex = () => !!process.env.ARAMEX_API_KEY;
export const hasFetchr = () => !!process.env.FETCHR_API_KEY;
export const hasQuiqup = () => !!process.env.QUIQUP_API_KEY;
export const hasEmiratesPost = () => !!process.env.EMIRATES_POST_API_KEY;
export const hasDhl = () => !!process.env.DHL_API_KEY;
```

### `SimulatedCourier` — `simulated.ts`
```ts
export class SimulatedCourier implements CourierGateway {
  async createShipment(): Promise<CreateShipmentResult> {
    return { status: "manual" }; // vendor enters the tracking number — 7a behavior preserved
  }
}
```

### `AramexCourier` — `aramex.ts` (representative scaffold/template)
```ts
// Integration point: Aramex Shipping API — https://www.aramex.com/us/en/solutions-services/developers-solutions-center
// Required env: ARAMEX_API_KEY, ARAMEX_ACCOUNT_NUMBER, ARAMEX_ACCOUNT_PIN, ARAMEX_WEBHOOK_SECRET.
// Only instantiated by the factory when hasAramex() is true.
export class AramexCourier implements CourierGateway {
  async createShipment(_p: CreateShipmentParams): Promise<CreateShipmentResult> {
    // TODO(operator): POST a shipment to Aramex; return { status:"created", trackingNumber, externalRef, labelUrl }.
    return { status: "failed", error: "Aramex API not configured" };
  }
  parseWebhook(_rawBody: string, _headers: Headers): CourierStatusEvent {
    // TODO(operator): verify ARAMEX_WEBHOOK_SECRET, parse the event, map Aramex status → ShipmentStatus,
    //   return { match: { externalRef | trackingNumber }, status }.
    return { kind: "ignored" };
  }
}
```
This one file documents exactly how a real adapter plugs in; the other couriers reuse `SimulatedCourier` until an operator adds their adapter + a factory case (per `docs/deployment/couriers.md`).

### `factory.ts`
```ts
export function getCourierGateway(courierId: string): CourierGateway {
  switch (courierId) {
    case "aramex":
      return hasAramex() ? new AramexCourier() : new SimulatedCourier();
    default:
      return new SimulatedCourier();
  }
}
```
Never throws. With no keys, **every courier → `SimulatedCourier` → manual → the shipment flow is exactly 7a**.

### Files
```
packages/db/prisma/schema.prisma                                  — Shipment.externalRef?/labelUrl? + index
apps/vendor/app/lib/courier/gateway.ts                            — interface + types
apps/vendor/app/lib/courier/config.ts                             — presence helpers
apps/vendor/app/lib/courier/simulated.ts                          — SimulatedCourier
apps/vendor/app/lib/courier/aramex.ts                             — scaffold/template
apps/vendor/app/lib/courier/factory.ts                            — getCourierGateway
apps/vendor/app/lib/courier/apply-status.ts                       — applyShipmentStatus (shared)
apps/vendor/app/actions/shipment.ts                              — createShipment via gateway; markShipmentDelivered reuses applyShipmentStatus
apps/vendor/app/(dashboard)/orders/components/FulfillmentPanel.tsx — optional tracking + label link
apps/vendor/app/(dashboard)/orders/[id]/page.tsx                  — select labelUrl for the panel
apps/vendor/app/api/webhooks/courier/[courier]/route.ts          — webhook + status mapping
.env.example                                                      — courier env vars
docs/deployment/couriers.md                                       — operator guide
```

---

## Shared status helper — `lib/courier/apply-status.ts`

```ts
import { prisma, type ShipmentStatus } from "@e-luna/db";
import { recomputeOrderStatus } from "../order-status";

/** Idempotently apply a shipment status; DELIVERED also flips items + timestamps and recomputes the order. */
export async function applyShipmentStatus(shipmentId: string, status: ShipmentStatus): Promise<void> {
  const shipment = await prisma.shipment
    .findUnique({ where: { id: shipmentId }, select: { orderId: true, status: true } })
    .catch(() => null);
  if (!shipment || shipment.status === status) return;

  if (status === "DELIVERED") {
    await prisma
      .$transaction(async (tx) => {
        await tx.shipment.update({ where: { id: shipmentId }, data: { status: "DELIVERED", deliveredAt: new Date() } });
        await tx.orderItem.updateMany({ where: { shipmentId }, data: { fulfillmentStatus: "DELIVERED" } });
      })
      .catch(() => null);
  } else {
    await prisma.shipment.update({ where: { id: shipmentId }, data: { status } }).catch(() => null);
  }
  await recomputeOrderStatus(shipment.orderId);
}
```
`markShipmentDelivered` keeps its auth + ownership + already-delivered guards, then calls `applyShipmentStatus(shipmentId, "DELIVERED")` (DRY; identical effect).

---

## `createShipment` change

Signature → `{ orderId, courier, trackingNumber?, estimatedDelivery? }`. After the auth + `getCourier` + un-shipped-items checks, load the order's address and call the gateway:
```ts
  const order = await prisma.order
    .findUnique({ where: { id: input.orderId }, select: { address: { select: { fullName: true, addressLine1: true, city: true, emirate: true } } } })
    .catch(() => null);

  const result = await getCourierGateway(input.courier).createShipment({
    orderId: input.orderId,
    courier: input.courier,
    destination: {
      name: order?.address.fullName ?? "",
      addressLine1: order?.address.addressLine1 ?? "",
      city: order?.address.city ?? "",
      emirate: order?.address.emirate ?? null,
    },
  });

  let trackingNumber: string;
  let externalRef: string | null = null;
  let labelUrl: string | null = null;
  if (result.status === "failed") return { success: false, error: result.error };
  if (result.status === "created") {
    trackingNumber = result.trackingNumber;
    externalRef = result.externalRef;
    labelUrl = result.labelUrl ?? null;
  } else {
    if (!input.trackingNumber?.trim()) return { success: false, error: "Tracking number is required" };
    trackingNumber = input.trackingNumber.trim();
  }
```
The `$transaction` then creates the `Shipment` with `trackingNumber`, `externalRef`, `labelUrl` (+ existing fields); item-linking + `recomputeOrderStatus` + revalidation unchanged.

---

## Webhook — `api/webhooks/courier/[courier]/route.ts`

```ts
export async function POST(req: Request, { params }: { params: Promise<{ courier: string }> }) {
  const { courier } = await params;
  const gw = getCourierGateway(courier);
  if (!gw.parseWebhook) return new Response(null, { status: 200 }); // Simulated / unconfigured

  const rawBody = await req.text();
  let event;
  try {
    event = gw.parseWebhook(rawBody, req.headers);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }
  if (event.kind === "ignored") return new Response(null, { status: 200 });

  const shipment = await prisma.shipment
    .findFirst({
      where: {
        courier,
        OR: [
          ...(event.match.externalRef ? [{ externalRef: event.match.externalRef }] : []),
          ...(event.match.trackingNumber ? [{ trackingNumber: event.match.trackingNumber }] : []),
        ],
      },
      select: { id: true },
    })
    .catch(() => null);
  if (shipment) await applyShipmentStatus(shipment.id, event.status).catch((e) => console.error("[courier webhook]", e));

  return new Response(null, { status: 200 });
}
```
`400` only on a bad signature; everything else `200` (idempotent apply) so couriers don't storm-retry. The match is scoped to the `courier` path param so a spoofed body can't touch another courier's shipment.

---

## UI (`FulfillmentPanel`)

The tracking-number `<input>` becomes optional (placeholder "Tracking number (blank if the courier auto-generates)"); the action enforces "required" only on the `manual` path. Each shipment row shows a **"Print label"** link when `shipment.labelUrl` is set. The vendor order page's shipment query selects `labelUrl` (and the panel's `Shipment` type adds `labelUrl: string | null`).

---

## Error Handling

- `getCourierGateway` never throws (→ `SimulatedCourier`).
- `createShipment`: gateway `failed` → error (no shipment); `manual` + empty tracking → "Tracking number is required"; ownership/state guards unchanged.
- Webhook: bad signature → `400`; unknown courier / no `parseWebhook` / `ignored` / no matching shipment → `200`; `applyShipmentStatus` is `.catch`-guarded and idempotent (no double-apply on re-delivery).
- All new Prisma reads `.catch()`-guarded.

---

## Testing

No suite (repo-consistent). Per task: `pnpm --filter @e-luna/db db:generate` → `tsc --noEmit` (packages/db, vendor) → `next lint`. Final repo-wide `pnpm lint` + typecheck.

**Simulated-fallback proof (must hold):** with no courier keys, `getCourierGateway("aramex")` → `SimulatedCourier`; `createShipment` receives `{ status:"manual" }` → requires the vendor's tracking number → the shipment is created exactly as in 7a. Nothing changes on deploy.

**Operator activation** (`docs/deployment/couriers.md`): `db push` for the new fields; implement a real adapter (from the Aramex template), set its env vars, add its factory case, and register the webhook endpoint `https://<host>/api/webhooks/courier/<courier>` with the courier. Live API creation/tracking/label + webhook status flow can only be verified with a real merchant account.

---

## Boundary

This wires the *machinery* for live couriers; the per-courier API clients are operator work (like the Tap/Noqodi/NeoPay payment scaffolds). The customer tracking UI (7a) and the returns flow (7b) are unchanged — a webhook `DELIVERED` now advances the same order state a manual "Mark Delivered" does, so the downstream (8b refund eligibility, 8c delivery agent) stays truthful.
