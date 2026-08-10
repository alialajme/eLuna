# Phase 8e: AISession Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist each chat agent's conversation per `(userId, agentType)` and restore it on the widget's next mount — a memory layer for the 4 live agents (Shopping, Seller, Payment, Logistics).

**Architecture:** `AISession` gains `@@unique([userId, agentType])`; a shared `packages/ai/src/session.ts` provides `loadAgentMessages`/`persistOnFinish`/`isAgentType`; each `run*Agent` forwards an `onFinish` to `streamText`; streaming routes attach persistence; `GET /api/ai-history` (both apps) + a widget `agentType` prop self-load history.

**Tech Stack:** Vercel AI SDK (`streamText` `onFinish`, `useChat`), Prisma + PostgreSQL (`db push`, no migration files), Next.js 15, TypeScript (`noUncheckedIndexedAccess` on), Clerk.

---

## Context for the implementer (read once)

- **No automated test suite.** "Tests" = `npx tsc --noEmit` and `npx next lint`. Do NOT add a test runner.
- **`noUncheckedIndexedAccess` is ON.** Repo uses **`prisma db push`** (no migration files); after editing `schema.prisma`, run `pnpm --filter @e-luna/db db:generate` (offline) to regen the client — that's what makes the new unique key type-check. `db push` to a live DB is an operator step.
- **Verified state:**
  - `AISession { id, userId, agentType AIAgentType, messages Json @default("[]"), context Json @default("{}"), createdAt, updatedAt, user User @relation(onDelete: Cascade) }`, currently `@@index([userId]) @@index([userId, agentType])`. Prisma accessor: `prisma.aISession`. `AIAgentType = SHOPPING | SELLER | STUDIO | LOGISTICS | PAYMENT | POS`.
  - Agents (all `(messages: CoreMessage[], options) => streamText({...})`):
    - `runShoppingAgent(messages, options?: { sizeProfile?: SizeProfile | null; sessionId?: string })` — reads `options?.sizeProfile`.
    - `runSellerAgent(messages, options: { vendorId: string })`.
    - `runPaymentAgent(messages, options: { customerId: string })`.
    - `runLogisticsAgent(messages, options: { customerId: string })`.
  - Streaming routes: `apps/customer/app/api/chat/route.ts` (guest-tolerant; `const { messages, id } = ...`; `const user = await currentUser()` may be null; calls `runShoppingAgent(messages, { sizeProfile, sessionId: id })`), `.../payment-help/route.ts` (`runPaymentAgent(messages, { customerId: profile.id })`, user guaranteed), `.../delivery-help/route.ts` (`runLogisticsAgent(messages, { customerId: profile.id })`, user guaranteed), `apps/vendor/app/api/assistant/route.ts` (`runSellerAgent(messages, { vendorId: vendor.id })`, `user` from `safeCurrentUser`, guaranteed).
  - `LunaChatWidget` `useChat` line: `const { messages, input, handleInputChange, handleSubmit, isLoading, error } = useChat({ api: apiPath, id: sessionIdRef.current ?? undefined });`. `useEffect`/`useRef` already imported. Props: `{ apiPath, title?, greeting?, hiddenPaths?, hiddenPrefixes? }`.
  - Mount points (locate by `apiPath`): root `apps/customer/app/layout.tsx` (`apiPath="/api/chat"`), `apps/customer/app/checkout/page.tsx` (`apiPath="/api/payment-help"`), `apps/customer/app/orders/layout.tsx` (`apiPath="/api/delivery-help"`), vendor `apps/vendor/app/(dashboard)/layout.tsx` (`apiPath="/api/assistant"`).
  - Customer route auth import style: `import { safeCurrentUser as currentUser } from "../../lib/auth";` (from an `app/api/<x>/route.ts`). Vendor: `import { safeCurrentUser } from "../../lib/auth";`.

---

## File Structure

```
packages/db/prisma/schema.prisma                               — AISession @@unique([userId, agentType])
packages/ai/src/session.ts                                      — CREATE
packages/ai/src/index.ts                                        — export session helpers
packages/ai/src/agents/{shopping,seller,payment,logistics}.ts   — add onFinish → streamText
apps/customer/app/api/{chat,payment-help,delivery-help}/route.ts — attach persistOnFinish
apps/vendor/app/api/assistant/route.ts                          — attach persistOnFinish
apps/customer/app/api/ai-history/route.ts                       — CREATE GET
apps/vendor/app/api/ai-history/route.ts                         — CREATE GET
packages/ui/src/components/LunaChatWidget.tsx                   — agentType prop + mount load
apps/customer/app/layout.tsx, checkout/page.tsx, orders/layout.tsx — agentType props
apps/vendor/app/(dashboard)/layout.tsx                          — agentType="SELLER"
```

