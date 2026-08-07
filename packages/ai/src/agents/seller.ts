import { streamText, tool } from "ai";
import type { CoreMessage } from "ai";
import { z } from "zod";
import { prisma } from "@e-luna/db";
import { anthropic, LUNA_MODEL, DEFAULT_SYSTEM_CONTEXT } from "../config";

const SELLER_SYSTEM = `${DEFAULT_SYSTEM_CONTEXT}

You are the Seller Agent for a Luna vendor. Help them manage and grow their boutique.
Use your tools to ground every answer in the vendor's real data — never invent numbers.
Be concise and data-driven; vendors are busy. When you recommend creating marketing
imagery, use the studio_link tool to point them to Luna Studio.`;

// vendorId is captured from the authenticated session — NEVER an LLM parameter.
export function buildSellerTools(vendorId: string) {
  return {
    flag_low_stock: tool({
      description:
        "List the vendor's product variants whose stock is below a threshold (default 5).",
      parameters: z.object({
        threshold: z.number().default(5),
      }),
      execute: async ({ threshold }) => {
        const variants = await prisma.productVariant
          .findMany({
            where: { product: { vendorId }, stock: { lt: threshold } },
            select: {
              size: true,
              color: true,
              stock: true,
              product: { select: { title: true } },
            },
            orderBy: { stock: "asc" },
          })
          .catch(() => []);
        return {
          items: variants.map((v) => ({
            product: v.product.title,
            size: v.size,
            color: v.color,
            stock: v.stock,
          })),
        };
      },
    }),

    suggest_price: tool({
      description:
        "Benchmark one of the vendor's products against the median price of active products in the same category.",
      parameters: z.object({
        productId: z.string(),
      }),
      execute: async ({ productId }) => {
        const product = await prisma.product
          .findFirst({
            where: { id: productId, vendorId },
            select: { title: true, price: true, category: true },
          })
          .catch(() => null);
        if (!product) return { error: "Product not found in your store" };

        const peers = await prisma.product
          .findMany({
            where: { category: product.category, status: "ACTIVE" },
            select: { price: true },
          })
          .catch(() => []);
        const prices = peers.map((p) => Number(p.price)).sort((a, b) => a - b);
        const currentPrice = Number(product.price);
        const median =
          prices.length === 0
            ? null
            : (prices[Math.floor(prices.length / 2)] ?? null);
        return {
          product: product.title,
          category: product.category,
          currentPrice,
          benchmarkMedian: median,
          suggestedPrice: median ?? currentPrice,
          sampleSize: prices.length,
        };
      },
    }),

    forecast_demand: tool({
      description:
        "Forecast next-30-day unit demand for one of the vendor's products from its recent sales trend.",
      parameters: z.object({
        productId: z.string(),
      }),
      execute: async ({ productId }) => {
        const owns = await prisma.product
          .findFirst({ where: { id: productId, vendorId }, select: { title: true } })
          .catch(() => null);
        if (!owns) return { error: "Product not found in your store" };

        const DAY = 86_400_000;
        const now = Date.now();
        const cutoff = new Date(now - 30 * DAY);
        const prevCutoff = new Date(now - 60 * DAY);
        const items = await prisma.orderItem
          .findMany({
            where: {
              vendorId,
              variant: { productId },
              order: {
                status: { notIn: ["CANCELLED", "REFUNDED"] },
                createdAt: { gte: prevCutoff },
              },
            },
            select: { quantity: true, order: { select: { createdAt: true } } },
          })
          .catch(() => []);

        let last30 = 0;
        let prior30 = 0;
        for (const it of items) {
          if (it.order.createdAt >= cutoff) last30 += it.quantity;
          else prior30 += it.quantity;
        }
        const trend =
          last30 > prior30 * 1.1
            ? "RISING"
            : last30 < prior30 * 0.9
              ? "FALLING"
              : "STABLE";
        const ratio = prior30 === 0 ? 1 : last30 / prior30;
        const projectedNext30 = Math.round(
          last30 * (trend === "STABLE" ? 1 : ratio)
        );
        return { product: owns.title, last30, prior30, trend, projectedNext30 };
      },
    }),

    studio_link: tool({
      description:
        "Return a link to Luna Studio where the vendor can upload photos to generate a marketing campaign.",
      parameters: z.object({
        productId: z.string().optional(),
      }),
      execute: async () => {
        return {
          url: "/studio/new",
          message:
            "Upload 3 photos of the product to generate a full marketing campaign in Luna Studio.",
        };
      },
    }),
  };
}

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
