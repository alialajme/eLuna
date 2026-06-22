import { streamText, tool } from "ai";
import { z } from "zod";
import { anthropic, LUNA_MODEL, DEFAULT_SYSTEM_CONTEXT } from "../config";

const SELLER_SYSTEM = `${DEFAULT_SYSTEM_CONTEXT}

You are the Seller Agent. Your role is to help vendors manage and grow their Luna boutique.
You analyze sales data, inventory, and market trends to give actionable advice.
Be data-driven and concise — vendors are busy business owners.`;

export const sellerTools = {
  suggest_price: tool({
    description: "Suggest an optimal price for a product based on category benchmarks and demand",
    parameters: z.object({
      productId: z.string(),
      currentPrice: z.number(),
      category: z.string(),
    }),
    execute: async ({ productId, currentPrice, category }) => {
      return { suggestedPrice: currentPrice, reasoning: "" };
    },
  }),

  flag_low_stock: tool({
    description: "Identify products with critically low stock levels",
    parameters: z.object({
      vendorId: z.string(),
      threshold: z.number().default(5),
    }),
    execute: async ({ vendorId, threshold }) => {
      return { lowStockItems: [] };
    },
  }),

  trigger_studio: tool({
    description: "Initiate a Luna Studio AI campaign generation for a product",
    parameters: z.object({
      productId: z.string(),
      uploadedImageUrls: z.array(z.string()).max(3),
    }),
    execute: async ({ productId, uploadedImageUrls }) => {
      return { studioUploadId: null, status: "PENDING" };
    },
  }),

  forecast_demand: tool({
    description: "Forecast demand for a product over the next 30 days",
    parameters: z.object({
      productId: z.string(),
    }),
    execute: async ({ productId }) => {
      return { forecastedUnits: 0, confidence: 0, trend: "STABLE" };
    },
  }),
};

export async function runSellerAgent(
  messages: { role: "user" | "assistant"; content: string }[],
) {
  return streamText({
    model: anthropic(LUNA_MODEL),
    system: SELLER_SYSTEM,
    messages,
    tools: sellerTools,
    maxSteps: 5,
  });
}