---

## Task 1: Schema `@@unique` + session module + regen

**Files:** Modify `packages/db/prisma/schema.prisma`; Create `packages/ai/src/session.ts`; Modify `packages/ai/src/index.ts`.

- [ ] **Step 1: Change the `AISession` composite index to a unique**

In `packages/db/prisma/schema.prisma`, inside `model AISession`, change:
```prisma
  @@index([userId])
  @@index([userId, agentType])
```
to:
```prisma
  @@index([userId])
  @@unique([userId, agentType])
```

- [ ] **Step 2: Create `packages/ai/src/session.ts`**

```ts
import { prisma } from "@e-luna/db";

export type StoredMessage = { id: string; role: "user" | "assistant"; content: string };

const AGENT_TYPES = ["SHOPPING", "SELLER", "STUDIO", "LOGISTICS", "PAYMENT", "POS"] as const;
export type AgentType = (typeof AGENT_TYPES)[number];

export function isAgentType(v: string): v is AgentType {
  return (AGENT_TYPES as readonly string[]).includes(v);
}

const MAX_STORED = 50;

type LooseMessage = { id?: string; role: string; content: unknown };

function toStored(m: LooseMessage): StoredMessage | null {
  if (m.role !== "user" && m.role !== "assistant") return null;
  const content = typeof m.content === "string" ? m.content : "";
  if (!content) return null;
  return { id: m.id ?? crypto.randomUUID(), role: m.role, content };
}

export async function loadAgentMessages(userId: string, agentType: AgentType): Promise<StoredMessage[]> {
  const session = await prisma.aISession
    .findUnique({ where: { userId_agentType: { userId, agentType } }, select: { messages: true } })
    .catch(() => null);
  const raw = Array.isArray(session?.messages) ? (session!.messages as unknown[]) : [];
  return raw
    .map((m) => (m && typeof m === "object" ? toStored(m as LooseMessage) : null))
    .filter((m): m is StoredMessage => m !== null);
}

/** streamText onFinish that upserts the rolling session with the full thread (capped). */
export function persistOnFinish(userId: string, agentType: AgentType, inputMessages: LooseMessage[]) {
  return async ({ text }: { text: string }) => {
    const prior = inputMessages.map(toStored).filter((m): m is StoredMessage => m !== null);
    const full = [...prior, { id: crypto.randomUUID(), role: "assistant" as const, content: text }].slice(-MAX_STORED);
    await prisma.aISession
      .upsert({
        where: { userId_agentType: { userId, agentType } },
        create: { userId, agentType, messages: full },
        update: { messages: full },
      })
      .catch((e) => console.error("[persistOnFinish]", e));
  };
}
```
Note: if tsc rejects `messages: full` on the Json field, import `Prisma` from `@e-luna/db` and cast `full as unknown as Prisma.InputJsonValue` in both `create` and `update`. Try without the cast first.

- [ ] **Step 3: Export from `packages/ai/src/index.ts`**

Append these lines:
```ts
export { loadAgentMessages, persistOnFinish, isAgentType } from "./session";
export type { StoredMessage } from "./session";
```

- [ ] **Step 4: Regenerate the Prisma client (offline)**

Run: `cd /Users/alialajme/Projects/Luna/e-luna && pnpm --filter @e-luna/db db:generate`
Expected: "Generated Prisma Client" success (the `userId_agentType` compound unique input is now available).

- [ ] **Step 5: Type-check the ai package**

