# Phase 8b: Payment Agent (advisory) — Design Spec

## Goal

Wire the **Payment Agent** as an advisory, read-only checkout helper: it explains payment options and computes projections (wallet coverage, BNPL split preview, refund eligibility, supported methods) but **never moves money**. It surfaces as a floating "Payment Help" widget on the checkout page. All actual charges/refunds stay in the existing deterministic checkout server action.

The Payment Agent is method-aware: it advises accurately on what works today and honestly flags methods arriving in the separate, deferred **Payments Gateway** phase (Stripe / Apple Pay / Google Pay / Tap Payments / Noqodi).

---

## Scope

**In scope:** rewrite the Payment agent with 5 read-only, customer-scoped tools; a customer chat route; a `hiddenPaths` prop on `LunaChatWidget`; mount the Payment widget on `/checkout` and hide the Shopping widget there.

**Out of scope (explicitly):** any money mutation by the agent (charges, refunds, applying credits, payouts — those stay in deterministic server actions; `payout_vendor` is dropped as it already exists as an admin action in 6c-i); the actual **gateway integrations** for Stripe / Apple Pay / Google Pay / Tap Payments / Noqodi (a separate deferred phase — see "Future work"); schema changes; `AISession` persistence (Phase 8e).

---

## Architecture

The Payment agent is **advisory/read-only**, customer-scoped, running in a new customer route (`/api/payment-help`) and surfaced via the reused `LunaChatWidget` (Vercel AI SDK `useChat` → `toDataStreamResponse()`, same pattern as Shopping `/api/chat` and Seller `/api/assistant`).

**Security:** the agent is bound to the **authenticated customer**. `customerId` (`CustomerProfile.id`) is resolved server-side (`safeCurrentUser()` → `prisma.customerProfile.findUnique({ where: { userId } })`), captured in a `buildPaymentTools(customerId)` closure, and **never** an LLM parameter. Order-based tools verify `order.customerId === customerId` first. **No tool mutates money** — `walletBalance` is only read; the agent's prompt forbids claiming to have charged/refunded.

### Files

```
packages/ai/src/agents/payment.ts                 — REWRITE: buildPaymentTools(customerId) + runPaymentAgent(messages, { customerId })
packages/ai/src/index.ts                          — MODIFY: export runPaymentAgent + buildPaymentTools (drop paymentTools)
packages/ui/src/components/LunaChatWidget.tsx     — MODIFY: add optional hiddenPaths prop (default ["/chat"])
apps/customer/app/api/payment-help/route.ts       — CREATE: POST → auth → customer profile → runPaymentAgent → stream
apps/customer/app/checkout/page.tsx               — MODIFY: mount the Payment widget
apps/customer/app/layout.tsx                       — MODIFY: pass hiddenPaths=["/chat","/checkout"] to the Shopping widget
```

No schema changes. `packages/ai` depends on `@e-luna/db`; the customer app already depends on `@e-luna/ai` and `ai`.

**Verified facts:** `CustomerProfile { id, userId, walletBalance (Decimal), loyaltyPoints (Int) }`; `Order { customerId (= CustomerProfile.id), total (Decimal), status (OrderStatus), updatedAt }` with relation `paymentTransactions (PaymentTransaction[])`; `PaymentTransaction { status (PaymentStatus) }`; `PaymentMethod` enum = `CARD | LUNA_WALLET | TABBY | TAMARA | CASH_ON_DELIVERY`. Shopping widget mounted at `apps/customer/app/layout.tsx` as `<LunaChatWidget apiPath="/api/chat" />`; widget's current hide-rule is `if (pathname === "/chat") return null;`.

---

## Payment Agent — `packages/ai/src/agents/payment.ts`

Mirrors the Seller agent (8a) factory shape.

