# Supplier Courier Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a supplier ship a fulfilled `MaterialOrder` to the buying vendor through a real courier (Aramex/DHL) with structured tracking, reusing the vendor's courier gateway extracted to a shared package; the vendor sees live tracking and a delivery webhook auto-completes the order.

**Architecture:** Extract the pure courier gateway (`apps/vendor/app/lib/courier/{gateway,config,simulated,aramex,factory}.ts`) into a new `@e-luna/courier` package with a **neutral** delivery-status type; repoint the vendor (which keeps its own `apply-status`). Add courier fields to `MaterialOrder`; the supplier's `shipMaterialOrder` drives the gateway; a supplier-local `apply-status` + webhook moves `SHIPPED → COMPLETED` on delivery. Credential-gated: no keys → Simulated (manual tracking), exactly today's behavior.

**Tech Stack:** Turborepo + pnpm, Next.js 15 App Router, Prisma + PostgreSQL (`db push`, no migration files), TypeScript. No test suite — verification is `db:generate` + `tsc --noEmit` + `pnpm lint` + gitleaks.

**Conventions:** workspace packages export raw TS (`@e-luna/db` pattern); apps list them in `dependencies` + `next.config.ts` `transpilePackages`. Commits use trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Server actions resolve the scope id (supplierId/vendorId) from the Clerk session, never a client param.

---

### Task 1: Extract `@e-luna/courier` + repoint vendor

**Files:**
- Create: `packages/courier/package.json`, `packages/courier/tsconfig.json`, `packages/courier/src/{gateway,config,simulated,aramex,dhl,factory,index}.ts`
- Delete: `apps/vendor/app/lib/courier/{gateway,config,simulated,aramex,factory}.ts` (keep `apply-status.ts`)
- Modify: `apps/vendor/app/actions/shipment.ts`, `apps/vendor/app/api/webhooks/courier/[courier]/route.ts`, `apps/vendor/package.json`, `apps/vendor/next.config.ts`

- [ ] **Step 1: `packages/courier/package.json`**
```json
{
  "name": "@e-luna/courier",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "devDependencies": {
    "@e-luna/config": "workspace:*",
    "@types/node": "^20",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: `packages/courier/tsconfig.json`**
```json
{
  "extends": "@e-luna/config/tsconfig/base.json",
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: `packages/courier/src/gateway.ts`** (neutral status; `reference` replaces `orderId`)
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

- [ ] **Step 4: `packages/courier/src/config.ts`** (carry all existing flags)
```ts
export const hasAramex = () => !!process.env.ARAMEX_API_KEY;
export const hasFetchr = () => !!process.env.FETCHR_API_KEY;
export const hasQuiqup = () => !!process.env.QUIQUP_API_KEY;
export const hasEmiratesPost = () => !!process.env.EMIRATES_POST_API_KEY;
export const hasDhl = () => !!process.env.DHL_API_KEY;
```

- [ ] **Step 5: `packages/courier/src/simulated.ts`**
```ts
import type { CourierGateway, CreateShipmentResult } from "./gateway";

/** Fallback for any courier without a configured real adapter: the shipper enters the tracking number. */
export class SimulatedCourier implements CourierGateway {
  async createShipment(): Promise<CreateShipmentResult> {
    return { status: "manual" };
  }
}
```

- [ ] **Step 6: `packages/courier/src/aramex.ts`** (scaffold; `reference` + neutral status)
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
    //   CourierDeliveryStatus, and return { match: { externalRef | trackingNumber }, status }.
    return { kind: "ignored" };
  }
}
```

- [ ] **Step 7: `packages/courier/src/dhl.ts`** (new scaffold, copy of the Aramex template)
```ts
import type { CourierGateway, CreateShipmentParams, CreateShipmentResult, CourierStatusEvent } from "./gateway";

// Integration point: DHL Express MyDHL API — https://developer.dhl.com.
// Required env: DHL_API_KEY, DHL_ACCOUNT_NUMBER, DHL_WEBHOOK_SECRET.
// Only instantiated by the factory when hasDhl() is true.
export class DhlCourier implements CourierGateway {
  async createShipment(_params: CreateShipmentParams): Promise<CreateShipmentResult> {
    // TODO(operator): POST a shipment to DHL; on success return
    //   { status: "created", trackingNumber, externalRef, labelUrl }.
    return { status: "failed", error: "DHL API not configured" };
  }

