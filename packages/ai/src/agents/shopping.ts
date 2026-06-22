import { streamText, tool } from "ai";
import type { CoreMessage } from "ai";
import { z } from "zod";
import { prisma } from "@e-luna/db";
import type { SizeProfile } from "@e-luna/db";
import { Decimal } from "@prisma/client/runtime/library";
import { anthropic, LUNA_MODEL, DEFAULT_SYSTEM_CONTEXT } from "../config";

export const CART_ACTION = "ADD_TO_CART" as const;

const SHOPPING_SYSTEM = `${DEFAULT_SYSTEM_CONTEXT}

You are the Shopping Agent. Your role is to help customers find the perfect abaya or modest fashion item.
You have access to the product catalog, the customer's size profile, wishlist, and order history.
Use the customer's size profile to recommend products that will fit well.
Be specific about fabrics, fits, and styling when making recommendations.
When you find products, always mention the vendor name and price in AED.
If a customer asks to add something to their bag, confirm the product and size first.`;

const SizeGuideSchema = z.object({
  entries: z.array(z.object({
    size: z.string(),
    bust: z.tuple([z.number(), z.number()]),
    waist: z.tuple([z.number(), z.number()]).optional(),
    hip: z.tuple([z.number(), z.number()]).optional(),
    length: z.number().optional(),
  })),
});