### System prompt
```
${DEFAULT_SYSTEM_CONTEXT}

You are the Payment Agent — a READ-ONLY checkout helper for a Luna customer.
Explain payment options and compute previews using your tools. You do NOT charge cards,
apply credits, or issue refunds — never claim you have. To pay, the customer uses the
checkout button; for refunds, direct them to the returns flow.
Supported methods today: Card, Luna Wallet, Tabby, Tamara, Cash on Delivery.
Coming soon (via Stripe and regional gateways): Apple Pay, Google Pay, Tap Payments, Noqodi.
Ground every answer in the tools; never invent balances, methods, or eligibility.
```

### `buildPaymentTools(customerId: string)` — 5 read-only tools

`customerId` is captured from the closure — NEVER an LLM parameter. All reads `.catch()`-guarded; Decimals `Number()`-converted.

1. **`wallet_and_loyalty`** — params `{}`.
   ```ts
   const p = await prisma.customerProfile
     .findUnique({ where: { id: customerId }, select: { walletBalance: true, loyaltyPoints: true } })
     .catch(() => null);
   return { walletBalance: Number(p?.walletBalance ?? 0), loyaltyPoints: p?.loyaltyPoints ?? 0 };
   ```
   (Loyalty is reported for info only — the schema defines no points→AED rate, so coverage math uses only the AED wallet.)

2. **`order_coverage_preview`** — params `{ amount: z.number().min(0) }`. Read-only projection of how much the wallet covers.
   ```ts
   const p = await prisma.customerProfile
     .findUnique({ where: { id: customerId }, select: { walletBalance: true } })
     .catch(() => null);
   const wallet = Number(p?.walletBalance ?? 0);
   const walletCovers = Math.min(wallet, amount);
   return { amount, walletBalance: wallet, walletCovers, remaining: amount - walletCovers };
   ```

3. **`bnpl_split_preview`** — params `{ amount: z.number().min(0.01), provider: z.enum(["TABBY", "TAMARA"]) }`. Pure math, no gateway call.
   ```ts
   const DAY = 86_400_000;
   const perInstallment = Math.round((amount / 4) * 100) / 100;
   const now = Date.now();
   const schedule = [0, 30, 60, 90].map((d) => new Date(now + d * DAY).toISOString().slice(0, 10));
   return {
     provider, installments: 4, perInstallment, schedule,
     note: "Preview only — actual approval happens at checkout via the provider.",
   };
   ```

4. **`refund_eligibility`** — params `{ orderId: z.string() }`. Ownership-checked; advisory only (does not process).
   ```ts
   const order = await prisma.order
     .findFirst({
       where: { id: orderId, customerId },
       select: { status: true, updatedAt: true, paymentTransactions: { select: { status: true } } },
     })
     .catch(() => null);
   if (!order) return { error: "Order not found in your account" };

   const alreadyRefunded = order.paymentTransactions.some(
     (t) => t.status === "REFUNDED" || t.status === "PARTIALLY_REFUNDED"
   );
   const withinWindow =
     Date.now() - new Date(order.updatedAt).getTime() <= 14 * 86_400_000;
   const eligible = order.status === "DELIVERED" && withinWindow && !alreadyRefunded;
   const reason = alreadyRefunded
     ? "A refund has already been recorded for this order."
     : order.status !== "DELIVERED"
       ? "Refunds apply to delivered orders."
       : !withinWindow
         ? "The 14-day refund window has passed."
         : "Eligible — start a return from your orders page to request it.";
   return { eligible, reason };
   ```

5. **`payment_methods`** — params `{}`. Honest, method-aware list (grounds the agent so it never invents methods).
   ```ts
   return {
     live: ["Card", "Luna Wallet", "Tabby", "Tamara", "Cash on Delivery"],
     comingSoon: ["Apple Pay (via Stripe)", "Google Pay (via Stripe)", "Tap Payments", "Noqodi"],
   };
   ```

