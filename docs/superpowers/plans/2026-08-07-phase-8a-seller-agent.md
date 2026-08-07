# Phase 8a: Seller Agent + Vendor Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the stub Seller agent into a real, vendor-scoped assistant (3 Prisma-backed tools + an honest Studio deep-link) surfaced as a floating "Seller Assistant" chat on every vendor dashboard page, reusing the existing `LunaChatWidget`.

**Architecture:** A new vendor route `/api/assistant` resolves the authenticated `vendorId` server-side and calls `runSellerAgent(messages, { vendorId })`, streaming back through the reused `LunaChatWidget` (Vercel AI SDK `useChat` → `toDataStreamResponse()`, exactly like the customer Shopping agent). Tools are built by a `buildSellerTools(vendorId)` factory that closes over the authenticated vendor — `vendorId` is never an LLM parameter. No schema changes; persistence deferred.

**Tech Stack:** Vercel AI SDK (`streamText`, `tool`, `useChat`), Anthropic claude-sonnet-4-6, Prisma (`@e-luna/db`), Next.js 15 route handler, Zod.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/ai/src/agents/seller.ts` | Rewrite | `buildSellerTools(vendorId)` + `runSellerAgent(messages, { vendorId })` |
| `packages/ai/src/index.ts` | Modify | Export `runSellerAgent` only (drop `sellerTools`) |
| `packages/ui/src/components/LunaChatWidget.tsx` | Modify | Add optional `title` + `greeting` props |
| `apps/vendor/app/api/assistant/route.ts` | Create | POST → auth → `runSellerAgent` → stream |
| `apps/vendor/app/(dashboard)/layout.tsx` | Modify | Mount the widget |

---

## Shared Context

**Working dir:** `/Users/alialajme/Projects/Luna/e-luna`

**Confirmed facts:**
- `packages/ai` depends on `@e-luna/db`; `apps/vendor` already depends on `@e-luna/ai` (verified). `packages/ui` depends on `ai` (`useChat`).
- Nothing imports `sellerTools` (safe to drop).
- `getVendorByUserId(userId)` → `{ id, storeName, status, ... } | null` (`apps/vendor/app/lib/vendor.ts`).
- `safeCurrentUser()` → Clerk user or null (`apps/vendor/app/lib/auth.ts`).
- Shopping pattern: `runShoppingAgent(messages: CoreMessage[], options?)` → `streamText({...}).toDataStreamResponse()` in `apps/customer/app/api/chat/route.ts`.
- `LunaChatWidget` (`packages/ui`): client `useChat` widget; header text "Luna Stylist" (line ~63), empty-state greeting `<p>مرحباً! I'm Luna.</p>` + subline (lines ~76-82), signature `export function LunaChatWidget({ apiPath }: LunaChatWidgetProps)`.
- `OrderItem`: `vendorId, variantId, quantity` + relation `variant → product`. `ProductVariant`: `stock, size, color` + relation `product (vendorId, title, category, price, status)`.

**noUncheckedIndexedAccess is ON** — array index reads are `T | undefined`; use `?? ` where needed (e.g. `prices[Math.floor(prices.length/2)] ?? currentPrice`).

**Verification commands (per task):**
```bash
cd /Users/alialajme/Projects/Luna/e-luna/packages/ai && npx tsc --noEmit 2>&1
cd /Users/alialajme/Projects/Luna/e-luna/apps/vendor && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts" | grep -v "\.next/types" | grep -v "packages/auth/src/middleware"
cd /Users/alialajme/Projects/Luna/e-luna/apps/vendor && npx next lint 2>&1 | tail -5
```
packages/ai tsc: expect clean (the pre-existing `shopping.ts` `@prisma/client/runtime` note may appear — must not add NEW errors). vendor tsc: empty. lint: clean.

---

## Task 1: Rewrite the Seller agent with real tools

**Files:**
- Rewrite: `packages/ai/src/agents/seller.ts`
- Modify: `packages/ai/src/index.ts`

- [ ] **Step 1: Replace the full content of `packages/ai/src/agents/seller.ts`**

