# Supplier AI Agent Design

**Status:** Approved (brainstorming) — 2026-08-11

## Goal

Add an **advisory, read-only** AI assistant to the supplier dashboard (`supply.luna.ae`) that grounds
every answer in the supplier's own real data — their materials catalog (S2) and incoming material
orders (S3). It follows the existing Seller/Payment/Logistics agent pattern exactly and reuses the 8e
conversation-persistence layer with a new `SUPPLIER` agent type.

**Success criteria:** a signed-in supplier opens the chat widget in their dashboard and can ask about
low material stock, orders needing a response, recent material sales, and wholesale pricing — and every
answer is computed from the supplier's own rows (never invented). The agent never mutates data
(accepting/shipping orders stays a deterministic dashboard action). Conversation history persists across
sessions (8e). With no `ANTHROPIC_API_KEY`, the app builds and the widget renders but cannot stream a
reply (identical to the vendor/customer apps today).

## Context & Rationale

- The AI Agent Mesh already ships four live agents (Shopping, Seller, Payment, Logistics) plus Studio,
  all built on one template: `packages/ai/src/agents/<name>.ts` exposes `build<Name>Tools(scopeId)`
  (scope id **closure-captured, never an LLM parameter**) and `run<Name>Agent(messages, { scopeId,
  onFinish })` via `streamText`. Routes resolve the scope id from the Clerk session; `LunaChatWidget`
  (from `@e-luna/ui`) mounts in the dashboard with an `agentType`.
- 8e added `AISession` persistence keyed on `@@unique([userId, agentType])`, with
  `loadAgentMessages`/`persistOnFinish`/`isAgentType` and an `AGENT_TYPES` allowlist in
  `packages/ai/src/session.ts`.
- The Supplier persona (S1–S3) now has real, queryable data (materials + material orders), so a
  Supplier agent can be genuinely grounded — consistent with the project's rule (see the 8d POS
  deferral) that every agent must be backed by real data, never stubs.

## Non-Goals (deferred / out of scope)

- **No mutations.** The agent does not accept/reject/ship/complete orders or edit materials — those stay
  deterministic dashboard actions. (Same advisory posture as the Payment 8b and Logistics 8c agents.)
- No cross-supplier data, no vendor/customer PII beyond the buyer's public store name.
- No orchestration/handoff between agents (per the 8e decision — per-surface widgets already place the
  right agent).
- No new persisted schema — reuses the existing `AISession` model.

## Architecture

Clone the Seller-agent shape:

1. **`packages/ai/src/agents/supplier.ts`** (new) —
   - `buildSupplierTools(supplierId: string)` returns the four tools below; `supplierId` is captured in
     the closure and is **never** a tool parameter.
   - `runSupplierAgent(messages: CoreMessage[], options: { supplierId: string; onFinish?: (event: { text: string }) => void | Promise<void> })`
     calls `streamText({ model: anthropic(LUNA_MODEL), system: SUPPLIER_SYSTEM, messages, tools:
     buildSupplierTools(options.supplierId), maxSteps: 5, onFinish: options.onFinish })`.
   - `SUPPLIER_SYSTEM` = `${DEFAULT_SYSTEM_CONTEXT}` + a supplier-specific prompt: "You are the Supplier
     Agent for a Luna materials supplier. Ground every answer in the supplier's real data via your
     tools — never invent numbers. Be concise and data-driven. You are advisory only: to accept, ship,
     or complete an order, direct the supplier to the Incoming Orders page."

2. **`packages/ai/src/session.ts`** (modify) — add `"SUPPLIER"` to the `AGENT_TYPES` tuple
   (currently `["SHOPPING", "SELLER", "STUDIO", "LOGISTICS", "PAYMENT", "POS"]`). This is the only change
   needed for `isAgentType`, `loadAgentMessages`, and `persistOnFinish` to accept the new type.

3. **`packages/ai/src/index.ts`** (modify) — add
   `export { runSupplierAgent, buildSupplierTools } from "./agents/supplier";`.

