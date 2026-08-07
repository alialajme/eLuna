# Phase 8b: Payment Agent (advisory) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire an advisory, read-only Payment Agent that explains payment options and computes previews (wallet coverage, BNPL split, refund eligibility, supported methods) on the checkout page, without ever moving money.

**Architecture:** Rewrite the Payment agent stub into a customer-scoped tool factory (`buildPaymentTools(customerId)`) + `runPaymentAgent(messages, { customerId })`, mirroring the Seller agent (8a). `customerId` (= `CustomerProfile.id`) is resolved server-side from the Clerk session and captured in a closure — never an LLM parameter. A new customer route `/api/payment-help` streams it through the reused `LunaChatWidget`, which gains a `hiddenPaths` prop so the Shopping widget hides on `/checkout` while the Payment widget shows there.

**Tech Stack:** Next.js 15 (App Router), Vercel AI SDK (`streamText`, `tool`, `CoreMessage`, `toDataStreamResponse`), Anthropic `claude-sonnet-4-6`, Prisma + PostgreSQL, Zod, TypeScript (`noUncheckedIndexedAccess` on).

---

## Context for the implementer (read once)

- **No automated test suite exists** in this repo. "Tests" here = `npx tsc --noEmit` (type check) and `npx next lint` per package/app. Follow this convention; do NOT add a test runner.
- **`noUncheckedIndexedAccess` is ON.** Array index reads are `T | undefined`. Use `?? fallback`.
- **Decimals** from Prisma are `Prisma.Decimal` — convert with `Number(...)` before arithmetic/JSON.
- **Agent security rule (non-negotiable):** the scoping id is resolved from the session and passed into the tool factory closure. It is NEVER a Zod parameter the LLM can set. Order-based tools filter by `{ id, customerId }` so a crafted prompt cannot reach another customer's data.
- **Verified schema facts:**
  - `CustomerProfile { id (cuid), userId (unique), loyaltyPoints Int @default(0), walletBalance Decimal @default(0) }`
  - `Order { id, customerId (→ CustomerProfile.id), status OrderStatus, total Decimal, updatedAt, paymentTransactions PaymentTransaction[] }`
  - `PaymentTransaction { status PaymentStatus }`
  - `OrderStatus` = `PENDING | CONFIRMED | PROCESSING | SHIPPED | DELIVERED | CANCELLED | REFUNDED`
  - `PaymentStatus` = `PENDING | AUTHORIZED | CAPTURED | FAILED | REFUNDED | PARTIALLY_REFUNDED`
- **Reference patterns already in the repo:**
  - Agent factory shape: `packages/ai/src/agents/seller.ts` (`buildSellerTools(vendorId)` + `runSellerAgent`).
  - Route shape: `apps/customer/app/api/chat/route.ts` (imports `safeCurrentUser as currentUser` from `../../lib/auth`).
  - Config import: `import { anthropic, LUNA_MODEL, DEFAULT_SYSTEM_CONTEXT } from "../config";`
- **`safeCurrentUser()`** (`apps/customer/app/lib/auth.ts`) returns the Clerk user or `null` (null in dev when Clerk keys absent).

---

## File Structure

```
packages/ai/src/agents/payment.ts                 — REWRITE: buildPaymentTools(customerId) + runPaymentAgent(messages,{customerId})
packages/ai/src/index.ts                           — MODIFY line 6: export runPaymentAgent + buildPaymentTools (drop paymentTools)
packages/ui/src/components/LunaChatWidget.tsx      — MODIFY: add optional hiddenPaths prop (default ["/chat"])
apps/customer/app/api/payment-help/route.ts        — CREATE: POST → auth → customer profile → runPaymentAgent → stream
apps/customer/app/checkout/page.tsx                — MODIFY: mount the Payment widget in the authenticated return
apps/customer/app/layout.tsx                        — MODIFY line 55: Shopping widget hiddenPaths={["/chat","/checkout"]}
```

No schema changes. `packages/ai` already depends on `@e-luna/db`; the customer app already depends on `@e-luna/ai` and `ai` (used by `/api/chat`). `packages/ui` already depends on `ai` (`useChat`).