```ts
import { streamText, tool } from "ai";
import type { CoreMessage } from "ai";
import { z } from "zod";
import { prisma } from "@e-luna/db";
import { anthropic, LUNA_MODEL, DEFAULT_SYSTEM_CONTEXT } from "../config";

const SELLER_SYSTEM = `${DEFAULT_SYSTEM_CONTEXT}

You are the Seller Agent for a Luna vendor. Help them manage and grow their boutique.
Use your tools to ground every answer in the vendor's real data — never invent numbers.
Be concise and data-driven; vendors are busy. When you recommend creating marketing
imagery, use the studio_link tool to point them to Luna Studio.`;

// vendorId is captured from the authenticated session — NEVER an LLM parameter.
export function buildSellerTools(vendorId: string) {
  return {
    flag_low_stock: tool({
      description:
        "List the vendor's product variants whose stock is below a threshold (default 5).",
      parameters: z.object({
        threshold: z.number().default(5),
      }),
      execute: async ({ threshold }) => {
        const variants = await prisma.productVariant
          .findMany({
            where: { product: { vendorId }, stock: { lt: threshold } },
            select: {
              size: true,
              color: true,
              stock: true,
              product: { select: { title: true } },
            },
            orderBy: { stock: "asc" },
          })
          .catch(() => []);
        return {
          items: variants.map((v) => ({
            product: v.product.title,
            size: v.size,
            color: v.color,
            stock: v.stock,
          })),
        };
      },
    }),

    suggest_price: tool({
      description:
        "Benchmark one of the vendor's products against the median price of active products in the same category.",
      parameters: z.object({
        productId: z.string(),
      }),
      execute: async ({ productId }) => {
        const product = await prisma.product
          .findFirst({
            where: { id: productId, vendorId },
            select: { title: true, price: true, category: true },
          })
          .catch(() => null);
        if (!product) return { error: "Product not found in your store" };

        const peers = await prisma.product
          .findMany({
            where: { category: product.category, status: "ACTIVE" },
            select: { price: true },
          })
          .catch(() => []);
        const prices = peers.map((p) => Number(p.price)).sort((a, b) => a - b);
        const currentPrice = Number(product.price);
        const median =
          prices.length === 0
            ? null
            : (prices[Math.floor(prices.length / 2)] ?? null);
        return {
          product: product.title,
          category: product.category,
          currentPrice,
          benchmarkMedian: median,
          suggestedPrice: median ?? currentPrice,
          sampleSize: prices.length,
        };
      },
    }),

    forecast_demand: tool({
      description:
        "Forecast next-30-day unit demand for one of the vendor's products from its recent sales trend.",
      parameters: z.object({
        productId: z.string(),
      }),
      execute: async ({ productId }) => {
        const owns = await prisma.product
          .findFirst({ where: { id: productId, vendorId }, select: { title: true } })
          .catch(() => null);
        if (!owns) return { error: "Product not found in your store" };

        const DAY = 86_400_000;
        const now = Date.now();
        const cutoff = new Date(now - 30 * DAY);
        const prevCutoff = new Date(now - 60 * DAY);
        const items = await prisma.orderItem
          .findMany({
            where: {
              vendorId,
              variant: { productId },
              order: {
                status: { notIn: ["CANCELLED", "REFUNDED"] },
                createdAt: { gte: prevCutoff },
              },
            },
            select: { quantity: true, order: { select: { createdAt: true } } },
          })
          .catch(() => []);

        let last30 = 0;
        let prior30 = 0;
        for (const it of items) {
          if (it.order.createdAt >= cutoff) last30 += it.quantity;
          else prior30 += it.quantity;
        }
        const trend =
          last30 > prior30 * 1.1
            ? "RISING"
            : last30 < prior30 * 0.9
              ? "FALLING"
              : "STABLE";
        const ratio = prior30 === 0 ? 1 : last30 / prior30;
        const projectedNext30 = Math.round(
          last30 * (trend === "STABLE" ? 1 : ratio)
        );
        return { product: owns.title, last30, prior30, trend, projectedNext30 };
      },
    }),

    studio_link: tool({
      description:
        "Return a link to Luna Studio where the vendor can upload photos to generate a marketing campaign.",
      parameters: z.object({
        productId: z.string().optional(),
      }),
      execute: async () => {
        return {
          url: "/studio/new",
          message:
            "Upload 3 photos of the product to generate a full marketing campaign in Luna Studio.",
        };
      },
    }),
  };
}

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

- [ ] **Step 2: Update `packages/ai/src/index.ts`**

Read the file. Change the seller export line from:
```ts
export { runSellerAgent, sellerTools } from "./agents/seller";
```
to:
```ts
export { runSellerAgent, buildSellerTools } from "./agents/seller";
```

- [ ] **Step 3: TypeScript check (ai package)**

```bash
cd /Users/alialajme/Projects/Luna/e-luna/packages/ai && npx tsc --noEmit 2>&1
```
Expected: no NEW errors introduced by seller.ts/index.ts. (A pre-existing `shopping.ts` error about `@prisma/client/runtime/library` types may already be present in this package from before — if it appears, confirm it references `shopping.ts` not `seller.ts`. `seller.ts` must contribute zero errors.)

- [ ] **Step 4: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git add packages/ai/src/agents/seller.ts packages/ai/src/index.ts && git commit -m "feat(ai): real Seller agent tools (low stock, price benchmark, demand forecast, studio link)"
```