function createShoppingTools(sizeProfile: SizeProfile | null) {
  return {
    search_products: tool({
      description: "Search for products by keyword, category, fabric, size, or price range",
      parameters: z.object({
        query: z.string().optional().describe("Text search query"),
        category: z.string().optional(),
        fabric: z.string().optional(),
        size: z.string().optional(),
        minPrice: z.number().optional(),
        maxPrice: z.number().optional(),
        limit: z.number().default(5),
      }),
      execute: async ({ query, category, fabric, size, minPrice, maxPrice, limit }) => {
        try {
          const products = await prisma.product.findMany({
            where: {
              status: "ACTIVE",
              ...(category && { category: { equals: category, mode: "insensitive" } }),
              ...(fabric && { fabric: { equals: fabric, mode: "insensitive" } }),
              ...(minPrice !== undefined && { price: { gte: new Decimal(minPrice) } }),
              ...(maxPrice !== undefined && { price: { lte: new Decimal(maxPrice) } }),
              ...(size && { variants: { some: { size: { equals: size }, stock: { gt: 0 } } } }),
              ...(query && {
                OR: [
                  { title: { contains: query, mode: "insensitive" } },
                  { fabric: { contains: query, mode: "insensitive" } },
                  { description: { contains: query, mode: "insensitive" } },
                  { vendor: { storeName: { contains: query, mode: "insensitive" } } },
                ],
              }),
            },
            include: {
              vendor: { select: { storeName: true } },
              variants: { select: { size: true, stock: true, color: true } },
            },
            take: limit,
            orderBy: { createdAt: "desc" },
          });

          return {
            products: products.map((p) => ({
              slug: p.slug,
              title: p.title,
              price: Number(p.price),
              fabric: p.fabric,
              category: p.category,
              vendorName: p.vendor.storeName,
              availableSizes: [...new Set(p.variants.filter((v) => v.stock > 0).map((v) => v.size))],
              embed: `[PRODUCT:${p.slug}]`,
            })),
            returned: products.length,
          };
        } catch {
          return { products: [], returned: 0, error: "Could not search products right now." };
        }
      },
    }),

    recommend_size: tool({
      description: "Recommend the best size for a product based on the customer's size profile",
      parameters: z.object({
        productSlug: z.string(),
      }),
      execute: async ({ productSlug }) => {
        try {
          if (!sizeProfile) {
            return {
              recommendedSize: null,
              confidence: 0,
              note: "No size profile found. Ask the customer to set up their size profile at /profile/size for personalised recommendations.",
            };
          }

          const product = await prisma.product.findUnique({
            where: { slug: productSlug },
            select: { sizeGuide: true, title: true },
          });

          if (!product) {
            return { recommendedSize: null, confidence: 0, note: "Product not found." };
          }

          const parsed = SizeGuideSchema.safeParse(product.sizeGuide);
          if (!parsed.success || !parsed.data.entries.length) {
            return { recommendedSize: sizeProfile.usualSize, confidence: 0.5, note: "Using your usual size — no detailed guide available." };
          }
          const guide = parsed.data;

          const bust = sizeProfile.bust;
          if (!bust) {
            return { recommendedSize: sizeProfile.usualSize, confidence: 0.6, note: "Using your usual size. Add bust measurements for a more accurate fit." };
          }

          const match = guide.entries.find((e) => bust >= e.bust[0] && bust < e.bust[1]);

          if (match) {
            const fitAdjustment = sizeProfile.fitPreference === "LOOSE" || sizeProfile.fitPreference === "OVERSIZED"
              ? ` Consider sizing up for a ${sizeProfile.fitPreference.toLowerCase()} fit.`
              : "";
            return {
              recommendedSize: match.size,
              confidence: 0.9,
              note: `Based on your bust measurement (${bust}cm), ${match.size} should fit you well.${fitAdjustment}`,
            };
          }

          return { recommendedSize: sizeProfile.usualSize, confidence: 0.7, note: `Your measurements are between sizes. Your usual size ${sizeProfile.usualSize} is a safe choice.` };
        } catch {
          return { recommendedSize: null, confidence: 0, note: "Could not retrieve size recommendation right now." };
        }
      },
    }),

    add_to_cart: tool({
      description: "Add a product variant to the customer's cart",
      parameters: z.object({
        variantId: z.string(),
        quantity: z.number().int().min(1).default(1),
        productTitle: z.string(),
        size: z.string(),
      }),
      execute: async ({ variantId, quantity, productTitle, size }) => {
        try {
          // Cart cookie is written by the customer app's client-side handler.
          // This tool returns the signal; useChat onToolCall handles the cookie.
          // TODO: requires onToolCall handler in apps/customer ChatInterface to write to luna_cart cookie
          return {
            success: true,
            variantId,
            quantity,
            message: `Added ${quantity}× ${productTitle} (${size}) to your bag.`,
            action: CART_ACTION,
          };
        } catch {
          return { success: false, variantId, quantity, message: "Could not add to bag right now.", action: "ADD_TO_CART_ERROR" };
        }
      },
    }),

    style_look: tool({
      description: "Suggest complementary products that pair well with a given product",
      parameters: z.object({
        productSlug: z.string(),
        occasion: z.string().optional().describe("e.g., wedding, casual, office, travel"),
      }),
      execute: async ({ productSlug, occasion }) => {
        try {
          const product = await prisma.product.findUnique({
            where: { slug: productSlug },
            select: { fabric: true, category: true },
          });

          if (!product) return { look: [], styling_tips: "" };

          const OCCASION_CATEGORY: Record<string, string> = {
            casual: "Everyday",
            everyday: "Everyday",
            travel: "Travel",
            office: "Occasion",
            wedding: "Occasion",
            formal: "Occasion",
            sport: "Sport",
            activewear: "Sport",
          };
          const targetCategory = OCCASION_CATEGORY[occasion?.toLowerCase() ?? ""] ?? product.category;

          const complementary = await prisma.product.findMany({
            where: {
              status: "ACTIVE",
              slug: { not: productSlug },
              ...(occasion
                ? { category: { equals: targetCategory, mode: "insensitive" } }
                : { fabric: { equals: product.fabric ?? undefined, mode: "insensitive" } }
              ),
            },
            include: { vendor: { select: { storeName: true } } },
            take: 2,
          });

          return {
            look: complementary.map((p) => ({
              slug: p.slug,
              title: p.title,
              price: Number(p.price),
              vendorName: p.vendor.storeName,
              embed: `[PRODUCT:${p.slug}]`,
            })),
            styling_tips: `These pieces complement the ${product.fabric ?? "fabric"} and work well for a ${occasion ?? "polished"} look.`,
          };
        } catch {
          return { look: [], styling_tips: "Could not load styling suggestions right now." };
        }
      },
    }),
  };
}

export async function runShoppingAgent(
  messages: CoreMessage[],
  options?: {
    sizeProfile?: SizeProfile | null;
    sessionId?: string;
  }
) {
  const sizeProfile = options?.sizeProfile ?? null;

  const sizeContext = sizeProfile
    ? `\n\nCustomer size profile: height ${sizeProfile.height}cm, bust ${sizeProfile.bust}cm, waist ${sizeProfile.waist}cm, hip ${sizeProfile.hip}cm, usual size ${sizeProfile.usualSize}, fit preference ${sizeProfile.fitPreference}.`
    : "";

  return streamText({
    model: anthropic(LUNA_MODEL),
    system: SHOPPING_SYSTEM + sizeContext,
    messages,
    tools: createShoppingTools(sizeProfile),
    maxSteps: 5,
  });
}