4. **`apps/supplier/package.json`** (modify) — add `"@e-luna/ai": "workspace:*"` to dependencies, and
   add `"@e-luna/ai"` to `transpilePackages` in `apps/supplier/next.config.ts`. (Consequence:
   `packages/ai/config.ts` throws at import if `ANTHROPIC_API_KEY` is unset — so the supplier app now
   needs that env var at runtime to stream replies, exactly like the vendor/customer apps. Add
   `ANTHROPIC_API_KEY` to the supplier's env expectations; no code change beyond the dependency.)

5. **`apps/supplier/app/api/assistant/route.ts`** (new) — POST handler mirroring the vendor route:
   parse `{ messages }`; `safeCurrentUser()` → 401 if none; `getSupplierByUserId(user.id)` → 403 if none;
   `runSupplierAgent(messages, { supplierId: supplier.id, onFinish: persistOnFinish(user.id, "SUPPLIER", messages) })`;
   return `result.toDataStreamResponse()`; 500 on thrown error.

6. **`apps/supplier/app/api/ai-history/route.ts`** (new) — GET handler mirroring the vendor route:
   read `agentType` from the query; `isAgentType` guard → `{ messages: [] }` if invalid; resolve user →
   `{ messages: [] }` if none; return `{ messages: await loadAgentMessages(user.id, agentType) }`.

7. **`apps/supplier/app/(dashboard)/layout.tsx`** (modify) — mount the widget before the closing
   container tag:
   ```tsx
   <LunaChatWidget
     apiPath="/api/assistant"
     title="Supplier Assistant"
     greeting="Hi! I can flag low material stock, surface orders needing a response, summarise sales, and benchmark your pricing. What would you like to look at?"
     agentType="SUPPLIER"
   />
   ```
   Import `LunaChatWidget` from `@e-luna/ui`.

## Tools (all `supplierId`-scoped, read-only)

All tools query only rows belonging to the closure-captured `supplierId`. All DB reads are
`.catch`-guarded and return plain JSON.

1. **`flag_low_material_stock`** — `parameters: { threshold: z.number().default(5) }`.
   Returns the supplier's `ACTIVE` materials with `stock < threshold`:
   `prisma.material.findMany({ where: { supplierId, status: "ACTIVE", stock: { lt: threshold } }, select: { name, materialType, color, stock, unit }, orderBy: { stock: "asc" } })`.
   Returns `{ items: [{ name, materialType, color, stock, unit }] }`.

2. **`pending_orders`** — `parameters: z.object({})`.
   Returns incoming `PENDING` `MaterialOrder`s awaiting the supplier's response:
   `prisma.materialOrder.findMany({ where: { supplierId, status: "PENDING" }, include: { items: true, vendor: { select: { storeName: true } } }, orderBy: { createdAt: "asc" } })`.
   Returns `{ count, orders: [{ id, buyer: vendor.storeName, summary: "<qty> × <materialName>", total: Number(total), ageDays }] }`
   where `ageDays = Math.floor((Date.now() - createdAt) / 86_400_000)`.

3. **`material_sales`** — `parameters: { days: z.number().default(30) }`.
   Aggregates realized sales (orders the supplier accepted or beyond) in the window:
   `prisma.materialOrder.findMany({ where: { supplierId, status: { in: ["ACCEPTED", "SHIPPED", "COMPLETED"] }, createdAt: { gte: cutoff } }, include: { items: true } })`.
   Returns `{ days, orderCount, unitsSold, revenue, topMaterials: [{ name, revenue }] top 5 }` — `revenue`
   summed from `Number(item.unitPrice) * item.quantity`, `unitsSold` from `item.quantity`, `topMaterials`
   grouped by `materialName`.

4. **`benchmark_material_price`** — `parameters: { materialId: z.string() }`.
   Ownership-check first: `prisma.material.findFirst({ where: { id: materialId, supplierId }, select: { name, wholesalePrice, materialType } })` → `{ error: "Material not found in your catalog" }` if absent.
   Then benchmark against peers of the same type across suppliers:
   `prisma.material.findMany({ where: { materialType: <type>, status: "ACTIVE" }, select: { wholesalePrice: true } })`;
   compute the sorted median. Returns
   `{ material, materialType, currentPrice, benchmarkMedian, suggestedPrice: benchmarkMedian ?? currentPrice, sampleSize }`
   with all prices as `Number(...)`.

## Data Flow

1. Supplier opens the dashboard → `LunaChatWidget` (agentType `SUPPLIER`) mounts, GETs
   `/api/ai-history?agentType=SUPPLIER`, seeds prior messages.
2. Supplier sends a message → POST `/api/assistant` → route resolves supplier → `runSupplierAgent`
   streams a reply, calling tools that read the supplier's data; `onFinish` upserts the rolling session
   (8e, last 50 messages).

## Error Handling

- Route: 401 (no user) / 403 (not a supplier) / 500 (thrown) — plain JSON, mirroring the vendor route.
- `ai-history`: returns `{ messages: [] }` for an invalid `agentType` or no user (never throws).
- Tools: every Prisma read `.catch(() => fallback)`; `benchmark_material_price` returns a friendly
  `{ error }` when the material is not the supplier's.
- No `ANTHROPIC_API_KEY`: `packages/ai/config.ts` throws at import; the app still builds, and the widget
  renders, but a POST to `/api/assistant` will 500 until the key is set (operator step, documented).

## Testing

No automated suite — verification is types + lint + manual:
1. `pnpm install` (new `@e-luna/ai` dependency link).
2. `pnpm --filter "@e-luna/*" exec tsc --noEmit` — clean (including `@e-luna/supplier`, `@e-luna/ai`).
3. `pnpm lint` — clean.
4. gitleaks — clean.
5. Manual (with `ANTHROPIC_API_KEY` set): as an ACTIVE supplier, open the widget; ask "what's low on
   stock?", "which orders need my response?", "how have sales been this month?", "is <material> priced
   right?" — confirm each answer reflects the supplier's own rows; confirm history persists on reload;
   confirm a non-supplier gets 403.

## File Summary

- Create: `packages/ai/src/agents/supplier.ts`
- Modify: `packages/ai/src/session.ts` (add `"SUPPLIER"` to `AGENT_TYPES`)
- Modify: `packages/ai/src/index.ts` (export the new agent)
- Modify: `apps/supplier/package.json` (add `@e-luna/ai`), `apps/supplier/next.config.ts` (transpile)
- Create: `apps/supplier/app/api/assistant/route.ts`
- Create: `apps/supplier/app/api/ai-history/route.ts`
- Modify: `apps/supplier/app/(dashboard)/layout.tsx` (mount `LunaChatWidget`)
- Modify: `.env.example` (note supplier app now also uses `ANTHROPIC_API_KEY`)
