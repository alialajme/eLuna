# Phase 8c: Logistics Agent (customer delivery assistant) — Design Spec

## Goal

Wire the Logistics agent as an advisory, read-only **customer delivery assistant**: it answers "where's my order?", delivery timing per shipment, and whether/how an item can be returned — grounded in the now-real 7a shipment tracking and 7b return data. It surfaces as a "Delivery Help" widget on the customer's orders pages. It never mutates anything (shipments/returns stay in the deterministic vendor/customer flows).

---

## Scope

**In scope:**
- Rewrite `packages/ai/src/agents/logistics.ts` with `buildLogisticsTools(customerId)` (3 read-only tools) + `runLogisticsAgent(messages, { customerId })`.
- A customer route `/api/delivery-help`.
- A `hiddenPrefixes` prop on `LunaChatWidget`; mount a "Delivery Help" widget on the orders pages; hide the global Shopping widget there.

**Out of scope (later / not this phase):**
- Any mutation by the agent (creating shipments, marking delivered, requesting/approving returns — those stay in the 7a/7b deterministic actions; the agent points to the "Request return" button).
- A vendor-facing logistics agent (this phase is customer-facing only).
- Live courier-API tracking (the agent reports the stored shipment status; the live deep-link is on the order page from 7a).
- `AISession` persistence and inter-agent handoff (Phase 8e).
- Schema changes.

---

## Architecture

The agent is **advisory/read-only**, customer-scoped, in a new customer route (`/api/delivery-help`), surfaced via the reused `LunaChatWidget` (Vercel AI SDK `useChat` → `toDataStreamResponse()`), identical to the 8a Seller and 8b Payment wirings.

**Security:** the agent is bound to the authenticated customer. `customerId` (= `CustomerProfile.id`) is resolved server-side (`safeCurrentUser()` → `prisma.customerProfile.findUnique({ where:{ userId } })`), captured in the `buildLogisticsTools(customerId)` closure, and **never** an LLM parameter. Order-based tools filter by `{ id: orderId, customerId }` (ownership check). **No tool mutates data.**

**Registry independence:** to avoid an `@e-luna/ai → @e-luna/ui` dependency, tools return the courier name + tracking number (not a constructed deep-link); the live tracking link already lives on the order page (7a).

### Files
```
packages/ai/src/agents/logistics.ts             — REWRITE: buildLogisticsTools(customerId) + runLogisticsAgent(messages, { customerId })
packages/ai/src/index.ts                          — MODIFY: export runLogisticsAgent + buildLogisticsTools (drop logisticsTools)
packages/ui/src/components/LunaChatWidget.tsx     — MODIFY: add optional hiddenPrefixes prop
apps/customer/app/layout.tsx                       — MODIFY: Shopping widget hiddenPrefixes={["/orders"]}
apps/customer/app/api/delivery-help/route.ts       — CREATE: POST → auth → customer profile → runLogisticsAgent → stream
apps/customer/app/orders/layout.tsx                — CREATE: mount the Delivery widget across /orders*
```
No schema changes. `packages/ai` depends on `@e-luna/db`; the customer app already depends on `@e-luna/ai`, `@e-luna/ui`, and `ai`.

**Verified facts:** `Order { id, customerId (= CustomerProfile.id), status, createdAt, updatedAt, items OrderItem[], shipments Shipment[] }`; `Shipment { courier, trackingNumber?, status, estimatedDelivery?, deliveredAt? }`; `OrderItem { fulfillmentStatus, shipmentId?, shipment Shipment?, returns Return[], variant→product.title }`; `Return { status }`; `ReturnStatus` includes `REJECTED`. Shopping widget at `apps/customer/app/layout.tsx:55` is `<LunaChatWidget apiPath="/api/chat" hiddenPaths={["/chat", "/checkout"]} />`; the widget's hide rule (line 54) is `if ((hiddenPaths ?? ["/chat"]).includes(pathname)) return null;`. There is no `apps/customer/app/orders/layout.tsx` today.

---

## Logistics Agent — `packages/ai/src/agents/logistics.ts`

Mirrors the 8a/8b factory shape.

### System prompt
```
${DEFAULT_SYSTEM_CONTEXT}

You are the Delivery Agent — a READ-ONLY delivery & returns helper for a Luna customer.
Use your tools to answer where an order is, when it should arrive, and whether an item can be returned.
You do NOT ship, move, cancel, or return anything — never claim you have. To return an item, tell the
customer to use the "Request return" button on the order page (delivered items only, within 14 days).
Couriers we use: Aramex, Fetchr, Quiqup, Emirates Post, DHL. Typical delivery is 2–5 business days.
Ground every answer in the tools; never invent tracking numbers, dates, or statuses. Be concise.
```

### `buildLogisticsTools(customerId: string)` — 3 read-only tools

`customerId` from the closure — NEVER an LLM parameter. All reads `.catch()`-guarded; dates ISO-`slice(0,10)`.

