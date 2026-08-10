# Phase 8c: Logistics Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire an advisory, read-only customer delivery assistant — the Logistics agent answers "where's my order?", delivery timing, and return eligibility over the real 7a/7b data, surfaced as a "Delivery Help" widget on the orders pages.

**Architecture:** Rewrite the logistics agent to `buildLogisticsTools(customerId)` + `runLogisticsAgent(messages, { customerId })` (customerId session-resolved, closure-scoped, never an LLM param), 3 read-only ownership-checked tools. A new `/api/delivery-help` route streams it through the reused `LunaChatWidget`, which gains a `hiddenPrefixes` prop so the global Shopping widget hides on `/orders*` while the Delivery widget (mounted via a new orders layout) shows there.

**Tech Stack:** Vercel AI SDK (`streamText`, `tool`, `CoreMessage`, `toDataStreamResponse`), Anthropic `claude-sonnet-4-6`, Prisma + PostgreSQL, Zod, Next.js 15, TypeScript (`noUncheckedIndexedAccess` on).

---

## Context for the implementer (read once)

- **No automated test suite.** "Tests" = `npx tsc --noEmit` and `npx next lint`. Do NOT add a test runner.
- **`noUncheckedIndexedAccess` is ON** (`arr[0]?.x`, `?? fallback`). **Prisma `Decimal`** → `Number(...)` (none written here). No schema change.
- **Agent security rule:** the scoping id (`customerId` = `CustomerProfile.id`) is captured in the tool-factory closure — NEVER a Zod/LLM parameter. Order tools filter `{ id: orderId, customerId }`.
- **Reference patterns:** `packages/ai/src/agents/payment.ts` (8b: `buildPaymentTools(customerId)` + `runPaymentAgent(messages, { customerId })`, config import `import { anthropic, LUNA_MODEL, DEFAULT_SYSTEM_CONTEXT } from "../config";`, `import { streamText, tool } from "ai"; import type { CoreMessage } from "ai"; import { z } from "zod"; import { prisma } from "@e-luna/db";`). Route pattern: `apps/customer/app/api/payment-help/route.ts` (imports `safeCurrentUser as currentUser` from `../../lib/auth`).
- **Verified state:**
  - `packages/ai/src/agents/logistics.ts` currently: stub `logisticsTools` (empty tools) + `runLogisticsAgent(messages: {role,content}[])`.
  - `packages/ai/src/index.ts` line 5: `export { runLogisticsAgent, logisticsTools } from "./agents/logistics";`. No app imports `logisticsTools`.
  - `LunaChatWidget` props: `{ apiPath, title?, greeting?, hiddenPaths? }`; hide rule (line 54): `if ((hiddenPaths ?? ["/chat"]).includes(pathname)) return null;`.
  - `apps/customer/app/layout.tsx:55`: `<LunaChatWidget apiPath="/api/chat" hiddenPaths={["/chat", "/checkout"]} />`. `LunaChatWidget` is imported there.
  - No `apps/customer/app/orders/layout.tsx` exists.
  - Schema: `Order { id, customerId, status, createdAt, updatedAt, items, shipments }`; `Shipment { courier, trackingNumber?, status, estimatedDelivery?, deliveredAt? }`; `OrderItem { fulfillmentStatus, shipmentId?, shipment?, returns Return[], variant→product.title }`; `Return { status }`.

---

## File Structure

```
packages/ai/src/agents/logistics.ts             — REWRITE: buildLogisticsTools(customerId) + runLogisticsAgent(messages, { customerId })
packages/ai/src/index.ts                          — MODIFY line 5 export
packages/ui/src/components/LunaChatWidget.tsx     — MODIFY: add hiddenPrefixes prop
apps/customer/app/layout.tsx                       — MODIFY line 55: Shopping widget hiddenPrefixes={["/orders"]}
apps/customer/app/api/delivery-help/route.ts       — CREATE
apps/customer/app/orders/layout.tsx                — CREATE: mount Delivery widget
```

---