  parseWebhook(_rawBody: string, _headers: Headers): CourierStatusEvent {
    // TODO(operator): verify DHL_WEBHOOK_SECRET, parse the event, map the DHL status to a
    //   CourierDeliveryStatus, and return { match: { externalRef | trackingNumber }, status }.
    return { kind: "ignored" };
  }
}
```

- [ ] **Step 8: `packages/courier/src/factory.ts`** (aramex + dhl; never throws)
```ts
import type { CourierGateway } from "./gateway";
import { SimulatedCourier } from "./simulated";
import { AramexCourier } from "./aramex";
import { DhlCourier } from "./dhl";
import { hasAramex, hasDhl } from "./config";

/** Never throws. Unconfigured couriers → SimulatedCourier (manual tracking). */
export function getCourierGateway(courierId: string): CourierGateway {
  switch (courierId) {
    case "aramex":
      return hasAramex() ? new AramexCourier() : new SimulatedCourier();
    case "dhl":
      return hasDhl() ? new DhlCourier() : new SimulatedCourier();
    default:
      return new SimulatedCourier();
  }
}
```

- [ ] **Step 9: `packages/courier/src/index.ts`** (barrel)
```ts
export type {
  CourierDeliveryStatus,
  CreateShipmentParams,
  CreateShipmentResult,
  CourierStatusEvent,
  CourierGateway,
} from "./gateway";
export { getCourierGateway } from "./factory";
export { SimulatedCourier } from "./simulated";
export { AramexCourier } from "./aramex";
export { DhlCourier } from "./dhl";
export { hasAramex, hasFetchr, hasQuiqup, hasEmiratesPost, hasDhl } from "./config";
```

- [ ] **Step 10: Delete the moved vendor files** (keep `apply-status.ts`)
```bash
git rm apps/vendor/app/lib/courier/gateway.ts apps/vendor/app/lib/courier/config.ts \
  apps/vendor/app/lib/courier/simulated.ts apps/vendor/app/lib/courier/aramex.ts \
  apps/vendor/app/lib/courier/factory.ts
```

- [ ] **Step 11: Repoint `apps/vendor/app/actions/shipment.ts`** — change the two courier imports and the `createShipment` call arg. Replace:
```ts
import { getCourierGateway } from "../lib/courier/factory";
import { applyShipmentStatus } from "../lib/courier/apply-status";
```
with:
```ts
import { getCourierGateway } from "@e-luna/courier";
import { applyShipmentStatus } from "../lib/courier/apply-status";
```
And in the `getCourierGateway(input.courier).createShipment({...})` call, rename the first field `orderId: input.orderId,` → `reference: input.orderId,`.

- [ ] **Step 12: Repoint `apps/vendor/app/api/webhooks/courier/[courier]/route.ts`** — import from the package and map the neutral status to `ShipmentStatus` before applying. Replace the whole file with:
```ts
import { prisma, type ShipmentStatus } from "@e-luna/db";
import type { CourierStatusEvent } from "@e-luna/courier";
import { getCourierGateway } from "@e-luna/courier";
import { applyShipmentStatus } from "../../../../lib/courier/apply-status";

export async function POST(req: Request, { params }: { params: Promise<{ courier: string }> }) {
  const { courier } = await params;
  const gw = getCourierGateway(courier);
  if (!gw.parseWebhook) return new Response(null, { status: 200 }); // Simulated / unconfigured

  const rawBody = await req.text();
  let event: CourierStatusEvent;
  try {
    event = gw.parseWebhook(rawBody, req.headers);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }
  if (!("match" in event)) return new Response(null, { status: 200 });

  const or = [
    ...(event.match.externalRef ? [{ externalRef: event.match.externalRef }] : []),
    ...(event.match.trackingNumber ? [{ trackingNumber: event.match.trackingNumber }] : []),
  ];
  if (or.length === 0) return new Response(null, { status: 200 });

  const shipment = await prisma.shipment
    .findFirst({ where: { courier, OR: or }, select: { id: true } })
    .catch(() => null);
  if (shipment) {
    const status: ShipmentStatus = event.status === "delivered" ? "DELIVERED" : "IN_TRANSIT";
    await applyShipmentStatus(shipment.id, status).catch((e) => console.error("[courier webhook] apply failed", e));
  }
  return new Response(null, { status: 200 });
}
```

- [ ] **Step 13: Add the dep + transpile to the vendor app.** In `apps/vendor/package.json` dependencies, after `"@e-luna/ai": "workspace:*",` add:
```json
    "@e-luna/courier": "workspace:*",
