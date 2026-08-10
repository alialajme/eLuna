# Live Courier Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the machinery for real courier APIs — a `CourierGateway` abstraction in the vendor app (create shipment → tracking/label; webhook → auto status), with a `SimulatedCourier` fallback that preserves today's manual-tracking flow.

**Architecture:** Vendor-app `lib/courier/` (interface + env-aware factory + simulated fallback + one Aramex scaffold + shared `applyShipmentStatus`); `createShipment` calls the gateway; a webhook route maps courier events to `ShipmentStatus`. Real per-courier API + keys + webhook registration are operator steps.

**Tech Stack:** Next.js 15 (App Router, async route params), Prisma + PostgreSQL (`db push`, no migration files), TypeScript (`noUncheckedIndexedAccess` on), Clerk.

---

## Context for the implementer (read once)

- **No test suite.** "Tests" = `npx tsc --noEmit` + `npx next lint`. Repo uses **`prisma db push`**; after schema edits run `pnpm --filter @e-luna/db db:generate`. `db push` to a live DB is operator. `noUncheckedIndexedAccess` ON.
- **Verified state:**
  - `apps/vendor/app/actions/shipment.ts` — full current source (imports `prisma` `@e-luna/db`, `getCourier` `@e-luna/ui/couriers`, `safeCurrentUser` `../lib/auth`, `getVendorByUserId` `../lib/vendor`, `recomputeOrderStatus` `../lib/order-status`). `createShipment({orderId,courier,trackingNumber,estimatedDelivery?})` validates `trackingNumber` non-empty + `getCourier`, gathers PENDING/PROCESSING items, `$transaction` creates `Shipment` (`status:"IN_TRANSIT"`) + links items SHIPPED, `recomputeOrderStatus`, revalidates. `markShipmentDelivered(shipmentId)` — auth + ownership + already-delivered guards → `$transaction` DELIVERED + items DELIVERED → recompute → revalidate.
  - `@e-luna/db` re-exports `ShipmentStatus` type + `Prisma`. `ShipmentStatus = CREATED|PICKED_UP|IN_TRANSIT|OUT_FOR_DELIVERY|DELIVERED|FAILED|RETURNED`.
  - `Order.address` is a required relation (`{ fullName, addressLine1, city, emirate }`, emirate nullable).
  - `FulfillmentPanel.tsx` (client): `type Shipment = { id: string; courier: string; trackingNumber: string | null; status: string };` (line 10); `submitShipment` has a client guard `if (!tracking.trim()) { setError("Enter a tracking number"); return; }`; the shipment rows map `shipments` (line ~87) showing courier name + tracking + status + Mark Delivered; the tracking `<input>` has `placeholder="Tracking number"` (line ~137). It imports `createShipment`/`markShipmentDelivered` from `../../../actions/shipment` and `COURIERS` from `@e-luna/ui/couriers`.
  - `apps/vendor/app/(dashboard)/orders/[id]/page.tsx` — `const shipments = await prisma.shipment.findMany({ where:{ orderId:id, vendorId:vendor.id }, orderBy:{createdAt:"asc"}, select:{ id:true, courier:true, trackingNumber:true, status:true } })` (line ~43-47), passed to `<FulfillmentPanel shipments={shipments} ... />`.

---

## File Structure

```
packages/db/prisma/schema.prisma                                  — Shipment.externalRef?/labelUrl? + index
apps/vendor/app/lib/courier/gateway.ts                            — interface + types
apps/vendor/app/lib/courier/config.ts                             — presence helpers
apps/vendor/app/lib/courier/simulated.ts                          — SimulatedCourier
apps/vendor/app/lib/courier/aramex.ts                             — scaffold/template
apps/vendor/app/lib/courier/factory.ts                            — getCourierGateway
apps/vendor/app/lib/courier/apply-status.ts                       — applyShipmentStatus (shared)
apps/vendor/app/actions/shipment.ts                              — createShipment via gateway; markShipmentDelivered reuses applyShipmentStatus
apps/vendor/app/api/webhooks/courier/[courier]/route.ts          — webhook + status mapping
apps/vendor/app/(dashboard)/orders/components/FulfillmentPanel.tsx — optional tracking + label link
apps/vendor/app/(dashboard)/orders/[id]/page.tsx                  — select labelUrl
.env.example                                                      — courier env vars
docs/deployment/couriers.md                                       — operator guide
```

