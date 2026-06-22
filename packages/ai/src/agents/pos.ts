import { streamText, tool } from "ai";
import { z } from "zod";
import { anthropic, LUNA_MODEL, DEFAULT_SYSTEM_CONTEXT } from "../config";

const POS_SYSTEM = `${DEFAULT_SYSTEM_CONTEXT}

You are the POS Agent. You handle background synchronization tasks — inventory sync across channels,
loyalty point merging, in-store returns, and QR code lookups for the e-Luna platform.`;

export const posTools = {
  sync_inventory: tool({
    description: "Sync inventory levels across online and in-store channels for a vendor",
    parameters: z.object({
      vendorId: z.string(),
      source: z.enum(["ONLINE", "POS", "BOTH"]).default("BOTH"),
    }),
    execute: async ({ vendorId, source }) => {
      return { synced: 0, conflicts: [] };
    },
  }),

  merge_loyalty: tool({
    description: "Merge loyalty points earned in-store with the customer's online Luna account",
    parameters: z.object({
      customerId: z.string(),
      pointsToMerge: z.number(),
      storeTransactionRef: z.string(),
    }),
    execute: async ({ customerId, pointsToMerge, storeTransactionRef }) => {
      return { newBalance: 0, merged: false };
    },
  }),

  process_return: tool({
    description: "Process an in-store return and update the order status",
    parameters: z.object({
      orderItemId: z.string(),
      returnReason: z.string(),
      refundMethod: z.enum(["ORIGINAL", "WALLET", "STORE_CREDIT"]).default("ORIGINAL"),
    }),
    execute: async ({ orderItemId, returnReason, refundMethod }) => {
      return { returnId: "", status: "PROCESSED", refundAmount: 0 };
    },
  }),

  qr_lookup: tool({
    description: "Look up a product or order by QR code scan",
    parameters: z.object({
      qrCode: z.string(),
    }),
    execute: async ({ qrCode }) => {
      return { type: "UNKNOWN", data: null };
    },
  }),
};

export async function runPOSAgent(
  messages: { role: "user" | "assistant"; content: string }[],
) {
  return streamText({
    model: anthropic(LUNA_MODEL),
    system: POS_SYSTEM,
    messages,
    tools: posTools,
    maxSteps: 5,
  });
}