```
In `apps/vendor/next.config.ts`, add `"@e-luna/courier"` to the `transpilePackages` array.

- [ ] **Step 14: Install, generate, type-check the package + vendor**
```bash
pnpm install
pnpm exec tsc --noEmit -p packages/courier/tsconfig.json
pnpm --filter @e-luna/vendor exec tsc --noEmit
```
Expected: all exit 0.

- [ ] **Step 15: Commit**
```bash
git add packages/courier apps/vendor/app/lib/courier apps/vendor/app/actions/shipment.ts \
  "apps/vendor/app/api/webhooks/courier/[courier]/route.ts" apps/vendor/package.json apps/vendor/next.config.ts pnpm-lock.yaml
git commit -m "refactor(courier): extract shared @e-luna/courier gateway + repoint vendor"
```

---

### Task 2: Prisma — MaterialOrder courier fields

**Files:** Modify `packages/db/prisma/schema.prisma`

- [ ] **Step 1: Add the fields** — in `model MaterialOrder`, replace the `trackingNote String?` line with:
```prisma
  trackingNote   String?
  courier        String?
  trackingNumber String?
  externalRef    String?
  labelUrl       String?
```

- [ ] **Step 2: Generate + push**
```bash
pnpm --filter @e-luna/db db:generate && pnpm --filter @e-luna/db db:push
```
Expected: "Your database is now in sync with your Prisma schema."

- [ ] **Step 3: Commit**
```bash
git add packages/db/prisma/schema.prisma
git commit -m "feat(db): MaterialOrder structured courier fields"
```

---

### Task 3: Supplier apply-status + shipMaterialOrder gateway wiring

**Files:**
- Create: `apps/supplier/app/lib/courier/apply-status.ts`
- Modify: `apps/supplier/app/actions/incoming-order.ts`, `apps/supplier/package.json`, `apps/supplier/next.config.ts`

- [ ] **Step 1: `apps/supplier/app/lib/courier/apply-status.ts`**
```ts
import { prisma } from "@e-luna/db";

/** Idempotently move a shipped material order to COMPLETED on courier delivery. No-op otherwise. */
export async function applyMaterialOrderDelivery(materialOrderId: string): Promise<void> {
  await prisma.materialOrder
    .updateMany({ where: { id: materialOrderId, status: "SHIPPED" }, data: { status: "COMPLETED" } })
    .catch(() => null);
}
```

- [ ] **Step 2: Add the dep + transpile.** In `apps/supplier/package.json` dependencies, after `"@e-luna/einvoice": "workspace:*",` add:
```json
    "@e-luna/courier": "workspace:*",