## Task 1: Rewrite the Logistics agent (advisory, customer-scoped)

**Files:** Modify (full rewrite) `packages/ai/src/agents/logistics.ts`; Modify `packages/ai/src/index.ts:5`.

- [ ] **Step 1: Replace the entire contents of `packages/ai/src/agents/logistics.ts`**

```ts
import { streamText, tool } from "ai";
import type { CoreMessage } from "ai";
import { z } from "zod";
import { prisma } from "@e-luna/db";
import { anthropic, LUNA_MODEL, DEFAULT_SYSTEM_CONTEXT } from "../config";

const LOGISTICS_SYSTEM = `${DEFAULT_SYSTEM_CONTEXT}

You are the Delivery Agent — a READ-ONLY delivery & returns helper for a Luna customer.
Use your tools to answer where an order is, when it should arrive, and whether an item can be returned.
You do NOT ship, move, cancel, or return anything — never claim you have. To return an item, tell the
customer to use the "Request return" button on the order page (delivered items only, within 14 days).
Couriers we use: Aramex, Fetchr, Quiqup, Emirates Post, DHL. Typical delivery is 2–5 business days.
Ground every answer in the tools; never invent tracking numbers, dates, or statuses. Be concise.`;

const RETURN_WINDOW_MS = 14 * 86_400_000;

/**
 * Build the Logistics agent's read-only tools, scoped to one customer.
 * `customerId` (= CustomerProfile.id) is captured from the closure and is NEVER
 * an LLM-settable parameter. No tool mutates data.
 */
export function buildLogisticsTools(customerId: string) {
  return {
    list_my_orders: tool({
      description: "List the customer's recent orders with their status and a shipment summary.",
      parameters: z.object({ limit: z.number().int().min(1).max(20).default(5) }),
      execute: async ({ limit }) => {
        const orders = await prisma.order
          .findMany({
            where: { customerId },
            orderBy: { createdAt: "desc" },
            take: limit,
            select: {
              id: true,
              status: true,
              createdAt: true,
              _count: { select: { items: true } },
              shipments: { select: { status: true }, orderBy: { createdAt: "desc" } },
            },
          })
          .catch(() => []);
        return {
          orders: orders.map((o) => ({
            orderId: o.id,
            shortId: o.id.slice(-8).toUpperCase(),
            status: o.status,
            placed: o.createdAt.toISOString().slice(0, 10),
            itemCount: o._count.items,
            shipmentCount: o.shipments.length,
            latestShipmentStatus: o.shipments[0]?.status ?? null,
          })),
        };
      },
    }),

    track_order: tool({
      description: "Get detailed shipment tracking for one of the customer's orders.",
      parameters: z.object({ orderId: z.string() }),
      execute: async ({ orderId }) => {
        const order = await prisma.order
          .findFirst({
            where: { id: orderId, customerId },
            select: {
              status: true,
              shipments: {
                orderBy: { createdAt: "asc" },
                select: {
                  id: true,
                  courier: true,
                  trackingNumber: true,
                  status: true,
                  estimatedDelivery: true,
                  deliveredAt: true,
                },
              },
              items: {
                select: { shipmentId: true, variant: { select: { product: { select: { title: true } } } } },
              },
            },
          })
          .catch(() => null);
        if (!order) return { error: "Order not found in your account" };

        const titlesBy = new Map<string, string[]>();
        const notYetShipped: string[] = [];
        for (const it of order.items) {
          const title = it.variant.product.title;
          if (it.shipmentId) {
            const a = titlesBy.get(it.shipmentId) ?? [];
            a.push(title);
            titlesBy.set(it.shipmentId, a);
          } else {
            notYetShipped.push(title);
          }
        }
        return {
          orderStatus: order.status,
          shipments: order.shipments.map((s) => ({
            courier: s.courier,
            trackingNumber: s.trackingNumber,
            status: s.status,
            estimatedDelivery: s.estimatedDelivery ? s.estimatedDelivery.toISOString().slice(0, 10) : null,
            deliveredAt: s.deliveredAt ? s.deliveredAt.toISOString().slice(0, 10) : null,
            items: titlesBy.get(s.id) ?? [],
          })),
          notYetShipped,
        };
      },
    }),

    return_options: tool({
      description:
        "For one of the customer's orders, report which items can be returned and any existing return status. Advisory only.",
      parameters: z.object({ orderId: z.string() }),
      execute: async ({ orderId }) => {
        const order = await prisma.order
          .findFirst({
            where: { id: orderId, customerId },
            select: {
              updatedAt: true,
              items: {
                select: {
                  fulfillmentStatus: true,
                  shipment: { select: { deliveredAt: true } },
                  returns: { select: { status: true } },
                  variant: { select: { product: { select: { title: true } } } },
                },
              },
            },
          })
          .catch(() => null);
        if (!order) return { error: "Order not found in your account" };

        const items = order.items.map((it) => {
          const active = it.returns.find((r) => r.status !== "REJECTED");
          const delivered = it.fulfillmentStatus === "DELIVERED";
          const anchor = it.shipment?.deliveredAt ?? order.updatedAt;
          const withinWindow = Date.now() - new Date(anchor).getTime() <= RETURN_WINDOW_MS;
          return {
            product: it.variant.product.title,
            delivered,
            withinWindow,
            existingReturn: active?.status ?? null,
            canRequestReturn: delivered && withinWindow && !active,
          };
        });
        return {
          items,
          note: "To start a return, use the 'Request return' button on the order page (delivered items, within 14 days).",
        };
      },
    }),
  };
}

export async function runLogisticsAgent(
  messages: CoreMessage[],
  options: { customerId: string },
) {
  return streamText({
    model: anthropic(LUNA_MODEL),
    system: LOGISTICS_SYSTEM,
    messages,
    tools: buildLogisticsTools(options.customerId),
    maxSteps: 5,
  });
}
```