---

## Task 1: Schema — `Shipment.externalRef` + `labelUrl`

**Files:** Modify `packages/db/prisma/schema.prisma`.

- [ ] **Step 1: Add the two fields + index to `model Shipment`**

Add these fields (near the other scalar fields) and the index (near the existing `@@index` lines):
```prisma
  externalRef       String?
  labelUrl          String?
```
```prisma
  @@index([externalRef])
```

- [ ] **Step 2: Regenerate the Prisma client**

Run: `cd /Users/alialajme/Projects/Luna/e-luna && pnpm --filter @e-luna/db db:generate`
Expected: "Generated Prisma Client" success.

- [ ] **Step 3: Type-check the vendor app (nothing consumes the fields yet)**

Run: `cd /Users/alialajme/Projects/Luna/e-luna/apps/vendor && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts" | tail -5`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna
git add packages/db/prisma/schema.prisma
git commit -m "feat(db): Shipment.externalRef + labelUrl for courier-API shipments

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Courier gateway library

**Files:** Create `apps/vendor/app/lib/courier/{gateway,config,simulated,aramex,factory,apply-status}.ts`.

- [ ] **Step 1: `gateway.ts`**

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
  parseWebhook?(rawBody: string, headers: Headers): CourierStatusEvent;
}
```

- [ ] **Step 2: `config.ts`**

```ts
export const hasAramex = () => !!process.env.ARAMEX_API_KEY;
export const hasFetchr = () => !!process.env.FETCHR_API_KEY;
export const hasQuiqup = () => !!process.env.QUIQUP_API_KEY;
export const hasEmiratesPost = () => !!process.env.EMIRATES_POST_API_KEY;
export const hasDhl = () => !!process.env.DHL_API_KEY;
```

- [ ] **Step 3: `simulated.ts`**

```ts
import type { CourierGateway, CreateShipmentResult } from "./gateway";

/** Fallback for any courier without a configured real adapter: the vendor enters the tracking number (7a behavior). */
export class SimulatedCourier implements CourierGateway {
  async createShipment(): Promise<CreateShipmentResult> {
    return { status: "manual" };
  }
}
```

- [ ] **Step 4: `aramex.ts` (representative scaffold/template)**

```ts
import type { CourierGateway, CreateShipmentParams, CreateShipmentResult, CourierStatusEvent } from "./gateway";

// Integration point: Aramex Shipping API — https://www.aramex.com (Developers Solutions Center).
// Required env: ARAMEX_API_KEY, ARAMEX_ACCOUNT_NUMBER, ARAMEX_ACCOUNT_PIN, ARAMEX_WEBHOOK_SECRET.
// Only instantiated by the factory when hasAramex() is true. This is the TEMPLATE other couriers copy.
export class AramexCourier implements CourierGateway {
  async createShipment(_params: CreateShipmentParams): Promise<CreateShipmentResult> {
    // TODO(operator): POST a shipment to Aramex; on success return
    //   { status: "created", trackingNumber, externalRef, labelUrl }.
    return { status: "failed", error: "Aramex API not configured" };
  }

  parseWebhook(_rawBody: string, _headers: Headers): CourierStatusEvent {
    // TODO(operator): verify ARAMEX_WEBHOOK_SECRET, parse the event, map the Aramex status to a
    //   ShipmentStatus, and return { match: { externalRef | trackingNumber }, status }.
    return { kind: "ignored" };
  }
}
```

- [ ] **Step 5: `factory.ts`**

```ts
import type { CourierGateway } from "./gateway";
import { SimulatedCourier } from "./simulated";
import { AramexCourier } from "./aramex";
import { hasAramex } from "./config";

/** Never throws. Unconfigured couriers → SimulatedCourier (manual tracking, 7a behavior). */
export function getCourierGateway(courierId: string): CourierGateway {
  switch (courierId) {
    case "aramex":
      return hasAramex() ? new AramexCourier() : new SimulatedCourier();
    default:
      return new SimulatedCourier();
  }
}
```

- [ ] **Step 6: `apply-status.ts`**

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

- [ ] **Step 7: Type-check the vendor app**

Run: `cd /Users/alialajme/Projects/Luna/e-luna/apps/vendor && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts" | tail -6`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna
git add apps/vendor/app/lib/courier
git commit -m "feat(vendor): CourierGateway abstraction + simulated fallback + Aramex scaffold

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `createShipment` via gateway + `markShipmentDelivered` reuse