---

## Task 1: Rewrite the Payment agent (advisory, customer-scoped)

**Files:**
- Modify (full rewrite): `packages/ai/src/agents/payment.ts`
- Modify: `packages/ai/src/index.ts:6`

- [ ] **Step 1: Replace the entire contents of `packages/ai/src/agents/payment.ts`**

```ts
import { streamText, tool } from "ai";
import type { CoreMessage } from "ai";
import { z } from "zod";
import { prisma } from "@e-luna/db";
import { anthropic, LUNA_MODEL, DEFAULT_SYSTEM_CONTEXT } from "../config";

const PAYMENT_SYSTEM = `${DEFAULT_SYSTEM_CONTEXT}

You are the Payment Agent — a READ-ONLY checkout helper for a Luna customer.
Explain payment options and compute previews using your tools. You do NOT charge
cards, apply credits, or issue refunds — never claim you have. To pay, the customer
uses the checkout button; for refunds, direct them to the returns flow on their orders page.
Supported methods today: Card, Luna Wallet, Tabby, Tamara, Cash on Delivery.
Coming soon (via Stripe and regional gateways): Apple Pay, Google Pay, Tap Payments, Noqodi.
Ground every answer in the tools; never invent balances, methods, or eligibility. Be concise.`;

const DAY = 86_400_000;

/**
 * Build the Payment agent's read-only tools, scoped to one customer.
 * `customerId` (= CustomerProfile.id) is captured from the closure and is NEVER
 * an LLM-settable parameter. No tool mutates money.
 */
export function buildPaymentTools(customerId: string) {
  return {
    wallet_and_loyalty: tool({
      description: "Get the customer's current Luna wallet balance (AED) and loyalty points.",
      parameters: z.object({}),
      execute: async () => {
        const p = await prisma.customerProfile
          .findUnique({
            where: { id: customerId },
            select: { walletBalance: true, loyaltyPoints: true },
          })
          .catch(() => null);
        return {
          walletBalance: Number(p?.walletBalance ?? 0),
          loyaltyPoints: p?.loyaltyPoints ?? 0,
        };
      },
    }),

    order_coverage_preview: tool({
      description:
        "Preview how much of a given order amount (AED) the customer's wallet balance would cover. Read-only projection.",
      parameters: z.object({
        amount: z.number().min(0, "Amount must be zero or positive"),
      }),
      execute: async ({ amount }) => {
        const p = await prisma.customerProfile
          .findUnique({ where: { id: customerId }, select: { walletBalance: true } })
          .catch(() => null);
        const wallet = Number(p?.walletBalance ?? 0);
        const walletCovers = Math.min(wallet, amount);
        return {
          amount,
          walletBalance: wallet,
          walletCovers,
          remaining: amount - walletCovers,
        };
      },
    }),

    bnpl_split_preview: tool({
      description:
        "Preview a 4-installment Buy-Now-Pay-Later split for a given amount (AED) with Tabby or Tamara. Math only — not an approval.",
      parameters: z.object({
        amount: z.number().min(0.01, "Amount must be greater than 0"),
        provider: z.enum(["TABBY", "TAMARA"]),
      }),
      execute: async ({ amount, provider }) => {
        const perInstallment = Math.round((amount / 4) * 100) / 100;
        const now = Date.now();
        const schedule = [0, 30, 60, 90].map((d) =>
          new Date(now + d * DAY).toISOString().slice(0, 10),
        );
        return {
          provider,
          installments: 4,
          perInstallment,
          schedule,
          note: "Preview only — actual approval happens at checkout via the provider.",
        };
      },
    }),

    refund_eligibility: tool({
      description:
        "Check whether one of the customer's orders looks eligible for a refund. Advisory only — does not process refunds.",
      parameters: z.object({ orderId: z.string() }),
      execute: async ({ orderId }) => {
        const order = await prisma.order
          .findFirst({
            where: { id: orderId, customerId },
            select: {
              status: true,
              updatedAt: true,
              paymentTransactions: { select: { status: true } },
            },
          })
          .catch(() => null);
        if (!order) return { error: "Order not found in your account" };

        const alreadyRefunded = order.paymentTransactions.some(
          (t) => t.status === "REFUNDED" || t.status === "PARTIALLY_REFUNDED",
        );
        const withinWindow = Date.now() - new Date(order.updatedAt).getTime() <= 14 * DAY;
        const eligible = order.status === "DELIVERED" && withinWindow && !alreadyRefunded;
        const reason = alreadyRefunded
          ? "A refund has already been recorded for this order."
          : order.status !== "DELIVERED"
            ? "Refunds apply to delivered orders."
            : !withinWindow
              ? "The 14-day refund window has passed."
              : "Eligible — start a return from your orders page to request it.";
        return { eligible, reason };
      },
    }),

    payment_methods: tool({
      description:
        "List the payment methods available today and the ones coming soon. Use this instead of guessing.",
      parameters: z.object({}),
      execute: async () => ({
        live: ["Card", "Luna Wallet", "Tabby", "Tamara", "Cash on Delivery"],
        comingSoon: [
          "Apple Pay (via Stripe)",
          "Google Pay (via Stripe)",
          "Tap Payments",
          "Noqodi",
        ],
      }),
    }),
  };
}

export async function runPaymentAgent(
  messages: CoreMessage[],
  options: { customerId: string },
) {
  return streamText({
    model: anthropic(LUNA_MODEL),
    system: PAYMENT_SYSTEM,
    messages,
    tools: buildPaymentTools(options.customerId),
    maxSteps: 5,
  });
}
```

