# Phase 8a: Agent Infrastructure + Seller Agent — Design Spec

## Goal

Wire the **Seller Agent** end-to-end: turn its stub tools into real, vendor-scoped data tools and surface it as a floating "Seller Assistant" chat on every vendor dashboard page, reusing the existing chat UI. This is the first agent of the AI Agent Mesh (Phase 8) beyond Shopping/Studio and establishes the per-agent wiring pattern the rest of the mesh reuses. `AISession` persistence is deferred to the later orchestration phase (a single agent doesn't need it; it's a cross-agent concern).

---

## Scope

**In scope:** real implementations for the Seller agent's tools (`flag_low_stock`, `suggest_price`, `forecast_demand`, plus an honest `studio_link` deep-link); a vendor chat API route; two optional (backward-compatible) props on the shared `LunaChatWidget`; mounting the widget in the vendor dashboard layout.

**Out of scope:** `AISession` message/context persistence (deferred); the other agents (Payment/Logistics/POS) and inter-agent handoff/orchestration; real Studio pipeline triggering from chat (needs image upload — the tool only deep-links); schema changes; Arabic-specific tuning beyond the existing "respond in the user's language" system context.

---

## Architecture

The Seller agent runs server-side in a new vendor route (`/api/assistant`) and streams back through the existing `LunaChatWidget` via the Vercel AI SDK `useChat` → `toDataStreamResponse()` pattern (identical to the customer Shopping agent at `/api/chat`). Its tools query live data with Prisma (`packages/ai` already depends on `@e-luna/db`).

**Security — vendor scoping:** the agent is bound to the **authenticated vendor**. `vendorId` is resolved server-side (`safeCurrentUser()` → `getVendorByUserId()`) and passed into a tool factory; it is **never** a tool parameter the LLM can set. Tools that accept a `productId` verify the product belongs to that vendor before returning anything, so a vendor cannot probe another vendor's data via a crafted prompt.

### Files

```
packages/ai/src/agents/seller.ts                  — REWRITE: buildSellerTools(vendorId) + runSellerAgent(messages, { vendorId })
apps/vendor/app/api/assistant/route.ts            — CREATE: POST → auth → runSellerAgent → stream
packages/ui/src/components/LunaChatWidget.tsx     — MODIFY: add optional title + greeting props (backward-compatible)
apps/vendor/app/(dashboard)/layout.tsx            — MODIFY: mount <LunaChatWidget apiPath="/api/assistant" title greeting />
```

No schema changes. `packages/ui` already depends on `ai` (`useChat`); `packages/ai` already depends on `@e-luna/db`.

---

## Seller Agent — `packages/ai/src/agents/seller.ts`

Mirrors the Shopping agent's shape: a tool factory closing over context + a `run*` function taking `CoreMessage[]`.

```ts
import { streamText, tool } from "ai";
import type { CoreMessage } from "ai";
import { z } from "zod";
import { prisma } from "@e-luna/db";
import { anthropic, LUNA_MODEL, DEFAULT_SYSTEM_CONTEXT } from "../config";
```

### System prompt
```
${DEFAULT_SYSTEM_CONTEXT}

You are the Seller Agent for a Luna vendor. Help them manage and grow their boutique.
Use your tools to ground every answer in the vendor's real data — never invent numbers.
Be concise and data-driven; vendors are busy. When you recommend a Studio campaign,
use the studio_link tool to point them to the right place.
```

### `buildSellerTools(vendorId: string)`

Returns an object of four tools, all `.catch()`-guarded, Decimals `Number()`-converted. The `vendorId` is captured from the closure — NOT a tool parameter.

1. **`flag_low_stock`** — params `{ threshold: z.number().default(5) }`.
   ```ts
   const variants = await prisma.productVariant.findMany({
     where: { product: { vendorId }, stock: { lt: threshold } },
     select: { size: true, color: true, stock: true, product: { select: { title: true } } },
     orderBy: { stock: "asc" },
   }).catch(() => []);
   return { items: variants.map(v => ({ product: v.product.title, size: v.size, color: v.color, stock: v.stock })) };
   ```

2. **`suggest_price`** — params `{ productId: z.string() }`.
   ```ts
   const product = await prisma.product.findFirst({
     where: { id: productId, vendorId },
     select: { title: true, price: true, category: true },
   }).catch(() => null);
   if (!product) return { error: "Product not found in your store" };

   const peers = await prisma.product.findMany({
     where: { category: product.category, status: "ACTIVE" },
     select: { price: true },
   }).catch(() => []);
   const prices = peers.map(p => Number(p.price)).sort((a, b) => a - b);
   const median = prices.length === 0 ? null : prices[Math.floor(prices.length / 2)];
   const currentPrice = Number(product.price);
   return {
     product: product.title,
     currentPrice,
     category: product.category,
     benchmarkMedian: median,           // null if no peers
     suggestedPrice: median ?? currentPrice,
     sampleSize: prices.length,
   };
   ```
   (The LLM turns these numbers into a short recommendation.)