- [ ] **Step 2: Update the barrel export in `packages/ai/src/index.ts`**

Change line 5 from:
```ts
export { runLogisticsAgent, logisticsTools } from "./agents/logistics";
```
to:
```ts
export { runLogisticsAgent, buildLogisticsTools } from "./agents/logistics";
```

- [ ] **Step 3: Type-check the ai package**

Run: `cd /Users/alialajme/Projects/Luna/e-luna/packages/ai && npx tsc --noEmit 2>&1`
Expected: clean.

- [ ] **Step 4: Grep for stale consumers of the removed `logisticsTools` export**

Run: `cd /Users/alialajme/Projects/Luna/e-luna && grep -rn "logisticsTools" apps packages --include=*.ts --include=*.tsx`
Expected: only the definition line you just wrote in `packages/ai/src/agents/logistics.ts`… actually you renamed it, so `logisticsTools` should appear NOWHERE. Expected: no matches. (If a consumer appears in an app, report DONE_WITH_CONCERNS.)

- [ ] **Step 5: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna
git add packages/ai/src/agents/logistics.ts packages/ai/src/index.ts
git commit -m "feat(ai): rewrite Logistics agent as advisory customer delivery assistant (8c)

buildLogisticsTools(customerId) + runLogisticsAgent(messages,{customerId}).
Three read-only ownership-scoped tools: list_my_orders, track_order,
return_options — over the real 7a shipment + 7b return data. No mutation;
customerId is closure-scoped, never an LLM param.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Add `hiddenPrefixes` to `LunaChatWidget`

**Files:** Modify `packages/ui/src/components/LunaChatWidget.tsx`.

- [ ] **Step 1: Extend the props type**

Replace:
```ts
type LunaChatWidgetProps = {
  apiPath: string; // e.g. "/api/chat" — route handler in the app
  title?: string; // header title; default "Luna Stylist"
  greeting?: string; // empty-state assistant greeting; default the customer copy
  hiddenPaths?: string[]; // pathnames where the widget renders nothing; default ["/chat"]
};
```
with:
```ts
type LunaChatWidgetProps = {
  apiPath: string; // e.g. "/api/chat" — route handler in the app
  title?: string; // header title; default "Luna Stylist"
  greeting?: string; // empty-state assistant greeting; default the customer copy
  hiddenPaths?: string[]; // exact-match pathnames where the widget renders nothing; default ["/chat"]
  hiddenPrefixes?: string[]; // hide when pathname starts with any prefix; default none
};
```