**Files:** Modify `apps/vendor/app/actions/shipment.ts`.

- [ ] **Step 1: Add imports (after the existing imports)**

```ts
import { getCourierGateway } from "../lib/courier/factory";
import { applyShipmentStatus } from "../lib/courier/apply-status";
```

- [ ] **Step 2: Replace `createShipment` entirely**

```ts
export async function createShipment(input: {
  orderId: string;
  courier: string;
  trackingNumber?: string;
  estimatedDelivery?: string;
}): Promise<{ success: boolean; error?: string; shipmentId?: string }> {
  const user = await safeCurrentUser();
  if (!user) return { success: false, error: "Not signed in" };
  const vendor = await getVendorByUserId(user.id);
  if (!vendor) return { success: false, error: "Vendor not found" };

  if (!getCourier(input.courier)) return { success: false, error: "Unknown courier" };

  const items = await prisma.orderItem
    .findMany({
      where: { orderId: input.orderId, vendorId: vendor.id, fulfillmentStatus: { in: ["PENDING", "PROCESSING"] } },
      select: { id: true },
    })
    .catch(() => []);
  if (items.length === 0) return { success: false, error: "No items available to ship for this order" };

  const order = await prisma.order
    .findUnique({
      where: { id: input.orderId },
      select: { address: { select: { fullName: true, addressLine1: true, city: true, emirate: true } } },
    })
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

  try {
    const shipment = await prisma.$transaction(async (tx) => {
      const created = await tx.shipment.create({
        data: {
          orderId: input.orderId,
          vendorId: vendor.id,
          courier: input.courier,
          trackingNumber,
          externalRef,
          labelUrl,
          status: "IN_TRANSIT",
          estimatedDelivery: input.estimatedDelivery ? new Date(input.estimatedDelivery) : null,
        },
      });
      await tx.orderItem.updateMany({
        where: { id: { in: items.map((i) => i.id) } },
        data: { shipmentId: created.id, fulfillmentStatus: "SHIPPED" },
      });
      return created;
    });
    await recomputeOrderStatus(input.orderId);
    revalidatePath("/orders");
    revalidatePath(`/orders/${input.orderId}`);
    return { success: true, shipmentId: shipment.id };
  } catch {
    return { success: false, error: "Failed to create shipment" };
  }
}
```

- [ ] **Step 3: Replace `markShipmentDelivered`'s `try` block to reuse the helper**

Replace the body of `markShipmentDelivered` (keeping the auth/ownership/already-delivered guards above it) — the `try { ... } catch { ... }` becomes:
```ts
  try {
    await applyShipmentStatus(shipmentId, "DELIVERED");
    revalidatePath("/orders");
    revalidatePath(`/orders/${shipment.orderId}`);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to mark delivered" };
  }
```

- [ ] **Step 4: Type-check the vendor app**

Run: `cd /Users/alialajme/Projects/Luna/e-luna/apps/vendor && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts" | tail -6`
Expected: clean. (`recomputeOrderStatus` is still imported and used by `createShipment`; `applyShipmentStatus` now handles the delivered path.)

- [ ] **Step 5: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna
git add apps/vendor/app/actions/shipment.ts
git commit -m "feat(vendor): createShipment goes through the courier gateway; delivered path shares applyShipmentStatus

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Courier webhook route

**Files:** Create `apps/vendor/app/api/webhooks/courier/[courier]/route.ts`.

- [ ] **Step 1: Create the route**