### `runPaymentAgent`
```ts
export async function runPaymentAgent(
  messages: CoreMessage[],
  options: { customerId: string }
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

`packages/ai/src/index.ts`: change the payment export from `runPaymentAgent, paymentTools` to `runPaymentAgent, buildPaymentTools`. (Nothing imports `paymentTools` — safe to drop.)

---

## Customer Route — `apps/customer/app/api/payment-help/route.ts`

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

    const result = await runPaymentAgent(messages, { customerId: profile.id });
    return result.toDataStreamResponse();
  } catch (error) {
    console.error("[/api/payment-help] error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
}
```
(`safeCurrentUser` is aliased as `currentUser`, matching the existing `/api/chat` route's import style.) `customerId` comes only from the resolved profile.

---

## Shared Widget — `packages/ui/src/components/LunaChatWidget.tsx`

Add an optional `hiddenPaths` prop; backward-compatible.
```ts
type LunaChatWidgetProps = {
  apiPath: string;
  title?: string;
  greeting?: string;
  hiddenPaths?: string[]; // default ["/chat"]
};
```
Replace the hide-rule `if (pathname === "/chat") return null;` with:
```ts
if ((hiddenPaths ?? ["/chat"]).includes(pathname)) return null;
```
Default preserves current behavior.

---

## Surface Wiring

**Shopping widget** (`apps/customer/app/layout.tsx`) — hide it on checkout so only one widget floats there:
```tsx
<LunaChatWidget apiPath="/api/chat" hiddenPaths={["/chat", "/checkout"]} />
```

**Payment widget** — mount on the checkout page (`apps/customer/app/checkout/page.tsx`) as the last child of its returned JSX (client widget in an RSC page is fine). It uses the default `hiddenPaths` (`["/chat"]`), so it shows on `/checkout`:
```tsx
<LunaChatWidget
  apiPath="/api/payment-help"
  title="Payment Help"
  greeting="Ask about your wallet balance, a Tabby/Tamara split, or refund eligibility — I explain options; you complete payment with the button."
/>
```
Net effect: on `/checkout` only the Payment widget floats; elsewhere only Shopping.

---

## Error Handling

- Route: 401 (no user), 403 (no customer profile), 500 (unexpected) — generic messages, no leak. `customerId` only from the resolved profile.
- Tools: all Prisma reads `.catch()`-guarded; `refund_eligibility` ownership-checks → `{ error: "Order not found in your account" }`; Decimals `Number()`-converted; `bnpl_split_preview` requires `amount >= 0.01` (zod), `order_coverage_preview` requires `amount >= 0`.
- **No money mutations** anywhere; the system prompt forbids claiming to have charged/refunded.
- Widget change backward-compatible (`hiddenPaths` defaults to `["/chat"]`).

---

## Testing

No automated suite (repo-consistent). Per task:
```bash
cd packages/ai && npx tsc --noEmit 2>&1                                     # clean
cd apps/customer && npx tsc --noEmit 2>&1 | grep -v "tailwind.config.ts"    # clean
cd apps/customer && npx next lint 2>&1 | tail -3                            # no errors
```
Final task runs repo-wide `pnpm lint` + `pnpm --filter "@e-luna/*" exec tsc --noEmit`. Live agent chat needs a running app + `ANTHROPIC_API_KEY` (manual smoke).

---

## Future work — Payments Gateway phase (separate, deferred)

A dedicated phase (not 8b) will add real checkout gateway support behind the existing `PaymentGateway` interface (`apps/customer/app/lib/payment/gateway.ts`):
- **Stripe** — Card + **Apple Pay** + **Google Pay** via the Stripe Payment Element / Payment Request Button (one integration covers all three); UAE + international.
- **Tap Payments** — Gulf PSP adapter (cards, Apple Pay/Google Pay, KNET/mada).
- **Noqodi** — UAE digital-wallet adapter.
- Requires extending the `PaymentMethod` enum (e.g. `APPLE_PAY`, `GOOGLE_PAY`, `TAP`, `NOQODI`) — the first customer-side Prisma migration — plus checkout UI wiring and live credentials/webhooks (an operator step; can't be verified without accounts).
When those land, the advisory agent's `payment_methods` "coming soon" list moves them to "live".

**Naming note:** this spec reads "tappi" as **Tap Payments** (tap.company) and "noqoodi" as **Noqodi** (noqodi.com). Correct during review if a different provider was intended.