Run: `cd /Users/alialajme/Projects/Luna/e-luna/packages/ai && npx tsc --noEmit 2>&1`
Expected: clean. (If `messages: full` errors, apply the cast from Step 2's note.)

- [ ] **Step 6: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna
git add packages/db/prisma/schema.prisma packages/ai/src/session.ts packages/ai/src/index.ts
git commit -m "feat(ai): AISession persistence helpers + @@unique(userId,agentType)

Add loadAgentMessages/persistOnFinish/isAgentType (StoredMessage), keyed on a
rolling AISession per (userId, agentType). Capped to last 50; persistence
errors are logged, never thrown.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Agents forward `onFinish`

**Files:** Modify `packages/ai/src/agents/{shopping,seller,payment,logistics}.ts`.

- [ ] **Step 1: `seller.ts` — add `onFinish` to options + streamText**

Replace:
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
with:
```ts
export async function runSellerAgent(
  messages: CoreMessage[],
  options: { vendorId: string; onFinish?: (event: { text: string }) => void | Promise<void> }
) {
  return streamText({
    model: anthropic(LUNA_MODEL),
    system: SELLER_SYSTEM,
    messages,
    tools: buildSellerTools(options.vendorId),
    maxSteps: 5,
    onFinish: options.onFinish,
  });
}
```

- [ ] **Step 2: `payment.ts` — same shape**

Change `runPaymentAgent`'s options to `{ customerId: string; onFinish?: (event: { text: string }) => void | Promise<void> }` and add `onFinish: options.onFinish,` to its `streamText({...})` call (as the last property, after `maxSteps: 5,`).

- [ ] **Step 3: `logistics.ts` — same shape**

Change `runLogisticsAgent`'s options to `{ customerId: string; onFinish?: (event: { text: string }) => void | Promise<void> }` and add `onFinish: options.onFinish,` to its `streamText({...})` call.

- [ ] **Step 4: `shopping.ts` — options is optional**

Change `runShoppingAgent`'s options type to:
```ts
  options?: {
    sizeProfile?: SizeProfile | null;
    sessionId?: string;
    onFinish?: (event: { text: string }) => void | Promise<void>;
  }
```
and add `onFinish: options?.onFinish,` to its `streamText({...})` call (after `maxSteps: 5,`).

- [ ] **Step 5: Type-check the ai package**

Run: `cd /Users/alialajme/Projects/Luna/e-luna/packages/ai && npx tsc --noEmit 2>&1`
Expected: clean. (The narrow `(event: { text }) => …` callback is assignable to the SDK's `onFinish` slot by parameter contravariance.)

- [ ] **Step 6: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna
git add packages/ai/src/agents/shopping.ts packages/ai/src/agents/seller.ts packages/ai/src/agents/payment.ts packages/ai/src/agents/logistics.ts
git commit -m "feat(ai): agents forward an optional onFinish to streamText (8e)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Streaming routes attach persistence

**Files:** Modify `apps/customer/app/api/{chat,payment-help,delivery-help}/route.ts`; Modify `apps/vendor/app/api/assistant/route.ts`.

- [ ] **Step 1: `apps/customer/app/api/chat/route.ts` (SHOPPING, guest-tolerant)**

Add `persistOnFinish` to the `@e-luna/ai` import (it currently imports `runShoppingAgent`):
```ts
import { runShoppingAgent, persistOnFinish } from "@e-luna/ai";
```
Then change the agent call:
```ts
    const result = await runShoppingAgent(messages, {
      sizeProfile,
      sessionId: id,
    });
```
to:
```ts
    const result = await runShoppingAgent(messages, {
      sizeProfile,
      sessionId: id,
      onFinish: user ? persistOnFinish(user.id, "SHOPPING", messages) : undefined,
    });
```

- [ ] **Step 2: `apps/customer/app/api/payment-help/route.ts` (PAYMENT)**

Add `persistOnFinish` to the `@e-luna/ai` import:
```ts
import { runPaymentAgent, persistOnFinish } from "@e-luna/ai";
```
Change:
```ts
    const result = await runPaymentAgent(messages, { customerId: profile.id });
```
to:
```ts
    const result = await runPaymentAgent(messages, {
      customerId: profile.id,
      onFinish: persistOnFinish(user.id, "PAYMENT", messages),
    });
```

- [ ] **Step 3: `apps/customer/app/api/delivery-help/route.ts` (LOGISTICS)**

Add `persistOnFinish` to the `@e-luna/ai` import:
```ts
import { runLogisticsAgent, persistOnFinish } from "@e-luna/ai";
```
Change:
```ts
    const result = await runLogisticsAgent(messages, { customerId: profile.id });
```
to:
```ts
    const result = await runLogisticsAgent(messages, {
      customerId: profile.id,
      onFinish: persistOnFinish(user.id, "LOGISTICS", messages),
    });
```

- [ ] **Step 4: `apps/vendor/app/api/assistant/route.ts` (SELLER)**

Add `persistOnFinish` to the `@e-luna/ai` import:
```ts
import { runSellerAgent, persistOnFinish } from "@e-luna/ai";
```
Change:
```ts
    const result = await runSellerAgent(messages, { vendorId: vendor.id });
```
to:
```ts
    const result = await runSellerAgent(messages, {
      vendorId: vendor.id,
      onFinish: persistOnFinish(user.id, "SELLER", messages),
    });
```

- [ ] **Step 5: Type-check both apps**

Run:
```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/customer && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts" | tail -6
cd ../vendor && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts" | tail -6
```
Expected: both clean. (`messages` — a `CoreMessage[]` — is structurally assignable to `persistOnFinish`'s `LooseMessage[]` param.)

- [ ] **Step 6: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna
git add apps/customer/app/api/chat/route.ts apps/customer/app/api/payment-help/route.ts apps/customer/app/api/delivery-help/route.ts apps/vendor/app/api/assistant/route.ts
git commit -m "feat(agents): persist conversations via onFinish in the streaming routes (8e)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: History endpoints (`GET /api/ai-history`)

**Files:** Create `apps/customer/app/api/ai-history/route.ts`, `apps/vendor/app/api/ai-history/route.ts`.

- [ ] **Step 1: Create `apps/customer/app/api/ai-history/route.ts`**

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

- [ ] **Step 2: Create `apps/vendor/app/api/ai-history/route.ts`**

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

- [ ] **Step 3: Type-check both apps**

Run:
```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/customer && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts" | tail -6
cd ../vendor && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts" | tail -6
```
Expected: both clean. (Confirm `apps/vendor/app/lib/auth.ts` exports `safeCurrentUser`; the assistant route imports it the same way — if the customer app's helper name differs, match the local one.)

- [ ] **Step 4: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna
git add apps/customer/app/api/ai-history/route.ts apps/vendor/app/api/ai-history/route.ts
git commit -m "feat(agents): GET /api/ai-history to load persisted conversations (8e)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Widget self-load + mount points

**Files:** Modify `packages/ui/src/components/LunaChatWidget.tsx`; Modify `apps/customer/app/layout.tsx`, `apps/customer/app/checkout/page.tsx`, `apps/customer/app/orders/layout.tsx`, `apps/vendor/app/(dashboard)/layout.tsx`.

- [ ] **Step 1: Add the `agentType` prop to `LunaChatWidget`'s props type**

Add `agentType?: string;` to `LunaChatWidgetProps` (after `hiddenPrefixes`):
```ts
  agentType?: string; // if set, load persisted history from /api/ai-history on mount
```

- [ ] **Step 2: Destructure `agentType` and `setMessages`**

Change the signature to include `agentType`:
```ts
export function LunaChatWidget({ apiPath, title, greeting, hiddenPaths, hiddenPrefixes, agentType }: LunaChatWidgetProps) {
```
Change the `useChat` destructure to also pull `setMessages`:
```ts
  const { messages, input, handleInputChange, handleSubmit, isLoading, error, setMessages } = useChat({
    api: apiPath,
    id: sessionIdRef.current ?? undefined,
  });
```

- [ ] **Step 3: Load history once on mount**

Immediately AFTER the existing `useChat({...})` call (and before the smart-scroll `useEffect`), add:
```ts
  const historyLoadedRef = useRef(false);
  useEffect(() => {
    if (!agentType || historyLoadedRef.current) return;
    historyLoadedRef.current = true;
    fetch(`/api/ai-history?agentType=${encodeURIComponent(agentType)}`)
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((d) => {
        if (Array.isArray(d.messages) && d.messages.length > 0) setMessages(d.messages);
      })
      .catch(() => {});
  }, [agentType, setMessages]);
```

- [ ] **Step 4: Type-check the ui package**

Run: `cd /Users/alialajme/Projects/Luna/e-luna/packages/ui && npx tsc --noEmit 2>&1`
Expected: clean. (`StoredMessage` `{ id, role, content }` is a valid `useChat` `Message`; `setMessages` accepts `Message[]`.)

- [ ] **Step 5: Add `agentType` to the four mount points**

- `apps/customer/app/layout.tsx` — the `<LunaChatWidget apiPath="/api/chat" ... />`: add `agentType="SHOPPING"`.
- `apps/customer/app/checkout/page.tsx` — the `<LunaChatWidget apiPath="/api/payment-help" ... />`: add `agentType="PAYMENT"`.
- `apps/customer/app/orders/layout.tsx` — the `<LunaChatWidget apiPath="/api/delivery-help" ... />`: add `agentType="LOGISTICS"`.
- `apps/vendor/app/(dashboard)/layout.tsx` — the `<LunaChatWidget apiPath="/api/assistant" ... />`: add `agentType="SELLER"`.

(Add the prop to the existing element; keep all current props.)

- [ ] **Step 6: Type-check + lint both apps**

Run:
```bash
cd /Users/alialajme/Projects/Luna/e-luna/apps/customer && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts" | tail -6 && npx next lint 2>&1 | tail -4
cd ../vendor && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts" | tail -6 && npx next lint 2>&1 | tail -4
```
Expected: tsc clean; no new lint errors.

- [ ] **Step 7: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna
git add packages/ui/src/components/LunaChatWidget.tsx apps/customer/app/layout.tsx apps/customer/app/checkout/page.tsx apps/customer/app/orders/layout.tsx "apps/vendor/app/(dashboard)/layout.tsx"
git commit -m "feat(ui): LunaChatWidget loads persisted history via agentType prop (8e)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Repo-wide green check

**Files:** none (verification only).

- [ ] **Step 1: Frozen install + regen**

Run:
```bash
cd /Users/alialajme/Projects/Luna/e-luna
pnpm install --frozen-lockfile 2>&1 | tail -3
pnpm --filter @e-luna/db db:generate 2>&1 | tail -2
```
Expected: no lockfile change (no new deps); client regen succeeds.

- [ ] **Step 2: Repo-wide lint**

Run: `cd /Users/alialajme/Projects/Luna/e-luna && pnpm lint 2>&1 | tail -12`
Expected: all apps pass (pre-existing `<img>` warnings acceptable).

- [ ] **Step 3: Repo-wide type check**

Run: `cd /Users/alialajme/Projects/Luna/e-luna && pnpm --filter "@e-luna/*" exec tsc --noEmit 2>&1 | tail -12`
Expected: clean.

- [ ] **Step 4: Confirm the wiring (inspection)**

Run:
```bash
cd /Users/alialajme/Projects/Luna/e-luna
grep -rn "persistOnFinish(" apps | grep -c route.ts   # expect 4 (chat, payment-help, delivery-help, assistant)
grep -rn 'agentType="' apps | grep -c LunaChatWidget || grep -rn 'agentType="' apps/customer/app/layout.tsx apps/customer/app/checkout/page.tsx apps/customer/app/orders/layout.tsx "apps/vendor/app/(dashboard)/layout.tsx"
grep -n "@@unique(\[userId, agentType\])" packages/db/prisma/schema.prisma
```
Expected: 4 route persistence call sites; the 4 mount points carry `agentType="…"`; the schema has the unique.

- [ ] **Step 5: Final commit (only if Steps 2-3 required fixes; otherwise skip)**

```bash
cd /Users/alialajme/Projects/Luna/e-luna
git add -A
git commit -m "chore(8e): lint/type fixes for AISession persistence

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 6: Manual/operator smoke note (not automated)**

Applying `@@unique` to the live DB is `pnpm --filter @e-luna/db db:push` (operator). Live smoke (running app + DB + `ANTHROPIC_API_KEY`): chat with an agent → reload the page → the conversation reappears (loaded from `/api/ai-history`); a different signed-in user sees only their own; guests get ephemeral chat.

---

## Self-Review (completed)

**Spec coverage:**
- `AISession @@unique([userId, agentType])` → Task 1 ✓
- `session.ts` (`loadAgentMessages`, `persistOnFinish`, `isAgentType`, `StoredMessage`, capped 50, `.catch`-logged) → Task 1 ✓
- Agents forward `onFinish` → Task 2 ✓
- Streaming routes attach persistence (Shopping conditional on user) → Task 3 ✓
- `GET /api/ai-history` in both apps (validate agentType, key on session userId) → Task 4 ✓
- Widget `agentType` self-load via `setMessages` + 4 mount points → Task 5 ✓
- Repo-wide green + wiring inspection → Task 6 ✓

**Placeholder scan:** none — every code step is complete (the Prisma-Json cast is a conditional fallback, not a placeholder).

**Type consistency:** `persistOnFinish(userId, agentType, messages)` and `loadAgentMessages(userId, agentType)` signatures match between `session.ts` (Task 1), the routes (Tasks 3/4), and the exports. `onFinish?: (event: { text: string }) => void | Promise<void>` is identical across all 4 agents (Task 2) and matches what `persistOnFinish` returns (Task 1). `isAgentType`/`StoredMessage` used consistently. `agentType` prop name identical in the widget (Task 5) and all 4 mount points. The `userId_agentType` compound key matches the `@@unique` fields (Task 1).
```