1. **`list_my_orders`** — params `{ limit: z.number().int().min(1).max(20).default(5) }`.
   ```ts
   const orders = await prisma.order.findMany({
     where: { customerId },
     orderBy: { createdAt: "desc" },
     take: limit,
     select: {
       id: true, status: true, createdAt: true,
       _count: { select: { items: true } },
       shipments: { select: { status: true }, orderBy: { createdAt: "desc" } },
     },
   }).catch(() => []);
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
   ```

2. **`track_order`** — params `{ orderId: z.string() }`. Ownership-checked.
   ```ts
   const order = await prisma.order.findFirst({
     where: { id: orderId, customerId },
     select: {
       status: true,
       shipments: {
         orderBy: { createdAt: "asc" },
         select: { id: true, courier: true, trackingNumber: true, status: true, estimatedDelivery: true, deliveredAt: true },
       },
       items: { select: { shipmentId: true, variant: { select: { product: { select: { title: true } } } } } },
     },
   }).catch(() => null);
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
   ```

3. **`return_options`** — params `{ orderId: z.string() }`. Ownership-checked; advisory only.
   ```ts
   const order = await prisma.order.findFirst({
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
   }).catch(() => null);
   if (!order) return { error: "Order not found in your account" };

   const WINDOW = 14 * 86_400_000;
   const items = order.items.map((it) => {
     const active = it.returns.find((r) => r.status !== "REJECTED");
     const delivered = it.fulfillmentStatus === "DELIVERED";
     const anchor = it.shipment?.deliveredAt ?? order.updatedAt;
     const withinWindow = Date.now() - new Date(anchor).getTime() <= WINDOW;
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
   ```

### `runLogisticsAgent`
```ts
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
`packages/ai/src/index.ts`: change the logistics export from `runLogisticsAgent, logisticsTools` to `runLogisticsAgent, buildLogisticsTools`. (No app imports `logisticsTools`.)

---

## Customer Route — `apps/customer/app/api/delivery-help/route.ts`

Mirrors `/api/payment-help` (8b).
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
        status: 401, headers: { "Content-Type": "application/json" },
      });
    }

    const profile = await prisma.customerProfile
      .findUnique({ where: { userId: user.id }, select: { id: true } })
      .catch(() => null);
    if (!profile) {
      return new Response(JSON.stringify({ error: "Customer profile not found" }), {
        status: 403, headers: { "Content-Type": "application/json" },
      });
    }

    const result = await runLogisticsAgent(messages, { customerId: profile.id });
    return result.toDataStreamResponse();
  } catch (error) {
    console.error("[/api/delivery-help] error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
}
```
`customerId` comes only from the resolved profile.

---

## Shared Widget — `LunaChatWidget` (add `hiddenPrefixes`)

Add an optional prop; backward-compatible.
```ts
type LunaChatWidgetProps = {
  apiPath: string;
  title?: string;
  greeting?: string;
  hiddenPaths?: string[];    // exact-match hide; default ["/chat"]
  hiddenPrefixes?: string[]; // hide when pathname starts with any prefix; default none
};
```
Destructure `hiddenPrefixes` and, right after the existing exact-match hide rule (line 54), add:
```ts
if ((hiddenPrefixes ?? []).some((p) => pathname.startsWith(p))) return null;
```

---

## Surfacing

**Root layout** (`apps/customer/app/layout.tsx:55`) — hide Shopping across all `/orders*`:
```tsx
<LunaChatWidget apiPath="/api/chat" hiddenPaths={["/chat", "/checkout"]} hiddenPrefixes={["/orders"]} />
```

**Orders layout** (`apps/customer/app/orders/layout.tsx`, new) — mount the Delivery widget once for the list + detail pages:
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
The Delivery widget uses the default `hiddenPaths` (`["/chat"]`), so it shows on `/orders` and `/orders/[id]`. Net effect: on `/orders*` only Delivery floats; elsewhere only Shopping.

---

## Error Handling

- Route: 401 (no user), 403 (no customer profile), 500 (unexpected) — generic messages; `customerId` only from the resolved profile.
- Tools: all Prisma reads `.catch()`-guarded; `track_order`/`return_options` ownership-check → `{ error: "Order not found in your account" }`; dates null-guarded before `toISOString`; `list_my_orders` limit bounded by zod (1–20).
- **No mutations anywhere**; the system prompt forbids claiming to have shipped/returned.
- Widget change backward-compatible (`hiddenPrefixes` defaults to none).

---

## Testing

No automated suite (repo-consistent). Per task:
```bash
cd packages/ai && npx tsc --noEmit 2>&1                                     # clean
cd packages/ui && npx tsc --noEmit 2>&1                                     # clean
cd apps/customer && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts"    # clean
cd apps/customer && npx next lint 2>&1 | tail -3                            # no new errors
```
Final task runs repo-wide `pnpm lint` + `pnpm --filter "@e-luna/*" exec tsc --noEmit`. Live agent chat needs a running app + `ANTHROPIC_API_KEY` (manual smoke: open `/orders/[id]` → "where's my order?" / "can I return the abaya?").

---

## Boundary with 8e

8c wires a single customer logistics surface. Inter-agent handoff (Shopping → Payment → Delivery) and `AISession` persistence remain Phase 8e. The advisory/read-only stance matches the 8b Payment agent, keeping the customer-facing agents consistent and safe.