- [ ] **Step 2: Update the barrel export in `packages/ai/src/index.ts`**

Change line 6 from:
```ts
export { runPaymentAgent, paymentTools } from "./agents/payment";
```
to:
```ts
export { runPaymentAgent, buildPaymentTools } from "./agents/payment";
```

- [ ] **Step 3: Type-check the ai package**

Run: `cd packages/ai && npx tsc --noEmit 2>&1`
Expected: clean (no errors). If `CoreMessage` or `prisma` types complain, confirm the imports match the code above.

- [ ] **Step 4: Grep for stale consumers of the removed `paymentTools` export**

Run: `cd /Users/alialajme/Projects/Luna/e-luna && grep -rn "paymentTools" apps packages --include=*.ts --include=*.tsx`
Expected: only the definition/export lines you just wrote in `packages/ai/src/agents/payment.ts` and `index.ts` — NO importing consumer in any app. (If a consumer appears, it must be updated; none is expected.)

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/agents/payment.ts packages/ai/src/index.ts
git commit -m "feat(ai): rewrite Payment agent as advisory, customer-scoped (8b)

buildPaymentTools(customerId) + runPaymentAgent(messages,{customerId}).
Five read-only tools: wallet_and_loyalty, order_coverage_preview,
bnpl_split_preview, refund_eligibility (ownership-checked), payment_methods.
No money movement; customerId is closure-scoped, never an LLM param.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Add `hiddenPaths` prop to `LunaChatWidget`

**Files:**
- Modify: `packages/ui/src/components/LunaChatWidget.tsx:21-27` (props type + signature) and `:54` (hide rule)

- [ ] **Step 1: Extend the props type (currently lines 21-25)**

Replace:
```ts
type LunaChatWidgetProps = {
  apiPath: string; // e.g. "/api/chat" — route handler in the app
  title?: string; // header title; default "Luna Stylist"
  greeting?: string; // empty-state assistant greeting; default the customer copy
};
```
with:
```ts
type LunaChatWidgetProps = {
  apiPath: string; // e.g. "/api/chat" — route handler in the app
  title?: string; // header title; default "Luna Stylist"
  greeting?: string; // empty-state assistant greeting; default the customer copy
  hiddenPaths?: string[]; // pathnames where the widget renders nothing; default ["/chat"]
};
```

- [ ] **Step 2: Destructure the new prop (currently line 27)**

Replace:
```ts
export function LunaChatWidget({ apiPath, title, greeting }: LunaChatWidgetProps) {
```
with:
```ts
export function LunaChatWidget({ apiPath, title, greeting, hiddenPaths }: LunaChatWidgetProps) {
```

- [ ] **Step 3: Generalize the hide rule (currently line 54)**

