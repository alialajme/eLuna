# Supplier AI Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an advisory, read-only Supplier AI assistant to the supplier dashboard, grounded in the supplier's real materials catalog (S2) and material orders (S3), following the existing Seller-agent pattern + 8e persistence with a new `SUPPLIER` agent type.

**Architecture:** A new `packages/ai/src/agents/supplier.ts` (`buildSupplierTools(supplierId)` + `runSupplierAgent`) exactly mirroring the Seller agent; `"SUPPLIER"` added to the `AGENT_TYPES` allowlist; the supplier app gains `@e-luna/ai` as a dependency, `/api/assistant` + `/api/ai-history` routes, and a `LunaChatWidget` mount. Read-only — the agent never mutates data.

**Tech Stack:** Vercel AI SDK (`streamText`, `tool`, `CoreMessage`, `toDataStreamResponse`), Anthropic `claude-sonnet-4-6` (`LUNA_MODEL`), Zod, Prisma, Next.js 15, Clerk, Turborepo + pnpm@9.

**Spec:** `docs/superpowers/specs/2026-08-11-supplier-ai-agent-design.md`

---

## Repo Conventions (read before starting)

- **No automated test suite.** Each task's "test" step = `tsc --noEmit` + `next lint` on the touched
  package/app. That is the quality gate.
- The agent pattern (see `packages/ai/src/agents/seller.ts`): `build<Name>Tools(scopeId)` returns tools
  with `scopeId` **closure-captured, never a tool parameter**; `run<Name>Agent(messages, { scopeId, onFinish })`
  calls `streamText`. Routes resolve the scope id from the Clerk session.
- `@e-luna/ai` exports raw `.ts` from `src/index.ts`; consumers compile that source. `packages/ai/config.ts`
  throws at **import time** if `ANTHROPIC_API_KEY` is unset — this is a **runtime** throw (per request),
  NOT a type-check/lint failure, and NOT a `next build` failure. Do **not** run `next build`/`next dev`
  in verification (the other apps already depend on `@e-luna/ai` the same way).
- `noUncheckedIndexedAccess` is ON — array index access is `T | undefined`; guard it.
- Prisma reads `.catch(() => fallback)`. Money is `Decimal` → convert with `Number(...)`.

---

## File Structure

- **`packages/ai/src/agents/supplier.ts`** (create) — the agent: `buildSupplierTools` (4 tools) + `runSupplierAgent`.
- **`packages/ai/src/session.ts`** (modify) — add `"SUPPLIER"` to `AGENT_TYPES`.
- **`packages/ai/src/index.ts`** (modify) — export the new agent.
- **`apps/supplier/package.json`** (modify) — add `@e-luna/ai` dependency.
- **`apps/supplier/next.config.ts`** (modify) — add `@e-luna/ai` to `transpilePackages`.
- **`apps/supplier/app/api/assistant/route.ts`** (create) — chat POST endpoint.
- **`apps/supplier/app/api/ai-history/route.ts`** (create) — history GET endpoint.
- **`apps/supplier/app/(dashboard)/layout.tsx`** (modify) — mount `LunaChatWidget`.
- **`.env.example`** (modify) — add `ANTHROPIC_API_KEY`.

---

### Task 1: The Supplier agent (`packages/ai`)

**Files:**
- Create: `packages/ai/src/agents/supplier.ts`
- Modify: `packages/ai/src/session.ts`
- Modify: `packages/ai/src/index.ts`

- [ ] **Step 1: Create `packages/ai/src/agents/supplier.ts`**

```ts
import { streamText, tool } from "ai";
import type { CoreMessage } from "ai";
import { z } from "zod";
import { prisma } from "@e-luna/db";
import { anthropic, LUNA_MODEL, DEFAULT_SYSTEM_CONTEXT } from "../config";

const SUPPLIER_SYSTEM = `${DEFAULT_SYSTEM_CONTEXT}

