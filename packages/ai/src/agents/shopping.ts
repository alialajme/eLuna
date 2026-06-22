import { streamText, tool } from "ai";
import { z } from "zod";
import { anthropic, LUNA_MODEL, DEFAULT_SYSTEM_CONTEXT } from "../config";

const SHOPPING_SYSTEM = `${DEFAULT_SYSTEM_CONTEXT}

You are the Shopping Agent. Your role is to help customers find the perfect abaya or modest fashion item.
You have access to the product catalog, the customer's size profile, wishlist, and order history.
Use the customer's size profile to recommend products that will fit well.
Be specific about fabrics, fits, and styling when making recommendations.`;

export const shoppingTools = {
  search_products: tool({
    description: "Search for products by keyword, category, fabric, size, or price range",
    parameters: z.object({
      query: z.string().optional().describe("Text search query"),
      category: z.string().optional(),
      fabric: z.string().optional(),
      size: z.string().optional(),
      minPrice: z.number().optional(),
      maxPrice: z.number().optional(),
      limit: z.number().default(10),
    }),
    execute: async ({ query, category, fabric, size, minPrice, maxPrice, limit }) => {
      // Implemented in the customer app server action
      return { products: [], total: 0 };
    },
  }),

  recommend_size: tool({
    description: "Recommend the best size for a product based on the customer's size profile",
    parameters: z.object({
      productId: z.string(),
      customerId: z.string(),
    }),
    execute: async ({ productId, customerId }) => {
      return { recommendedSize: null, confidence: 0, note: "" };
    },
  }),

  add_to_cart: tool({
    description: "Add a product variant to the customer's cart",
    parameters: z.object({
      variantId: z.string(),
      quantity: z.number().default(1),
    }),
    execute: async ({ variantId, quantity }) => {
      return { success: false, message: "Cart management handled by customer app" };
    },
  }),

  style_look: tool({
    description: "Suggest a complete styled look with complementary pieces",
    parameters: z.object({
      productId: z.string(),
      occasion: z.string().optional().describe("e.g., wedding, casual, office, travel"),
    }),
    execute: async ({ productId, occasion }) => {
      return { look: [], styling_tips: "" };
    },
  }),
};

export async function runShoppingAgent(
  messages: { role: "user" | "assistant"; content: string }[],
  options?: { sizeProfileContext?: string }
) {
  const systemPrompt = options?.sizeProfileContext
    ? `${SHOPPING_SYSTEM}\n\nCustomer's size profile:\n${options.sizeProfileContext}`
    : SHOPPING_SYSTEM;

  return streamText({
    model: anthropic(LUNA_MODEL),
    system: systemPrompt,
    messages,
    tools: shoppingTools,
    maxSteps: 5,
  });
}