```
In `apps/supplier/next.config.ts`, add `"@e-luna/courier"` to the `transpilePackages` array.

- [ ] **Step 3: Rewrite `shipMaterialOrder` in `apps/supplier/app/actions/incoming-order.ts`.** Add these imports at the top (after the existing imports):
```ts
import { getCourier } from "@e-luna/ui/couriers";
import { getCourierGateway } from "@e-luna/courier";
```
Then replace the entire existing `shipMaterialOrder` function with:
```ts
export async function shipMaterialOrder(
  orderId: string,
  input: { courier: string; trackingNumber?: string; trackingNote?: string }
): Promise<{ success: boolean; error?: string }> {
  const auth = await resolveActiveSupplier();
  if ("error" in auth) return { success: false, error: auth.error };

  const loaded = await loadOwnedOrder(orderId, auth.supplier.id);
  if ("error" in loaded) return { success: false, error: loaded.error };
  if (loaded.order.status !== "ACCEPTED") return { success: false, error: "Order is not accepted" };

  if (!getCourier(input.courier)) return { success: false, error: "Unknown courier" };

  // Destination: Vendor has no structured address model today, so name only (best-effort).
  // Real couriers need a full address — an operator follow-up (docs/deployment/couriers.md).
  const detail = await prisma.materialOrder
    .findUnique({ where: { id: orderId }, select: { vendor: { select: { storeName: true } } } })
    .catch(() => null);

  const result = await getCourierGateway(input.courier).createShipment({
    reference: orderId,
    courier: input.courier,
    destination: {
      name: detail?.vendor.storeName ?? "",
      addressLine1: "",
      city: "",
      emirate: null,
    },
  });
  if (result.status === "failed") return { success: false, error: result.error };

  let trackingNumber: string;
  let externalRef: string | null = null;
  let labelUrl: string | null = null;
  if (result.status === "created") {
    trackingNumber = result.trackingNumber;
    externalRef = result.externalRef;
    labelUrl = result.labelUrl ?? null;
  } else {
    if (!input.trackingNumber?.trim()) return { success: false, error: "Tracking number is required" };
    trackingNumber = input.trackingNumber.trim();
  }

  const note = input.trackingNote?.trim().slice(0, 200) || null;

  try {
    await prisma.materialOrder.update({
      where: { id: orderId },
      data: { status: "SHIPPED", courier: input.courier, trackingNumber, externalRef, labelUrl, trackingNote: note },
    });
    revalidatePath("/orders");
    revalidatePath(`/orders/${orderId}`);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to mark shipped" };
  }
}
```

- [ ] **Step 4: Install + type-check**
```bash
pnpm install
pnpm --filter @e-luna/supplier exec tsc --noEmit
```
Expected: exit 0. (Note: the supplier `OrderActions` island still calls the old `shipMaterialOrder(orderId, trackingNote)` signature and will error here — that call site is fixed in Task 5. If tsc fails ONLY on `OrderActions.tsx`, proceed to Task 5 before committing; otherwise fix the reported error.)

Because Task 5's UI change is required to compile, **defer the commit for Task 3 to the end of Task 5** (they ship together). Do NOT commit a broken tree.

---

### Task 4: Supplier courier webhook route

**Files:** Create `apps/supplier/app/api/webhooks/courier/[courier]/route.ts`

- [ ] **Step 1: Write the route**
```ts
import { prisma } from "@e-luna/db";
import type { CourierStatusEvent } from "@e-luna/courier";
import { getCourierGateway } from "@e-luna/courier";
import { applyMaterialOrderDelivery } from "../../../../lib/courier/apply-status";

export async function POST(req: Request, { params }: { params: Promise<{ courier: string }> }) {
  const { courier } = await params;
  const gw = getCourierGateway(courier);
  if (!gw.parseWebhook) return new Response(null, { status: 200 }); // Simulated / unconfigured

  const rawBody = await req.text();
  let event: CourierStatusEvent;
  try {
    event = gw.parseWebhook(rawBody, req.headers);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }
  if (!("match" in event)) return new Response(null, { status: 200 });
  // Only a delivered event changes a material order's state (SHIPPED → COMPLETED).
  if (event.status !== "delivered") return new Response(null, { status: 200 });

  const or = [
    ...(event.match.externalRef ? [{ externalRef: event.match.externalRef }] : []),
    ...(event.match.trackingNumber ? [{ trackingNumber: event.match.trackingNumber }] : []),
  ];
  if (or.length === 0) return new Response(null, { status: 200 });

  const order = await prisma.materialOrder
    .findFirst({ where: { courier, OR: or }, select: { id: true } })
    .catch(() => null);
  if (order) {
    await applyMaterialOrderDelivery(order.id).catch((e) =>
      console.error("[supplier courier webhook] apply failed", e)
    );
  }
  return new Response(null, { status: 200 });
}
```

- [ ] **Step 2: Type-check** (still expected to fail only on `OrderActions.tsx` until Task 5 — that's fine)
```bash
pnpm --filter @e-luna/supplier exec tsc --noEmit
```
Do not commit yet — ships with Task 5.

---

### Task 5: Supplier ship-form (courier dropdown) + order-detail tracking display

**Files:** Modify `apps/supplier/app/(dashboard)/components/OrderActions.tsx`, `apps/supplier/app/(dashboard)/orders/[id]/page.tsx`

- [ ] **Step 1: Replace `OrderActions.tsx`** with a courier-driven ship form for the ACCEPTED state:
```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { COURIERS } from "@e-luna/ui/couriers";
import {
  acceptMaterialOrder,
  rejectMaterialOrder,
  shipMaterialOrder,
  completeMaterialOrder,
} from "../../actions/incoming-order";