3. **`forecast_demand`** — params `{ productId: z.string() }`.
   ```ts
   const owns = await prisma.product.findFirst({ where: { id: productId, vendorId }, select: { title: true } }).catch(() => null);
   if (!owns) return { error: "Product not found in your store" };

   const now = Date.now(), DAY = 86_400_000;
   const cutoff = new Date(now - 30 * DAY);
   const prevCutoff = new Date(now - 60 * DAY);
   const items = await prisma.orderItem.findMany({
     where: {
       vendorId,
       variant: { productId },
       order: { status: { notIn: ["CANCELLED", "REFUNDED"] }, createdAt: { gte: prevCutoff } },
     },
     select: { quantity: true, order: { select: { createdAt: true } } },
   }).catch(() => []);

   let last30 = 0, prior30 = 0;
   for (const it of items) {
     if (it.order.createdAt >= cutoff) last30 += it.quantity;
     else prior30 += it.quantity;
   }
   const trend = last30 > prior30 * 1.1 ? "RISING" : last30 < prior30 * 0.9 ? "FALLING" : "STABLE";
   const ratio = prior30 === 0 ? 1 : last30 / prior30;
   const projectedNext30 = Math.round(last30 * (trend === "STABLE" ? 1 : ratio));
   return { product: owns.title, last30, prior30, trend, projectedNext30 };
   ```

4. **`studio_link`** — params `{ productId: z.string().optional() }`. Honest deep-link, no pipeline:
   ```ts
   return { url: "/studio/new", message: "Upload 3 photos of the product to generate a full marketing campaign in Luna Studio." };
   ```

### `runSellerAgent`
```ts
export async function runSellerAgent(
  messages: CoreMessage[],
  options: { vendorId: string }
) {
  return streamText({
    model: anthropic(LUNA_MODEL),
    system: SELLER_SYSTEM,
    messages,
    tools: buildSellerTools(options.vendorId),
    maxSteps: 5,
  });
}
```

The old static `sellerTools` export is removed; update `packages/ai/src/index.ts` to export `runSellerAgent` only (drop `sellerTools`). Any consumer of `sellerTools` — there are none in the apps — would break, but there are none.

---

## Vendor Chat Route — `apps/vendor/app/api/assistant/route.ts`

Mirrors the customer `/api/chat` handler.
```ts
import { safeCurrentUser } from "../../lib/auth";
import { getVendorByUserId } from "../../lib/vendor";
import { runSellerAgent } from "@e-luna/ai";
import type { CoreMessage } from "ai";

export async function POST(req: Request) {
  try {
    const { messages } = (await req.json()) as { messages: CoreMessage[] };

    const user = await safeCurrentUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

    const vendor = await getVendorByUserId(user.id);
    if (!vendor) return new Response(JSON.stringify({ error: "Vendor not found" }), { status: 403 });

    const result = await runSellerAgent(messages, { vendorId: vendor.id });
    return result.toDataStreamResponse();
  } catch (error) {
    console.error("[/api/assistant] error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}
```
Requires the vendor app to have `@e-luna/ai` as a dependency (it was added in Phase 5 — confirm; if missing, add `"@e-luna/ai": "workspace:*"` and `pnpm install`).

---

## Shared Widget — `packages/ui/src/components/LunaChatWidget.tsx`

Add two optional props, backward-compatible (customer usage unchanged):
```ts
type LunaChatWidgetProps = {
  apiPath: string;
  title?: string;     // header title; default "Luna"
  greeting?: string;  // first assistant bubble when the thread is empty; default the current customer greeting
};
```
- The header text uses `title ?? "Luna"`.
- The empty-state (no messages yet) renders `greeting` as an assistant bubble (using the existing `ChatMessage` with `role="assistant"`), defaulting to the current customer greeting string already in the component.
- Everything else unchanged. The `[PRODUCT:slug]` embed logic stays and is simply inert for Seller responses.

---

## Vendor Dashboard Mount — `apps/vendor/app/(dashboard)/layout.tsx`

Add the widget inside the dashboard shell (client component as a child of the RSC layout is fine), after `<main>`:
```tsx
import { LunaChatWidget } from "@e-luna/ui";
// ...
<LunaChatWidget
  apiPath="/api/assistant"
  title="Seller Assistant"
  greeting="Hi! I can check your stock, suggest pricing, and forecast demand. What would you like to look at?"
/>
```
It floats on every vendor dashboard page. (The widget's `usePathname` `/chat` hide-rule is a no-op in the vendor app.)

---

## Error Handling

- Route: 401 (no user), 403 (no vendor), 500 (unexpected) — never leaks internals.
- Tools: all Prisma reads `.catch()` to safe fallbacks (`[]` / `null`); ownership-guarded tools return `{ error: "Product not found in your store" }` for a product not owned by the vendor (the LLM relays this rather than fabricating).
- Decimals (`price`, `unitPrice`) `Number()`-converted; median/forecast guard empty sets (no divide-by-zero: `prior30 === 0 ? 1 : ...`, `prices.length === 0 ? null`).
- The `ANTHROPIC_API_KEY` requirement is already enforced by `packages/ai/config.ts` (throws at import if unset).

---

## Testing

No automated suite (consistent with the repo). Verification per task:
```bash
cd apps/vendor && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts"     # expect clean
cd packages/ai && npx tsc --noEmit 2>&1                                     # expect clean (only pre-existing, if any)
cd apps/vendor && npx next lint 2>&1 | tail -3                              # expect no errors
```
Final task runs the repo-wide `pnpm lint` + `pnpm --filter "@e-luna/*" exec tsc --noEmit` to keep all 3 CI steps green. Live agent behavior (actually chatting) needs a running app + `ANTHROPIC_API_KEY` — a manual smoke check, documented but not automated.

---

## Design Tokens / UX

Reuses the existing `LunaChatWidget` styling (Warm Oud: `bg-ink` header, `bg-ivory` panel, `border-sand`). Only the title/greeting copy differs for the vendor. No new visual design.