Replace:
```ts
  // Hide on the full chat page — after all hooks
  if (pathname === "/chat") return null;
```
with:
```ts
  // Hide on configured paths (default: the full chat page) — after all hooks
  if ((hiddenPaths ?? ["/chat"]).includes(pathname)) return null;
```

- [ ] **Step 4: Type-check the ui package**

Run: `cd packages/ui && npx tsc --noEmit 2>&1`
Expected: clean. (The default `["/chat"]` preserves existing behavior, so no existing caller breaks.)

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/LunaChatWidget.tsx
git commit -m "feat(ui): add hiddenPaths prop to LunaChatWidget (8b)

Optional string[] of pathnames where the widget renders null; defaults to
['/chat'] so existing callers are unchanged.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Create the `/api/payment-help` route

**Files:**
- Create: `apps/customer/app/api/payment-help/route.ts`

- [ ] **Step 1: Create `apps/customer/app/api/payment-help/route.ts`**

```ts
import { safeCurrentUser as currentUser } from "../../lib/auth";
import { prisma } from "@e-luna/db";
import { runPaymentAgent } from "@e-luna/ai";
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

    const result = await runPaymentAgent(messages, { customerId: profile.id });
    return result.toDataStreamResponse();
  } catch (error) {
    console.error("[/api/payment-help] error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
```

- [ ] **Step 2: Type-check the customer app**

Run: `cd apps/customer && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts"`
Expected: clean (ignore any pre-existing `tailwind.config.ts` noise). `runPaymentAgent` and `CoreMessage` resolve from `@e-luna/ai` / `ai`.

- [ ] **Step 3: Commit**

```bash
git add apps/customer/app/api/payment-help/route.ts
git commit -m "feat(customer): add /api/payment-help route for Payment agent (8b)

Resolves customerId from the Clerk session (401/403 guards) and streams
runPaymentAgent. customerId comes only from the resolved CustomerProfile.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Wire the surfaces (mount Payment widget on checkout; hide Shopping widget there)

**Files:**
- Modify: `apps/customer/app/layout.tsx:55`
- Modify: `apps/customer/app/checkout/page.tsx` (imports + authenticated return)

- [ ] **Step 1: Hide the Shopping widget on `/checkout` — `apps/customer/app/layout.tsx:55`**

Replace:
```tsx
            <LunaChatWidget apiPath="/api/chat" />
```
with:
```tsx
            <LunaChatWidget apiPath="/api/chat" hiddenPaths={["/chat", "/checkout"]} />
```

- [ ] **Step 2: Import `LunaChatWidget` in the checkout page — `apps/customer/app/checkout/page.tsx`**

Add to the imports at the top (after the existing `@e-luna/db` import on line 4):
```tsx
import { LunaChatWidget } from "@e-luna/ui";
```

- [ ] **Step 3: Mount the Payment widget in the authenticated return — `apps/customer/app/checkout/page.tsx`**

Replace the final return (currently lines 58-66):
```tsx
  return (
    <CheckoutForm
      addresses={addresses}
      cartSubtotal={subtotal}
      shippingFee={shippingFee}
      cartTotal={total}
      itemCount={itemCount}
    />
  );
```
with:
```tsx
  return (
    <>
      <CheckoutForm
        addresses={addresses}
        cartSubtotal={subtotal}
        shippingFee={shippingFee}
        cartTotal={total}
        itemCount={itemCount}
      />
      <LunaChatWidget
        apiPath="/api/payment-help"
        title="Payment Help"
        greeting="Ask about your wallet balance, a Tabby/Tamara split, or refund eligibility — I explain options; you complete payment with the button."
      />
    </>
  );
```
(The unauthenticated early-return at lines 19-32 is left as-is: no widget for signed-out visitors, and the route would 401 anyway. The Payment widget uses the default `hiddenPaths` `["/chat"]`, so it shows on `/checkout`.)

- [ ] **Step 4: Type-check the customer app**

Run: `cd apps/customer && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts"`
Expected: clean. `LunaChatWidget` resolves from `@e-luna/ui`; the fragment is valid because a client component can be a child of a server component.