type Props = {
  orderId: string;
  status: string;
};

const primaryBtn =
  "rounded-full bg-ink px-5 py-2.5 text-body-sm font-medium text-ivory hover:bg-ink/90 transition-colors disabled:opacity-50";
const dangerBtn =
  "rounded-full bg-coral/10 px-5 py-2.5 text-body-sm font-medium text-coral hover:bg-coral/20 transition-colors disabled:opacity-50";

export function OrderActions({ orderId, status }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [courier, setCourier] = useState(COURIERS[0]?.id ?? "");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [trackingNote, setTrackingNote] = useState("");

  function run(fn: () => Promise<{ success: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.success) {
        setError(result.error ?? "Something went wrong");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {status === "PENDING" && (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={isPending} className={primaryBtn}
            onClick={() => run(() => acceptMaterialOrder(orderId))}>Accept order</button>
          <button type="button" disabled={isPending} className={dangerBtn}
            onClick={() => run(() => rejectMaterialOrder(orderId))}>Reject</button>
        </div>
      )}

      {status === "ACCEPTED" && (
        <div className="space-y-3 rounded-2xl border border-sand bg-ivory p-5">
          <p className="text-label text-mist">SHIP TO VENDOR</p>
          <div className="space-y-2">
            <label htmlFor="courier" className="text-body-xs text-mist block">Courier</label>
            <select id="courier" value={courier} onChange={(e) => setCourier(e.target.value)}
              className="w-full rounded-xl border border-sand px-4 py-3 text-body-md text-ink bg-white focus:outline-none focus:border-ink">
              {COURIERS.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label htmlFor="trackingNumber" className="text-body-xs text-mist block">
              Tracking number <span className="text-mist">(required unless auto-generated)</span>
            </label>
            <input id="trackingNumber" value={trackingNumber} maxLength={100}
              onChange={(e) => setTrackingNumber(e.target.value)}
              placeholder="e.g. 1234567890"
              className="w-full rounded-xl border border-sand px-4 py-3 text-body-md text-ink bg-white focus:outline-none focus:border-ink" />
          </div>
          <div className="space-y-2">
            <label htmlFor="note" className="text-body-xs text-mist block">Note (optional)</label>
            <input id="note" value={trackingNote} maxLength={200}
              onChange={(e) => setTrackingNote(e.target.value)}
              placeholder="Pickup details, etc."
              className="w-full rounded-xl border border-sand px-4 py-3 text-body-md text-ink bg-white focus:outline-none focus:border-ink" />
          </div>
          <button type="button" disabled={isPending || !courier} className={primaryBtn}
            onClick={() => run(() => shipMaterialOrder(orderId, {
              courier,
              trackingNumber: trackingNumber || undefined,
              trackingNote: trackingNote || undefined,
            }))}>Mark shipped</button>
        </div>
      )}

      {status === "SHIPPED" && (
        <button type="button" disabled={isPending} className={primaryBtn}
          onClick={() => run(() => completeMaterialOrder(orderId))}>Mark completed</button>
      )}

      {error && <p className="text-body-xs text-coral">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Update the supplier order-detail tracking block.** In `apps/supplier/app/(dashboard)/orders/[id]/page.tsx`, add the registry import after the existing imports:
```ts
import { courierName, trackingUrl } from "@e-luna/ui/couriers";
```
Then replace the existing `{order.trackingNote && ( ... )}` block with:
```tsx
      {order.courier && (
        <div className="rounded-2xl border border-sand bg-ivory p-5 space-y-1">
          <p className="text-label text-mist mb-1">SHIPMENT</p>
          <p className="text-body-sm text-ink">{courierName(order.courier)}</p>
          {order.trackingNumber &&
            (trackingUrl(order.courier, order.trackingNumber) ? (
              <a href={trackingUrl(order.courier, order.trackingNumber)!} target="_blank" rel="noopener noreferrer"
                className="text-body-sm text-gold hover:underline">
                Track {order.trackingNumber} →
              </a>
            ) : (
              <p className="text-body-sm text-mist">{order.trackingNumber}</p>
            ))}
          {order.labelUrl && (
            <a href={order.labelUrl} target="_blank" rel="noopener noreferrer" className="block text-body-sm text-gold hover:underline">
              Print label →
            </a>
          )}
          {order.trackingNote && <p className="text-body-sm text-ink">{order.trackingNote}</p>}
        </div>
      )}
      {!order.courier && order.trackingNote && (
        <div className="rounded-2xl border border-sand bg-ivory p-5">
          <p className="text-label text-mist mb-1">TRACKING</p>
          <p className="text-body-sm text-ink">{order.trackingNote}</p>
        </div>
      )}
```

- [ ] **Step 3: Type-check + lint the supplier app** (Tasks 3–5 now compile together)
```bash
pnpm --filter @e-luna/supplier exec tsc --noEmit && pnpm --filter @e-luna/supplier lint
```
Expected: clean.

- [ ] **Step 4: Commit Tasks 3–5 together**
```bash
git add apps/supplier/app/lib/courier "apps/supplier/app/api/webhooks/courier" \
  apps/supplier/app/actions/incoming-order.ts \
  "apps/supplier/app/(dashboard)/components/OrderActions.tsx" \
  "apps/supplier/app/(dashboard)/orders/[id]/page.tsx" \
  apps/supplier/package.json apps/supplier/next.config.ts pnpm-lock.yaml
git commit -m "feat(supplier): ship material orders via courier gateway + delivery webhook"
```

---

### Task 6: Vendor buyer view — shipment tracking on the sourcing order

**Files:** Modify `apps/vendor/app/(dashboard)/sourcing/orders/[id]/page.tsx`

- [ ] **Step 1: Add the registry import** after the existing imports:
```ts
import { courierName, trackingUrl } from "@e-luna/ui/couriers";
```

- [ ] **Step 2: Replace the `{order.trackingNote && ( ... )}` block** with a shipment panel:
```tsx
      {order.courier ? (
        <div className="rounded-2xl border border-sand bg-ivory p-5 space-y-1">
          <p className="text-label text-mist mb-1">SHIPMENT</p>
          <p className="text-body-sm text-ink">{courierName(order.courier)}</p>
          {order.trackingNumber &&
            (trackingUrl(order.courier, order.trackingNumber) ? (
              <a href={trackingUrl(order.courier, order.trackingNumber)!} target="_blank" rel="noopener noreferrer"
                className="text-body-sm text-gold hover:underline">
                Track {order.trackingNumber} →
              </a>
            ) : (
              <p className="text-body-sm text-mist">{order.trackingNumber}</p>
            ))}
          {order.trackingNote && <p className="text-body-sm text-ink">{order.trackingNote}</p>}
        </div>
      ) : (
        order.trackingNote && (
          <div className="rounded-2xl border border-sand bg-ivory p-5">
            <p className="text-label text-mist mb-1">SUPPLIER TRACKING</p>
            <p className="text-body-sm text-ink">{order.trackingNote}</p>
          </div>
        )
      )}
```

- [ ] **Step 3: Type-check + lint**
```bash
pnpm --filter @e-luna/vendor exec tsc --noEmit && pnpm --filter @e-luna/vendor lint
```
Expected: clean.

- [ ] **Step 4: Commit**
```bash
git add "apps/vendor/app/(dashboard)/sourcing/orders/[id]/page.tsx"
git commit -m "feat(vendor): show supplier courier tracking on the sourcing order"
```

---

### Task 7: Fold-in fixes + env + docs

**Files:** Modify `apps/vendor/app/actions/invoice.ts`, `.env.example`, `docs/deployment/couriers.md`

- [ ] **Step 1: Fix the Vendor Invoicing I1 compound-key check.** In `apps/vendor/app/actions/invoice.ts`, replace:
```ts
      if (pErr.code === "P2002" && (target.includes("orderId") || target.includes("vendorId"))) {
```
with:
```ts
      if (pErr.code === "P2002" && target.some((t) => t.includes("orderId") && t.includes("vendorId"))) {
```

- [ ] **Step 2: Add DHL env vars.** In `.env.example`, in the courier section (near `ARAMEX_API_KEY`), add if not already present:
```bash
# DHL Express MyDHL API (supplier→vendor + vendor→customer couriers). Unset → Simulated (manual tracking).
DHL_API_KEY=
DHL_ACCOUNT_NUMBER=
DHL_WEBHOOK_SECRET=
```

- [ ] **Step 3: Document the supplier leg.** Append to `docs/deployment/couriers.md`:
```markdown

## Supplier → vendor material orders

The supplier's `MaterialOrder` shipping reuses the same `@e-luna/courier` gateway. `shipMaterialOrder`
calls `getCourierGateway(courier).createShipment(...)`; with no keys the Simulated gateway asks the supplier
to enter a tracking number (manual). The webhook `POST /api/webhooks/courier/[courier]` (supplier app) moves
the order `SHIPPED → COMPLETED` on a `delivered` event.

**Operator note:** the `Vendor` has no structured address model yet, so the real-courier destination is
best-effort (`storeName` only). Before enabling a real courier for the supplier leg, add a vendor
shipping-address source and populate `destination.addressLine1`/`city`/`emirate` in `shipMaterialOrder`.
```

- [ ] **Step 4: Type-check + commit**
```bash
pnpm --filter @e-luna/vendor exec tsc --noEmit
git add apps/vendor/app/actions/invoice.ts .env.example docs/deployment/couriers.md
git commit -m "fix(vendor): match compound P2002 constraint name; doc + env for supplier courier"
```

---

### Task 8: Full-workspace verification

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck**
```bash
pnpm --filter "@e-luna/*" exec tsc --noEmit
```
Expected: exit 0 (all 9 packages/apps, incl. the new `@e-luna/courier`).

- [ ] **Step 2: Full lint**
```bash
pnpm lint
```
Expected: 4/4 apps pass (only the pre-existing `<img>` warnings in customer `cart/CartReview.tsx` + `checkout/confirm/page.tsx`).

- [ ] **Step 3: Sanity-check the extraction** — confirm no stale imports of the moved vendor files remain:
```bash
grep -rn "lib/courier/factory\|lib/courier/gateway\|lib/courier/simulated\|lib/courier/aramex\|lib/courier/config" apps/ || echo "no stale imports — clean"
```
Expected: only `apply-status` references remain (which are app-local and correct); the grep above targets only the moved files and should print "no stale imports — clean".

- [ ] **Step 4: gitleaks** runs on commit (pre-commit hook) — already green per prior commits. No action.

---

## Notes for the implementer

- **`db push`, never migrations** — this repo has no migration files.
- **Neutral status is the crux of Task 1:** the package no longer imports `@e-luna/db`; each app maps
  `CourierDeliveryStatus` to its own enum (vendor → `ShipmentStatus`, supplier → `MaterialOrderStatus` via
  the SHIPPED→COMPLETED guard). If you see the package trying to import `ShipmentStatus`, you've under-generalized.
- **Tasks 3–5 commit together** (the `shipMaterialOrder` signature change breaks the old `OrderActions` call
  until Task 5 updates it) — do not commit a broken tree between them.
- **Locally everything runs via Simulated** (no courier keys): the supplier enters a tracking number, the
  order goes SHIPPED, the vendor sees courier + tracking, and the supplier clicks "Mark completed". The
  auto-complete webhook path only activates with a real courier configured.
- Security invariant unchanged: `supplierId`/`vendorId` server-resolved; `shipMaterialOrder` guards owned +
  ACCEPTED; webhook is courier-scoped + idempotent.