---

## Task 2: Add title + greeting props to LunaChatWidget

**Files:**
- Modify: `packages/ui/src/components/LunaChatWidget.tsx`

- [ ] **Step 1: Extend the props type**

Read the file. The current props type (near line 21) is:
```ts
type LunaChatWidgetProps = {
  apiPath: string; // e.g. "/api/chat" — route handler in customer app
};
```
Replace it with:
```ts
type LunaChatWidgetProps = {
  apiPath: string; // e.g. "/api/chat" — route handler in the app
  title?: string; // header title; default "Luna Stylist"
  greeting?: string; // empty-state assistant greeting; default the customer copy
};
```

- [ ] **Step 2: Destructure the new props**

Change the component signature from:
```ts
export function LunaChatWidget({ apiPath }: LunaChatWidgetProps) {
```
to:
```ts
export function LunaChatWidget({ apiPath, title, greeting }: LunaChatWidgetProps) {
```

- [ ] **Step 3: Use `title` in the header**

Change the header span (near line 63) from:
```tsx
              <span className="font-sans text-body-md font-semibold text-ivory">Luna Stylist</span>
```
to:
```tsx
              <span className="font-sans text-body-md font-semibold text-ivory">{title ?? "Luna Stylist"}</span>
```

- [ ] **Step 4: Use `greeting` in the empty state**

Change the empty-state block (near lines 76-82) from:
```tsx
            {messages.length === 0 && (
              <div className="text-center text-body-sm text-mist pt-8">
                <p className="text-gold text-2xl mb-2">◑</p>
                <p>مرحباً! I'm Luna.</p>
                <p className="mt-1">Tell me your occasion and I'll find your perfect abaya.</p>
              </div>
            )}
```
to:
```tsx
            {messages.length === 0 && (
              <div className="text-center text-body-sm text-mist pt-8">
                <p className="text-gold text-2xl mb-2">◑</p>
                {greeting ? (
                  <p>{greeting}</p>
                ) : (
                  <>
                    <p>مرحباً! I'm Luna.</p>
                    <p className="mt-1">Tell me your occasion and I'll find your perfect abaya.</p>
                  </>
                )}
              </div>
            )}
```

- [ ] **Step 5: TypeScript check (ui package)**

```bash
cd /Users/alialajme/Projects/Luna/e-luna/packages/ui && npx tsc --noEmit 2>&1
```
Expected: clean (no new errors).

- [ ] **Step 6: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git add packages/ui/src/components/LunaChatWidget.tsx && git commit -m "feat(ui): optional title + greeting props on LunaChatWidget (backward-compatible)"
```

---

## Task 3: Vendor assistant route

**Files:**
- Create: `apps/vendor/app/api/assistant/route.ts`

- [ ] **Step 1: Create the route**

```ts
import { safeCurrentUser } from "../../lib/auth";
import { getVendorByUserId } from "../../lib/vendor";
import { runSellerAgent } from "@e-luna/ai";
import type { CoreMessage } from "ai";