```ts
import { prisma } from "@e-luna/db";
import { getCourierGateway } from "../../../../lib/courier/factory";
import { applyShipmentStatus } from "../../../../lib/courier/apply-status";

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

  const or = [
    ...(event.match.externalRef ? [{ externalRef: event.match.externalRef }] : []),
    ...(event.match.trackingNumber ? [{ trackingNumber: event.match.trackingNumber }] : []),
  ];
  if (or.length === 0) return new Response(null, { status: 200 });

  const shipment = await prisma.shipment
    .findFirst({ where: { courier, OR: or }, select: { id: true } })
    .catch(() => null);
  if (shipment) {
    await applyShipmentStatus(shipment.id, event.status).catch((e) => console.error("[courier webhook] apply failed", e));
  }
  return new Response(null, { status: 200 });
}
```

- [ ] **Step 2: Type-check the vendor app**

Run: `cd /Users/alialajme/Projects/Luna/e-luna/apps/vendor && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts" | tail -6`
Expected: clean. (`event` narrows: after the `kind === "ignored"` early-return, `event.match`/`event.status` are available.)

- [ ] **Step 3: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna
git add "apps/vendor/app/api/webhooks/courier/[courier]/route.ts"
git commit -m "feat(vendor): courier webhook route (signature-verified, idempotent status apply)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: FulfillmentPanel — optional tracking + label link

**Files:** Modify `apps/vendor/app/(dashboard)/orders/components/FulfillmentPanel.tsx`, `apps/vendor/app/(dashboard)/orders/[id]/page.tsx`.

- [ ] **Step 1: `[id]/page.tsx` — select `labelUrl`**

In the shipments query `select`, add `labelUrl`:
```ts
      select: { id: true, courier: true, trackingNumber: true, status: true, labelUrl: true },
```

- [ ] **Step 2: `FulfillmentPanel.tsx` — add `labelUrl` to the `Shipment` type**

Change:
```tsx
type Shipment = { id: string; courier: string; trackingNumber: string | null; status: string };
```
to:
```tsx
type Shipment = { id: string; courier: string; trackingNumber: string | null; status: string; labelUrl: string | null };
```

- [ ] **Step 3: `FulfillmentPanel.tsx` — drop the client "required tracking" guard**

In `submitShipment`, DELETE this block (the action now enforces "required" only on the manual path):
```tsx
    if (!tracking.trim()) {
      setError("Enter a tracking number");
      return;
    }
```

- [ ] **Step 4: `FulfillmentPanel.tsx` — soften the tracking input placeholder**

Change `placeholder="Tracking number"` to:
```tsx
            placeholder="Tracking number (blank if the courier auto-generates)"
```

- [ ] **Step 5: `FulfillmentPanel.tsx` — show a "Print label" link per shipment**

In the shipment row map (the `shipments.map((s) => { ... })` block), inside the shipment's rendered `<div>`, after the status line (`<p ...>{s.status.replace(...)}</p>`), add:
```tsx
            {s.labelUrl && (
              <a
                href={s.labelUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-body-xs text-gold hover:underline"
              >
                Print label
              </a>
            )}
```

- [ ] **Step 6: Type-check + lint the vendor app**

Run:
```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/vendor
npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts" | tail -6
npx next lint 2>&1 | tail -5
```
Expected: tsc clean; no new lint errors.

- [ ] **Step 7: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna
git add "apps/vendor/app/(dashboard)/orders/components/FulfillmentPanel.tsx" "apps/vendor/app/(dashboard)/orders/[id]/page.tsx"
git commit -m "feat(vendor): optional tracking input + Print-label link in FulfillmentPanel

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Env example + operator guide

**Files:** Modify `.env.example`; Create `docs/deployment/couriers.md`.

- [ ] **Step 1: Append courier env vars to `.env.example`**

```bash
# --- Couriers (per-courier API; unconfigured couriers use manual tracking) ---
ARAMEX_API_KEY=
ARAMEX_ACCOUNT_NUMBER=
ARAMEX_ACCOUNT_PIN=
ARAMEX_WEBHOOK_SECRET=
FETCHR_API_KEY=
QUIQUP_API_KEY=
EMIRATES_POST_API_KEY=
DHL_API_KEY=
```

- [ ] **Step 2: Create `docs/deployment/couriers.md`**

```markdown
# Couriers — Operator Activation Guide

Courier integration is **author-complete but credential-gated**. With no keys set, every courier uses
`SimulatedCourier`, so the vendor enters the tracking number manually (7a behavior) — nothing changes.

## Model
`apps/vendor/app/lib/courier/`:
- `gateway.ts` — the `CourierGateway` interface: `createShipment(params)` returns
  `created` (tracking + externalRef + labelUrl) / `manual` (vendor types the tracking #) / `failed`;
  optional `parseWebhook(rawBody, headers)` returns a normalized `{ match, status }`.
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
```