- [ ] **Step 5: Lint the customer app**

Run: `cd apps/customer && npx next lint 2>&1 | tail -3`
Expected: no errors/warnings from the changed files (no unescaped entities in the greeting — it uses a plain hyphen, an em dash, and a slash, all safe in a JS string prop).

- [ ] **Step 6: Commit**

```bash
git add apps/customer/app/layout.tsx apps/customer/app/checkout/page.tsx
git commit -m "feat(customer): surface Payment agent on checkout (8b)

Mount the 'Payment Help' widget on /checkout (authenticated return) and
hide the Shopping widget there via hiddenPaths, so only one widget floats.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Repo-wide green check (all 3 CI steps)

**Files:** none (verification only).

- [ ] **Step 1: Install (frozen) to mirror CI**

Run: `cd /Users/alialajme/Projects/Luna/e-luna && pnpm install --frozen-lockfile 2>&1 | tail -5`
Expected: no lockfile change needed (no new dependencies were added — `@e-luna/ai`, `ai`, `@e-luna/ui`, `@e-luna/db` were all already dependencies). If it reports the lockfile is out of date, STOP and report — the plan expects no dependency changes.

- [ ] **Step 2: Repo-wide lint**

Run: `cd /Users/alialajme/Projects/Luna/e-luna && pnpm lint 2>&1 | tail -15`
Expected: all apps pass (no errors).

- [ ] **Step 3: Repo-wide type check**

Run: `cd /Users/alialajme/Projects/Luna/e-luna && pnpm --filter "@e-luna/*" exec tsc --noEmit 2>&1 | tail -15`
Expected: clean across packages.

- [ ] **Step 4: Confirm the advisory guarantee (no money mutation in the agent)**

Run: `grep -nE "\.(update|create|delete|upsert|updateMany|createMany|deleteMany)\(" packages/ai/src/agents/payment.ts`
Expected: NO matches — the Payment agent performs only `findUnique`/`findFirst` reads. If any write appears, it violates the advisory design; remove it.

- [ ] **Step 5: Final commit (only if Steps 2-3 required any lint/type fixes; otherwise skip)**

```bash
git add -A
git commit -m "chore(8b): lint/type fixes for Payment agent wiring

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 6: Manual smoke note (not automated)**

Live agent chat requires a running customer app + `ANTHROPIC_API_KEY`. To smoke test manually: sign in, open `/checkout` with a non-empty cart, open the "Payment Help" bubble, and ask e.g. "What's my wallet balance?" and "Can I split 800 AED with Tabby?" — the agent should call `wallet_and_loyalty` / `bnpl_split_preview` and answer from real data. This is documented, not part of automated verification.

---

## Self-Review (completed)

**Spec coverage:**
- `buildPaymentTools(customerId)` + `runPaymentAgent(messages,{customerId})`, closure-scoped id → Task 1 ✓
- 5 read-only tools (wallet_and_loyalty, order_coverage_preview, bnpl_split_preview, refund_eligibility ownership-checked, payment_methods live/comingSoon incl. Apple/Google/Tap/Noqodi) → Task 1 ✓
- Drop `paymentTools`; export `buildPaymentTools` → Task 1 Steps 2/4 ✓
- No money movement (verified by grep) → Task 5 Step 4 ✓
- `hiddenPaths` prop default `["/chat"]` → Task 2 ✓
- Shopping widget hidden on `/checkout` → Task 4 Step 1 ✓
- Payment widget mounted on `/checkout` → Task 4 Step 3 ✓
- `/api/payment-help` route with 401/403/500 → Task 3 ✓
- Repo-wide lint + typecheck green → Task 5 ✓

**Placeholder scan:** none — every code step shows full content; every command shows expected output.

**Type consistency:** `buildPaymentTools`/`runPaymentAgent` signatures match between agent (Task 1), export (Task 1), and route call (Task 3). `hiddenPaths` prop name identical in type, destructure, usage (Task 2) and both call sites (Task 4). `CoreMessage` imported consistently. Enum string literals (`"DELIVERED"`, `"REFUNDED"`, `"PARTIALLY_REFUNDED"`) match the verified schema.
