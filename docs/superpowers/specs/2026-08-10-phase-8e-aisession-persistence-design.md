# Phase 8e: AISession Persistence — Design Spec

## Goal

Give the AI agent mesh a memory layer: persist each chat agent's conversation per `(userId, agentType)` and restore it on the widget's next mount, so conversations survive page reloads and sessions. Covers the 4 live chat agents (Shopping, Seller, Payment, Logistics). Orchestration/handoff is explicitly out of scope (the per-surface widgets already place the right agent on the right page).

---

## Scope

**In scope:**
- Schema: `AISession` gains `@@unique([userId, agentType])` (replaces the composite index) to key the rolling session.
- Shared `packages/ai/src/session.ts`: `loadAgentMessages`, `persistOnFinish`, `isAgentType`, `StoredMessage`.
- Each `run*Agent` forwards an optional `onFinish` to `streamText`; each streaming route attaches persistence when a user is present.
- `GET /api/ai-history` in both apps (customer + vendor).
- `LunaChatWidget` gains an `agentType` prop that self-loads history on mount; the 4 mount points pass it.

**Out of scope (deferred / YAGNI):**
- Agent orchestration / cross-agent handoff / a single routing entry agent.
- Persisting tool calls/results (only user/assistant text is stored — that's all the widget renders).
- Persistence for guests (no `userId`) — they stay ephemeral, as today.
- Studio/POS (not chat-widget agents).
- A "clear history" control.

---

## Architecture

### Session model & granularity
One **rolling `AISession` per `(userId, agentType)`** — "resume your conversation with agent X". Requires an upsert key: change `AISession`'s `@@index([userId, agentType])` to **`@@unique([userId, agentType])`** (additive, `db push`; unique implies the index). `messages` (Json) holds the thread; `context` stays default `{}`. `AIAgentType` = `SHOPPING | SELLER | STUDIO | LOGISTICS | PAYMENT | POS` (persistence uses SHOPPING/SELLER/PAYMENT/LOGISTICS).

### Message format
`StoredMessage = { id: string; role: "user" | "assistant"; content: string }` — exactly what `useChat` consumes as `initialMessages`/`setMessages` and what the widget renders. Capped to the **last 50** per session.

### Data flow
```
widget mount → GET /api/ai-history?agentType=X → loadAgentMessages(userId, X) → setMessages
user sends   → POST /api/…  → run*Agent(messages, { …, onFinish: persistOnFinish(userId, X, messages) })
              → stream to client; onFinish upserts AISession(userId, X) with the full thread (capped 50)
```

### Security
The history endpoint and persistence key on the **session-resolved `userId`** (Clerk `user.id`) — never a client-supplied id. A user can only read/write their own `(userId, agentType)` session. `agentType` from the query string is validated with `isAgentType` before any query. Persistence failures are `.catch`-logged and never break the stream.

### Files
```
packages/db/prisma/schema.prisma                               — AISession @@unique([userId, agentType])
packages/ai/src/session.ts                                      — CREATE
packages/ai/src/index.ts                                        — export loadAgentMessages, persistOnFinish, isAgentType, StoredMessage
packages/ai/src/agents/shopping.ts                              — add onFinish → streamText
packages/ai/src/agents/seller.ts                                — add onFinish → streamText
packages/ai/src/agents/payment.ts                               — add onFinish → streamText
packages/ai/src/agents/logistics.ts                             — add onFinish → streamText
apps/customer/app/api/chat/route.ts                             — attach persistOnFinish (SHOPPING, when user present)
apps/customer/app/api/payment-help/route.ts                     — attach persistOnFinish (PAYMENT)
apps/customer/app/api/delivery-help/route.ts                    — attach persistOnFinish (LOGISTICS)
apps/vendor/app/api/assistant/route.ts                          — attach persistOnFinish (SELLER)
apps/customer/app/api/ai-history/route.ts                       — CREATE GET
apps/vendor/app/api/ai-history/route.ts                         — CREATE GET
packages/ui/src/components/LunaChatWidget.tsx                   — add agentType prop + mount-load via setMessages
apps/customer/app/layout.tsx                                    — Shopping widget agentType="SHOPPING"
apps/customer/app/checkout/page.tsx                             — Payment widget agentType="PAYMENT"
apps/customer/app/orders/layout.tsx                             — Delivery widget agentType="LOGISTICS"
apps/vendor/app/(dashboard)/layout.tsx                          — Seller widget agentType="SELLER"
```

**Verified facts:** `AISession { id, userId, agentType, messages Json @default("[]"), context Json @default("{}"), createdAt, updatedAt }`, relation `user User @relation(onDelete: Cascade)`, currently `@@index([userId]) @@index([userId, agentType])`. Prisma model accessor is `prisma.aISession`; the composite unique input will be `userId_agentType`. All 4 `run*Agent` functions are `(messages: CoreMessage[], options) => streamText({...})`: `runShoppingAgent(messages, options?: { sizeProfile?, sessionId? })`, `runSellerAgent(messages, { vendorId })`, `runPaymentAgent(messages, { customerId })`, `runLogisticsAgent(messages, { customerId })`. Routes: chat (guest-tolerant, reads `id`), payment-help/delivery-help/assistant (401 without user). Widget `useChat` currently exposes `messages, input, handleInputChange, handleSubmit, isLoading, error` and is called `useChat({ api: apiPath, id })`. Mount points: root layout (Shopping), checkout/page.tsx (Payment), orders/layout.tsx (Delivery), vendor `(dashboard)/layout.tsx:51` (Seller).

---

## Session module — `packages/ai/src/session.ts`

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
Note: `messages: full` — a plain-object array is a valid Prisma `InputJsonValue`; if tsc objects, cast `full as unknown as Prisma.InputJsonValue` (import `Prisma` from `@e-luna/db`). `packages/ai/src/index.ts` adds: `export { loadAgentMessages, persistOnFinish, isAgentType } from "./session"; export type { StoredMessage } from "./session";`.

---

## Agents — forward `onFinish`

Each `run*Agent` adds `onFinish?: (event: { text: string }) => void | Promise<void>` to its options and passes it to `streamText({ ..., onFinish: options?.onFinish })`. (The narrow-param callback is assignable to the SDK's `onFinish` slot by parameter contravariance.) Applies to all four: `shopping.ts` (options is optional — read `options?.onFinish`), `seller.ts`, `payment.ts`, `logistics.ts`.

Example (seller):
```ts
export async function runSellerAgent(
  messages: CoreMessage[],
  options: { vendorId: string; onFinish?: (event: { text: string }) => void | Promise<void> },
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

---

## Streaming routes — attach persistence

Each imports `persistOnFinish` from `@e-luna/ai` and passes it in the agent options when a user is present:
- **chat** (`SHOPPING`, guest-tolerant): `onFinish: user ? persistOnFinish(user.id, "SHOPPING", messages) : undefined`.
- **payment-help** (`PAYMENT`), **delivery-help** (`LOGISTICS`), **assistant** (`SELLER`): user is guaranteed (they 401 otherwise), so `onFinish: persistOnFinish(user.id, "<TYPE>", messages)`.

`messages` here is the request body (`CoreMessage[]`), which for these text agents carries `{ id?, role, content }` — `persistOnFinish`'s `toStored` coerces safely.

---

## History endpoints — `GET /api/ai-history`

**Customer** (`apps/customer/app/api/ai-history/route.ts`):
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
**Vendor** (`apps/vendor/app/api/ai-history/route.ts`): identical, importing `safeCurrentUser` from the vendor app's `../../lib/auth`. Both return `{ messages: StoredMessage[] }`; guests/invalid agentType → `{ messages: [] }`. Keyed only on the resolved `user.id`.

---

## Widget — `LunaChatWidget`

Add an optional `agentType` prop; destructure `setMessages` from `useChat`; load history once on mount.
```ts
type LunaChatWidgetProps = {
  // …existing…
  agentType?: string; // if set, load persisted history from /api/ai-history on mount
};
```
```tsx
const { messages, input, handleInputChange, handleSubmit, isLoading, error, setMessages } = useChat({
  api: apiPath,
  id: sessionIdRef.current ?? undefined,
});

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
`StoredMessage` (`{ id, role, content }`) is a valid `useChat` `Message`. Without `agentType`, behavior is unchanged (ephemeral).

### Mount points
- Root layout (Shopping): add `agentType="SHOPPING"`.
- `checkout/page.tsx` (Payment): add `agentType="PAYMENT"`.
- `orders/layout.tsx` (Delivery): add `agentType="LOGISTICS"`.
- Vendor `(dashboard)/layout.tsx` (Seller): add `agentType="SELLER"`.

---

## Error Handling

- **Persistence never blocks the stream** — `persistOnFinish`'s upsert is `.catch`-logged; a DB failure just skips saving.
- **History fetch failures** → empty (`.catch(() => {})`), widget stays usable; only non-empty history replaces the empty state.
- **`agentType` validated** with `isAgentType` before any query; read/write keyed only on the session `userId` (no cross-user access).
- **Guests** (no `userId`) → no persistence, empty history — current behavior preserved.
- Widget change **backward-compatible** (no `agentType` → ephemeral).
- Message coercion is defensive (`toStored` drops non-string/other-role entries), so a malformed stored blob can't crash a load.

---

## Testing

No automated suite (repo-consistent). Per task:
```bash
pnpm --filter @e-luna/db db:generate                                       # regen client after @@unique
cd packages/ai && npx tsc --noEmit 2>&1                                     # clean
cd packages/ui && npx tsc --noEmit 2>&1                                     # clean
cd apps/customer && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts"    # clean
cd apps/vendor   && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts"    # clean
# lint both apps
```
Final task: repo-wide `pnpm lint` + `pnpm --filter "@e-luna/*" exec tsc --noEmit`.

**Operator note:** applying `@@unique` to the live DB is `pnpm --filter @e-luna/db db:push` (operator step). **Manual smoke** (running app + DB + `ANTHROPIC_API_KEY`): chat with an agent → reload → the conversation reappears (loaded via `/api/ai-history`); sign in as a different user → only their own history shows; guests get ephemeral chat.

---

## Boundary with 8d

8e finishes the mesh's memory layer for the 4 live chat agents. The POS agent (8d) is a separate channel; when built, it can reuse `persistOnFinish`/`loadAgentMessages` with `agentType: "POS"`. Cross-agent orchestration/handoff remains deferred (YAGNI given the current per-surface widget placement).