- [ ] **Step 3: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna
git add .env.example docs/deployment/couriers.md
git commit -m "docs(couriers): env example + operator activation guide

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Repo-wide green check

**Files:** none (verification only).

- [ ] **Step 1: Frozen install + regen**

Run:
```bash
cd /Users/alialajme/Projects/Luna/e-luna
pnpm install --frozen-lockfile 2>&1 | tail -3
pnpm --filter @e-luna/db db:generate 2>&1 | tail -2
```
Expected: no lockfile change; regen succeeds.

- [ ] **Step 2: Repo-wide lint**

Run: `cd /Users/alialajme/Projects/Luna/e-luna && pnpm lint 2>&1 | tail -12`
Expected: all apps pass (pre-existing `<img>` warnings acceptable).

- [ ] **Step 3: Repo-wide type check**

Run: `cd /Users/alialajme/Projects/Luna/e-luna && pnpm --filter "@e-luna/*" exec tsc --noEmit 2>&1 | tail -12`
Expected: clean.

- [ ] **Step 4: Simulated-fallback proof (inspection)**

Run:
```bash
cd /Users/alialajme/Projects/Luna/e-luna
grep -n 'return new SimulatedCourier()' apps/vendor/app/lib/courier/factory.ts   # default + unconfigured aramex
grep -n 'status: "manual"' apps/vendor/app/lib/courier/simulated.ts
grep -n 'applyShipmentStatus' apps/vendor/app/actions/shipment.ts "apps/vendor/app/api/webhooks/courier/[courier]/route.ts"
```
Expected: factory falls back to `SimulatedCourier`; Simulated returns `manual`; `applyShipmentStatus` used by both the action (delivered) and the webhook.

- [ ] **Step 5: Final commit (only if Steps 2-3 required fixes; otherwise skip)**

```bash
cd /Users/alialajme/Projects/Luna/e-luna
git add -A
git commit -m "chore(couriers): lint/type fixes

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 6: Manual/operator smoke note (not automated)**

`db push` applies `Shipment.externalRef/labelUrl`. **Simulated-fallback proof (must hold):** with no courier keys, creating a shipment still requires the vendor's tracking number and works exactly as 7a. Live courier creation/tracking/label + webhook status flow require a real adapter impl + credentials + webhook registration per `docs/deployment/couriers.md` — not runnable here.

---

## Self-Review (completed)

**Spec coverage:**
- `Shipment.externalRef`/`labelUrl` + index → Task 1 ✓
- `CourierGateway` interface + `config` + `SimulatedCourier` + `AramexCourier` scaffold + env-aware `factory` → Task 2 ✓
- `applyShipmentStatus` shared helper → Task 2 ✓
- `createShipment` via gateway (created/manual/failed) + `markShipmentDelivered` reuse → Task 3 ✓
- Webhook route + status mapping (400/200, idempotent, courier-scoped match) → Task 4 ✓
- FulfillmentPanel optional tracking + label link + order-page `labelUrl` select → Task 5 ✓
- `.env.example` + `docs/deployment/couriers.md` → Task 6 ✓
- Repo-wide green + simulated-fallback proof → Task 7 ✓

**Placeholder scan:** none — the `TODO(operator)` markers in `aramex.ts` are intentional integration points, not plan gaps; every code step is complete.

**Type consistency:** `getCourierGateway(courierId): CourierGateway`, `createShipment(params): Promise<CreateShipmentResult>` (union `created|manual|failed`), `parseWebhook(...): CourierStatusEvent` (union `{match,status}|{kind:"ignored"}`), and `applyShipmentStatus(shipmentId, status: ShipmentStatus)` are defined in Task 2 and consumed consistently in Tasks 3-4. The `FulfillmentPanel` `Shipment` type gains `labelUrl: string | null` (Task 5) matching the order-page `select` (Task 5). `CreateShipmentResult.status` values (`created`/`manual`/`failed`) match the action's branch handling (Task 3).
```