You are the Supplier Agent for a Luna materials supplier. Help them manage their materials
catalog and fulfil vendor orders. Use your tools to ground every answer in the supplier's real
data — never invent numbers. Be concise and data-driven. You are advisory only: to accept, ship,
or complete an order, direct the supplier to the Incoming Orders page (/orders).`;

// supplierId is captured from the authenticated session — NEVER an LLM parameter.
export function buildSupplierTools(supplierId: string) {
  return {
    flag_low_material_stock: tool({
      description:
        "List the supplier's ACTIVE materials whose stock is below a threshold (default 5).",
      parameters: z.object({ threshold: z.number().default(5) }),
      execute: async ({ threshold }) => {
        const materials = await prisma.material
          .findMany({
            where: { supplierId, status: "ACTIVE", stock: { lt: threshold } },
            select: { name: true, materialType: true, color: true, stock: true, unit: true },
            orderBy: { stock: "asc" },
          })
          .catch(() => []);
        return {
          items: materials.map((m) => ({
            name: m.name,
            materialType: m.materialType,
            color: m.color,
            stock: m.stock,
            unit: m.unit,
          })),
        };
      },
    }),

    pending_orders: tool({
      description:
        "List incoming material orders that are PENDING and awaiting the supplier's response.",
      parameters: z.object({}),
      execute: async () => {
        const orders = await prisma.materialOrder
          .findMany({
            where: { supplierId, status: "PENDING" },
            include: { items: true, vendor: { select: { storeName: true } } },
            orderBy: { createdAt: "asc" },
          })
          .catch(() => []);
        const DAY = 86_400_000;
        return {
          count: orders.length,
          orders: orders.map((o) => {
            const first = o.items[0];
            return {
              id: o.id,
              buyer: o.vendor.storeName,
              summary: first ? `${first.quantity} × ${first.materialName}` : "Order",
              total: Number(o.total),
              ageDays: Math.floor((Date.now() - o.createdAt.getTime()) / DAY),
            };
          }),
        };
      },
    }),

    material_sales: tool({
      description:
        "Summarise realized material sales (accepted/shipped/completed orders) over the last N days (default 30).",
      parameters: z.object({ days: z.number().default(30) }),
      execute: async ({ days }) => {
        const cutoff = new Date(Date.now() - days * 86_400_000);
        const orders = await prisma.materialOrder
          .findMany({
            where: {
              supplierId,
              status: { in: ["ACCEPTED", "SHIPPED", "COMPLETED"] },
              createdAt: { gte: cutoff },
            },
            include: { items: true },
          })
          .catch(() => []);
        let unitsSold = 0;
        let revenue = 0;
        const byMaterial: Record<string, number> = {};
        for (const o of orders) {
          for (const it of o.items) {
            const line = Number(it.unitPrice) * it.quantity;
            unitsSold += it.quantity;
            revenue += line;
            byMaterial[it.materialName] = (byMaterial[it.materialName] ?? 0) + line;
          }
        }
        const topMaterials = Object.entries(byMaterial)
          .map(([name, rev]) => ({ name, revenue: rev }))
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 5);
        return { days, orderCount: orders.length, unitsSold, revenue, topMaterials };
      },
    }),

    benchmark_material_price: tool({
      description:
        "Benchmark one of the supplier's materials against the median wholesale price of active materials of the same type across Luna.",
      parameters: z.object({ materialId: z.string() }),
      execute: async ({ materialId }) => {
        const material = await prisma.material
          .findFirst({
            where: { id: materialId, supplierId },
            select: { name: true, wholesalePrice: true, materialType: true },
          })
          .catch(() => null);
        if (!material) return { error: "Material not found in your catalog" };

        const peers = await prisma.material
          .findMany({
            where: { materialType: material.materialType, status: "ACTIVE" },
            select: { wholesalePrice: true },
          })
          .catch(() => []);
        const prices = peers.map((p) => Number(p.wholesalePrice)).sort((a, b) => a - b);
        const currentPrice = Number(material.wholesalePrice);
        const median =
          prices.length === 0 ? null : (prices[Math.floor(prices.length / 2)] ?? null);
        return {
          material: material.name,
          materialType: material.materialType,
          currentPrice,
          benchmarkMedian: median,
          suggestedPrice: median ?? currentPrice,
          sampleSize: prices.length,
        };
      },
    }),
  };
}

export async function runSupplierAgent(
  messages: CoreMessage[],
  options: { supplierId: string; onFinish?: (event: { text: string }) => void | Promise<void> }
) {
  return streamText({
    model: anthropic(LUNA_MODEL),
    system: SUPPLIER_SYSTEM,
    messages,
    tools: buildSupplierTools(options.supplierId),
    maxSteps: 5,
    onFinish: options.onFinish,
  });
}
```

- [ ] **Step 2: Add `"SUPPLIER"` to `AGENT_TYPES` in `packages/ai/src/session.ts`**

Find (line ~5):
```ts
const AGENT_TYPES = ["SHOPPING", "SELLER", "STUDIO", "LOGISTICS", "PAYMENT", "POS"] as const;
```
Replace with:
```ts
const AGENT_TYPES = ["SHOPPING", "SELLER", "STUDIO", "LOGISTICS", "PAYMENT", "POS", "SUPPLIER"] as const;
```

- [ ] **Step 3: Export the agent from `packages/ai/src/index.ts`**

Add after the existing `runSellerAgent` export line:
```ts
export { runSupplierAgent, buildSupplierTools } from "./agents/supplier";
```

- [ ] **Step 4: Type-check the ai package**

