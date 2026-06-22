import { streamText, tool } from "ai";
import { z } from "zod";
import { anthropic, LUNA_MODEL, DEFAULT_SYSTEM_CONTEXT } from "../config";

const PAYMENT_SYSTEM = `${DEFAULT_SYSTEM_CONTEXT}

You are the Payment Agent. You process transactions, apply loyalty credits, handle split payments,
refunds, and vendor payouts for the e-Luna platform.
Always confirm payment actions before executing them.`;

export const paymentTools = {
  apply_credits: tool({
    description: "Apply loyalty points or wallet balance to an order",
    parameters: z.object({
      orderId: z.string(),
      customerId: z.string(),
      creditsToApply: z.number(),
    }),
    execute: async ({ orderId, customerId, creditsToApply }) => {
      return { applied: 0, remaining: 0, newTotal: 0 };
    },
  }),

  split_payment: tool({
    description: "Split payment across multiple methods (e.g., wallet + card or Tabby BNPL)",
    parameters: z.object({
      orderId: z.string(),
      splits: z.array(z.object({
        method: z.enum(["CARD", "LUNA_WALLET", "TABBY", "TAMARA"]),
        amount: z.number().min(0.01, "Split amount must be greater than 0"),
      })).min(1, "At least one payment method is required"),
    }),
    execute: async ({ orderId, splits }) => {
      return { transactionIds: [], status: "PENDING" };
    },
  }),

  process_refund: tool({
    description: "Process a refund to the original payment method or Luna wallet",
    parameters: z.object({
      orderId: z.string(),
      amount: z.number().min(0.01, "Refund amount must be greater than 0"),
      refundToWallet: z.boolean().default(false),
    }),
    execute: async ({ orderId, amount, refundToWallet }) => {
      return { refundId: "", status: "PENDING", eta: "" };
    },
  }),

  payout_vendor: tool({
    description: "Initiate a payout to a vendor's IBAN",
    parameters: z.object({
      vendorId: z.string().uuid("Invalid vendor ID format"),
      amount: z.number().min(0.01).max(999999.99, "Payout exceeds maximum allowed amount"),
    }),
    execute: async ({ vendorId, amount }) => {
      return { payoutId: "", status: "PENDING", estimatedDate: "" };
    },
  }),
};

export async function runPaymentAgent(
  messages: { role: "user" | "assistant"; content: string }[],
) {
  return streamText({
    model: anthropic(LUNA_MODEL),
    system: PAYMENT_SYSTEM,
    messages,
    tools: paymentTools,
    maxSteps: 5,
  });
}