export async function POST(req: Request) {
  try {
    const { messages } = (await req.json()) as { messages: CoreMessage[] };

    const user = await safeCurrentUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const vendor = await getVendorByUserId(user.id);
    if (!vendor) {
      return new Response(JSON.stringify({ error: "Vendor not found" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const result = await runSellerAgent(messages, { vendorId: vendor.id });
    return result.toDataStreamResponse();
  } catch (error) {
    console.error("[/api/assistant] error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
```

- [ ] **Step 2: TypeScript + lint check**

```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/vendor && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts" | grep -v "\.next/types" | grep -v "packages/auth/src/middleware"
cd /Users/alialajme/Projects/Luna/e-luna/apps/vendor && npx next lint 2>&1 | tail -5
```
Expected: tsc empty; lint clean.

- [ ] **Step 3: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git add "apps/vendor/app/api/assistant/route.ts" && git commit -m "feat(vendor): /api/assistant route streaming the Seller agent"
```

---

## Task 4: Mount the widget in the vendor dashboard

**Files:**
- Modify: `apps/vendor/app/(dashboard)/layout.tsx`

- [ ] **Step 1: Import the widget**

Read the file. Add the import alongside the existing imports at the top:
```ts
import { LunaChatWidget } from "@e-luna/ui";
```

- [ ] **Step 2: Mount the widget in the returned JSX**

The layout currently returns:
```tsx
  return (
    <div className="flex min-h-screen bg-ivory">
      <Sidebar storeName={vendor.storeName} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar storeName={vendor.storeName} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
```
Change it to (add the widget as the last child inside the outer div):
```tsx
  return (
    <div className="flex min-h-screen bg-ivory">
      <Sidebar storeName={vendor.storeName} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar storeName={vendor.storeName} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
      <LunaChatWidget
        apiPath="/api/assistant"
        title="Seller Assistant"
        greeting="Hi! I can check your stock, suggest pricing, and forecast demand. What would you like to look at?"
      />
    </div>
  );
```

- [ ] **Step 3: TypeScript + lint check**

```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/vendor && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts" | grep -v "\.next/types" | grep -v "packages/auth/src/middleware"
cd /Users/alialajme/Projects/Luna/e-luna/apps/vendor && npx next lint 2>&1 | tail -5
```
Expected: tsc empty; lint clean.

- [ ] **Step 4: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git add "apps/vendor/app/(dashboard)/layout.tsx" && git commit -m "feat(vendor): mount Seller Assistant chat widget on the dashboard"
```

---

## Task 5: Final verification

**Files:** None (verification only)

- [ ] **Step 1: Full repo typecheck (exact CI command)**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && pnpm --filter "@e-luna/*" exec tsc --noEmit; echo "EXIT: $?"
```
Expected: `EXIT: 0`.

- [ ] **Step 2: Full repo lint (exact CI command)**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && pnpm lint 2>&1 | tail -6
```
Expected: `Tasks: 3 successful, 3 total`, all apps clean.

- [ ] **Step 3: Confirm files + git log**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && ls "apps/vendor/app/api/assistant/route.ts" && grep -q "buildSellerTools" packages/ai/src/agents/seller.ts && grep -q "runSellerAgent" apps/vendor/app/api/assistant/route.ts && grep -q "Seller Assistant" "apps/vendor/app/(dashboard)/layout.tsx" && git log --oneline -5
```
Expected: route file present; both greps match; git log shows (newest first):
- feat(vendor): mount Seller Assistant chat widget on the dashboard
- feat(vendor): /api/assistant route streaming the Seller agent
- feat(ui): optional title + greeting props on LunaChatWidget (backward-compatible)
- feat(ai): real Seller agent tools (low stock, price benchmark, demand forecast, studio link)

Report the actual SHAs. Note: live agent chat needs a running vendor app + `ANTHROPIC_API_KEY` — a manual smoke check, not automated here.