Run:
```bash
pnpm --filter @e-luna/ai exec tsc --noEmit
```
Expected: no errors. Notes: `o.items[0]` is guarded with `first ? ... : "Order"` (satisfies
`noUncheckedIndexedAccess`); `prices[...]` is guarded with `?? null`; the status string arrays are
assignable to the `MaterialOrderStatus` filter (same pattern as `seller.ts` uses `notIn: [...]`).

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/agents/supplier.ts packages/ai/src/session.ts packages/ai/src/index.ts
git commit -m "feat(ai): add Supplier agent (advisory, read-only) + SUPPLIER agent type"
```

---

### Task 2: Wire `@e-luna/ai` into the supplier app

**Files:**
- Modify: `apps/supplier/package.json`
- Modify: `apps/supplier/next.config.ts`

- [ ] **Step 1: Add the dependency in `apps/supplier/package.json`**

In the `dependencies` block, add `"@e-luna/ai": "workspace:*"` alongside the other `@e-luna/*` deps and
add `"ai": "^4.3.19"` (the Vercel AI SDK, used transitively by the route's `CoreMessage` type — matches
the vendor app's version). The `dependencies` block becomes:
```json
  "dependencies": {
    "@clerk/nextjs": "^5.0.0",
    "@e-luna/ui": "workspace:*",
    "@e-luna/auth": "workspace:*",
    "@e-luna/db": "workspace:*",
    "@e-luna/ai": "workspace:*",
    "ai": "^4.3.19",
    "next": "15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
```

- [ ] **Step 2: Add `@e-luna/ai` to `transpilePackages` in `apps/supplier/next.config.ts`**

Replace:
```ts
  transpilePackages: ["@e-luna/ui", "@e-luna/auth", "@e-luna/db"],
```
with:
```ts
  transpilePackages: ["@e-luna/ui", "@e-luna/auth", "@e-luna/db", "@e-luna/ai"],
```

- [ ] **Step 3: Install to link the new workspace dep**

Run:
```bash
cd /Users/alialajme/Projects/Luna/e-luna && pnpm install
```
Expected: install completes; `apps/supplier/node_modules/@e-luna/ai` symlink now exists.

- [ ] **Step 4: Commit**

```bash
git add apps/supplier/package.json apps/supplier/next.config.ts pnpm-lock.yaml
git commit -m "feat(supplier): depend on @e-luna/ai for the Supplier agent"
```

---

### Task 3: Chat + history API routes

**Files:**
- Create: `apps/supplier/app/api/assistant/route.ts`
- Create: `apps/supplier/app/api/ai-history/route.ts`

- [ ] **Step 1: Create `apps/supplier/app/api/assistant/route.ts`**

```ts
import { safeCurrentUser } from "../../lib/auth";
import { getSupplierByUserId } from "../../lib/supplier";
import { runSupplierAgent, persistOnFinish } from "@e-luna/ai";
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

    const supplier = await getSupplierByUserId(user.id);
    if (!supplier) {
      return new Response(JSON.stringify({ error: "Supplier not found" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const result = await runSupplierAgent(messages, {
      supplierId: supplier.id,
      onFinish: persistOnFinish(user.id, "SUPPLIER", messages),
    });
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

- [ ] **Step 2: Create `apps/supplier/app/api/ai-history/route.ts`**

```ts
import { safeCurrentUser as currentUser } from "../../lib/auth";
import { loadAgentMessages, isAgentType } from "@e-luna/ai";

export async function GET(req: Request) {
  const agentType = new URL(req.url).searchParams.get("agentType") ?? "";
  if (!isAgentType(agentType)) return Response.json({ messages: [] });

  const user = await currentUser();
  if (!user) return Response.json({ messages: [] });

  const messages = await loadAgentMessages(user.id, agentType);
  return Response.json({ messages });
}
```

- [ ] **Step 3: Type-check**

Run:
```bash
pnpm --filter @e-luna/supplier exec tsc --noEmit
```
Expected: no errors. (`runSupplierAgent`, `persistOnFinish`, `loadAgentMessages`, `isAgentType` are all
exported from `@e-luna/ai`; `getSupplierByUserId` returns `{ id, ... }`.)

- [ ] **Step 4: Commit**

```bash
git add apps/supplier/app/api/assistant/route.ts apps/supplier/app/api/ai-history/route.ts
git commit -m "feat(supplier): add assistant + ai-history API routes"
```

---

### Task 4: Mount the chat widget

**Files:**
- Modify: `apps/supplier/app/(dashboard)/layout.tsx`

- [ ] **Step 1: Import `LunaChatWidget`**

At the top of `apps/supplier/app/(dashboard)/layout.tsx`, add this import after the `Sidebar` import:
```tsx
import { LunaChatWidget } from "@e-luna/ui";
```

- [ ] **Step 2: Mount the widget inside the dashboard container**

In the returned JSX, the outer container is `<div className="flex min-h-screen bg-ivory">…</div>`.
Add the widget as the last child, just before that div's closing `</div>`. The end of the return becomes:
```tsx
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-sand bg-ivory px-6 py-4">
          <p className="font-display text-display-sm text-ink">{supplier.companyName}</p>
          <span className="text-body-sm text-mist">Supplier OS</span>
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
      <LunaChatWidget
        apiPath="/api/assistant"
        title="Supplier Assistant"
        greeting="Hi! I can flag low material stock, surface orders needing a response, summarise sales, and benchmark your pricing. What would you like to look at?"
        agentType="SUPPLIER"
      />
    </div>
  );
}
```

- [ ] **Step 3: Type-check + lint**

Run:
```bash
pnpm --filter @e-luna/supplier exec tsc --noEmit && pnpm --filter @e-luna/supplier lint
```
Expected: no type errors; lint clean. (`LunaChatWidget` accepts `apiPath`, `title`, `greeting`,
`agentType` — the same props the vendor dashboard passes.)

- [ ] **Step 4: Commit**

```bash
git add "apps/supplier/app/(dashboard)/layout.tsx"
git commit -m "feat(supplier): mount Supplier Assistant chat widget"
```

---

### Task 5: Document the `ANTHROPIC_API_KEY` env var

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Add `ANTHROPIC_API_KEY` to `.env.example`**

`ANTHROPIC_API_KEY` is not currently in `.env.example` even though the customer/vendor apps already need
it (and now the supplier app does too). Add a block. After the `# Cloudinary` block (or anywhere sensible
among the existing groups), insert:
```bash
# Anthropic (Claude) — required by every app that mounts an AI agent
# (customer, vendor, and supplier). packages/ai throws at import if unset.
ANTHROPIC_API_KEY=sk-ant-...
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs(env): add ANTHROPIC_API_KEY (required by all AI-agent apps incl. supplier)"
```

---

### Task 6: Full-workspace verification

- [ ] **Step 1: Full type-check**

Run:
```bash
pnpm --filter @e-luna/db db:generate && pnpm --filter "@e-luna/*" exec tsc --noEmit
```
Expected: no type errors across all packages/apps (including `@e-luna/ai` and `@e-luna/supplier`).

- [ ] **Step 2: Full lint**

Run:
```bash
pnpm lint
```
Expected: all apps lint clean (pre-existing `<img>` warnings in the customer app are acceptable).

- [ ] **Step 3: Commit any generated drift (only if present)**

```bash
git add -A && git commit -m "chore: sync generated artifacts for supplier agent" || echo "nothing to commit"
```

---

## Self-Review

**Spec coverage:**
- `buildSupplierTools(supplierId)` + `runSupplierAgent` mirroring the Seller agent → Task 1. ✅
- 4 read-only tools (`flag_low_material_stock`, `pending_orders`, `material_sales`,
  `benchmark_material_price`), all supplierId-scoped, ownership-checked benchmark → Task 1. ✅
- `"SUPPLIER"` in `AGENT_TYPES`; export from index → Task 1. ✅
- `@e-luna/ai` dependency + transpile → Task 2. ✅
- `/api/assistant` (401/403/500, `persistOnFinish(…, "SUPPLIER", …)`) + `/api/ai-history` → Task 3. ✅
- `LunaChatWidget` mount (agentType `SUPPLIER`) → Task 4. ✅
- `ANTHROPIC_API_KEY` in `.env.example` → Task 5. ✅
- Verification (tsc + lint) → each task + Task 6. ✅
- Non-goals (no mutations, no schema, no orchestration) → correctly absent. ✅

**Placeholder scan:** No TBD/TODO; every code step has full contents or an exact anchored edit.

**Type consistency:** `runSupplierAgent(messages, { supplierId, onFinish })` (Task 1) called by the route
(Task 3) with `supplierId: supplier.id` + `onFinish: persistOnFinish(user.id, "SUPPLIER", messages)`.
`buildSupplierTools`/`runSupplierAgent` exported (Task 1) and imported (Task 3). `"SUPPLIER"` added to
`AGENT_TYPES` (Task 1) is what makes `isAgentType("SUPPLIER")` true (Task 3 history route) and
`persistOnFinish(..., "SUPPLIER", ...)` valid (Task 3 assistant route). `LunaChatWidget` props
(`apiPath`/`title`/`greeting`/`agentType`, Task 4) match the vendor mount. `prisma.material` /
`prisma.materialOrder` used in Task 1 exist (S2/S3 schema).

**Scope:** one cohesive feature (one agent + its wiring); single plan is appropriate.