- [ ] **Step 2: Destructure the new prop**

Replace:
```ts
export function LunaChatWidget({ apiPath, title, greeting, hiddenPaths }: LunaChatWidgetProps) {
```
with:
```ts
export function LunaChatWidget({ apiPath, title, greeting, hiddenPaths, hiddenPrefixes }: LunaChatWidgetProps) {
```

- [ ] **Step 3: Add the prefix hide rule right after the exact-match rule (line 54)**

Replace:
```ts
  // Hide on configured paths (default: the full chat page) — after all hooks
  if ((hiddenPaths ?? ["/chat"]).includes(pathname)) return null;
```
with:
```ts
  // Hide on configured paths (default: the full chat page) — after all hooks
  if ((hiddenPaths ?? ["/chat"]).includes(pathname)) return null;
  if ((hiddenPrefixes ?? []).some((p) => pathname.startsWith(p))) return null;
```

- [ ] **Step 4: Type-check the ui package**

Run: `cd /Users/alialajme/Projects/Luna/e-luna/packages/ui && npx tsc --noEmit 2>&1`
Expected: clean. (Default `hiddenPrefixes` = none preserves current behavior for all callers.)

- [ ] **Step 5: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna
git add packages/ui/src/components/LunaChatWidget.tsx
git commit -m "feat(ui): add hiddenPrefixes prop to LunaChatWidget (8c)

Optional string[] of pathname prefixes where the widget renders null; defaults
to none so existing callers are unchanged.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Create the `/api/delivery-help` route

**Files:** Create `apps/customer/app/api/delivery-help/route.ts`.

- [ ] **Step 1: Create `apps/customer/app/api/delivery-help/route.ts`**

```ts
import { safeCurrentUser as currentUser } from "../../lib/auth";
import { prisma } from "@e-luna/db";
import { runLogisticsAgent } from "@e-luna/ai";
import type { CoreMessage } from "ai";

export async function POST(req: Request) {
  try {
    const { messages } = (await req.json()) as { messages: CoreMessage[] };

    const user = await currentUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const profile = await prisma.customerProfile
      .findUnique({ where: { userId: user.id }, select: { id: true } })
      .catch(() => null);
    if (!profile) {
      return new Response(JSON.stringify({ error: "Customer profile not found" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const result = await runLogisticsAgent(messages, { customerId: profile.id });
    return result.toDataStreamResponse();
  } catch (error) {
    console.error("[/api/delivery-help] error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
```

- [ ] **Step 2: Type-check the customer app**

Run: `cd /Users/alialajme/Projects/Luna/e-luna/apps/customer && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts"`
Expected: clean. (`runLogisticsAgent` and `CoreMessage` resolve from `@e-luna/ai` / `ai`.)

- [ ] **Step 3: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna
git add apps/customer/app/api/delivery-help/route.ts
git commit -m "feat(customer): add /api/delivery-help route for Logistics agent (8c)

Resolves customerId from the Clerk session (401/403 guards) and streams
runLogisticsAgent. customerId comes only from the resolved CustomerProfile.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Surface the Delivery widget (root layout + orders layout)

**Files:** Modify `apps/customer/app/layout.tsx:55`; Create `apps/customer/app/orders/layout.tsx`.

- [ ] **Step 1: Hide the Shopping widget across `/orders*` — `apps/customer/app/layout.tsx:55`**

Replace:
```tsx
            <LunaChatWidget apiPath="/api/chat" hiddenPaths={["/chat", "/checkout"]} />
```
with:
```tsx
            <LunaChatWidget apiPath="/api/chat" hiddenPaths={["/chat", "/checkout"]} hiddenPrefixes={["/orders"]} />
```

