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
  options: { customerId: string; onFinish?: (event: { text: string }) => void | Promise<void> },
) {
  return streamText({
    model: anthropic(LUNA_MODEL),
    system: PAYMENT_SYSTEM,
    messages,
    tools: buildPaymentTools(options.customerId),
    maxSteps: 5,
    onFinish: options.onFinish,
  });
}