- [ ] **Step 2: Create `apps/customer/app/orders/layout.tsx`**

```tsx
import { LunaChatWidget } from "@e-luna/ui";

export default function OrdersLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <LunaChatWidget
        apiPath="/api/delivery-help"
        title="Delivery Help"
        greeting="Ask me where your order is, delivery timing, or how to return an item."
      />
    </>
  );
}
```

- [ ] **Step 3: Type-check + lint the customer app**

Run:
```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/customer
npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts" | tail -6
npx next lint 2>&1 | tail -5
```
Expected: tsc clean; no new lint errors. (`LunaChatWidget` resolves from `@e-luna/ui`; a client component as a child of a server-component layout is fine.)

- [ ] **Step 4: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna
git add apps/customer/app/layout.tsx apps/customer/app/orders/layout.tsx
git commit -m "feat(customer): surface Delivery Help widget on the orders pages (8c)

Mount the Delivery widget via a new orders layout and hide the Shopping
widget on /orders* via hiddenPrefixes, so only one widget floats there.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Repo-wide green check

**Files:** none (verification only).

- [ ] **Step 1: Frozen install (mirror CI)**

Run: `cd /Users/alialajme/Projects/Luna/e-luna && pnpm install --frozen-lockfile 2>&1 | tail -3`
Expected: no lockfile change (no new dependencies this phase).

- [ ] **Step 2: Repo-wide lint**

Run: `cd /Users/alialajme/Projects/Luna/e-luna && pnpm lint 2>&1 | tail -12`
Expected: all apps pass (pre-existing `<img>` warnings acceptable; no new errors).

- [ ] **Step 3: Repo-wide type check**

Run: `cd /Users/alialajme/Projects/Luna/e-luna && pnpm --filter "@e-luna/*" exec tsc --noEmit 2>&1 | tail -12`
Expected: clean.

- [ ] **Step 4: Confirm the advisory guarantee (no mutation in the agent)**

Run: `grep -nE "\.(update|create|delete|upsert|updateMany|createMany|deleteMany)\(" packages/ai/src/agents/logistics.ts`
Expected: NO matches — the agent performs only `findMany`/`findFirst` reads.

- [ ] **Step 5: Final commit (only if Steps 2-3 required fixes; otherwise skip)**

```bash
cd /Users/alialajme/Projects/Luna/e-luna
git add -A
git commit -m "chore(8c): lint/type fixes for Logistics agent wiring

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 6: Manual smoke note (not automated)**

Live agent chat needs a running customer app + `ANTHROPIC_API_KEY`. Smoke: sign in, open `/orders/[id]`, open the "Delivery Help" bubble, ask "where's my order?" and "can I return the abaya?" — the agent should call `track_order` / `return_options` and answer from real data. Documented, not automated.

---

## Self-Review (completed)

**Spec coverage:**
- `buildLogisticsTools(customerId)` + `runLogisticsAgent(messages,{customerId})`, closure-scoped id → Task 1 ✓
- 3 read-only ownership-checked tools (list_my_orders, track_order, return_options) → Task 1 ✓
- Drop `logisticsTools`; export `buildLogisticsTools` → Task 1 Steps 2/4 ✓
- No mutation (verified by grep) → Task 5 Step 4 ✓
- `hiddenPrefixes` prop → Task 2 ✓
- Shopping widget hidden on `/orders*` → Task 4 Step 1 ✓
- Delivery widget mounted via orders layout → Task 4 Step 2 ✓
- `/api/delivery-help` route with 401/403/500 → Task 3 ✓
- Repo-wide green → Task 5 ✓

**Placeholder scan:** none — every code step is complete.

**Type consistency:** `buildLogisticsTools`/`runLogisticsAgent` signatures match between agent (Task 1), export (Task 1), and route call (Task 3). `hiddenPrefixes` prop name identical in type, destructure, usage (Task 2) and the root-layout call site (Task 4). `CoreMessage` imported consistently. Ownership filters use `{ id: orderId, customerId }` in both order tools.
