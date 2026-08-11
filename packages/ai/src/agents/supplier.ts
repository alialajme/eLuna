import { streamText, tool } from "ai";
import type { CoreMessage } from "ai";
import { z } from "zod";
import { prisma } from "@e-luna/db";
import { anthropic, LUNA_MODEL, DEFAULT_SYSTEM_CONTEXT } from "../config";

const SUPPLIER_SYSTEM = `${DEFAULT_SYSTEM_CONTEXT}

You are the Supplier Agent for a Luna materials supplier. Help them manage their materials
catalog and fulfil vendor orders. Use your tools to ground every answer in the supplier's real
data — never invent numbers. Be concise and data-driven. You are advisory only: to accept, ship,
or complete an order, direct the supplier to the Incoming Orders page (/orders).`;

// supplierId is captured from the authenticated session — NEVER an LLM parameter.
export function buildSupplierTools(supplierId: string) {
  return {
    flag_low_material_stock: tool({
      description:
        "List the supplier's ACTIVE materials whose stock is below a threshold (default 5).",
      parameters: z.object({ threshold: z.number().default(5) }),
      execute: async ({ threshold }) => {
        const materials = await prisma.material
          .findMany({
            where: { supplierId, status: "ACTIVE", stock: { lt: threshold } },
            select: { name: true, materialType: true, color: true, stock: true, unit: true },
            orderBy: { stock: "asc" },
          })
          .catch(() => []);
        return {
          items: materials.map((m) => ({
            name: m.name,
            materialType: m.materialType,
            color: m.color,
            stock: m.stock,
            unit: m.unit,
          })),
        };
      },
    }),

    pending_orders: tool({
      description:
        "List incoming material orders that are PENDING and awaiting the supplier's response.",
      parameters: z.object({}),
      execute: async () => {
        const orders = await prisma.materialOrder
          .findMany({
            where: { supplierId, status: "PENDING" },
            include: { items: true, vendor: { select: { storeName: true } } },
            orderBy: { createdAt: "asc" },
          })
          .catch(() => []);
        const DAY = 86_400_000;
        return {
          count: orders.length,
          orders: orders.map((o) => {
            const first = o.items[0];
            return {
              id: o.id,
              buyer: o.vendor.storeName,
              summary: first ? `${first.quantity} × ${first.materialName}` : "Order",
              total: Number(o.total),
              ageDays: Math.floor((Date.now() - o.createdAt.getTime()) / DAY),
            };
          }),
        };
      },
    }),

    material_sales: tool({
      description:
        "Summarise realized material sales (accepted/shipped/completed orders) over the last N days (default 30).",
      parameters: z.object({ days: z.number().default(30) }),
      execute: async ({ days }) => {
        const cutoff = new Date(Date.now() - days * 86_400_000);
        const orders = await prisma.materialOrder
          .findMany({
            where: {
              supplierId,
              status: { in: ["ACCEPTED", "SHIPPED", "COMPLETED"] },
              createdAt: { gte: cutoff },
            },
            include: { items: true },
          })
          .catch(() => []);
        let unitsSold = 0;
        let revenue = 0;
        const byMaterial: Record<string, number> = {};
        for (const o of orders) {
          for (const it of o.items) {
            const line = Number(it.unitPrice) * it.quantity;
            unitsSold += it.quantity;
            revenue += line;
            byMaterial[it.materialName] = (byMaterial[it.materialName] ?? 0) + line;
          }
        }
        const topMaterials = Object.entries(byMaterial)
          .map(([name, rev]) => ({ name, revenue: rev }))
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 5);
        return { days, orderCount: orders.length, unitsSold, revenue, topMaterials };
      },
    }),

    benchmark_material_price: tool({
      description:
        "Benchmark one of the supplier's materials against the median wholesale price of active materials of the same type across Luna.",
      parameters: z.object({ materialId: z.string() }),
      execute: async ({ materialId }) => {
        const material = await prisma.material
          .findFirst({
            where: { id: materialId, supplierId },
            select: { name: true, wholesalePrice: true, materialType: true },
          })
          .catch(() => null);
        if (!material) return { error: "Material not found in your catalog" };

        const peers = await prisma.material
          .findMany({
            where: { materialType: material.materialType, status: "ACTIVE" },
            select: { wholesalePrice: true },
          })
          .catch(() => []);
        const prices = peers.map((p) => Number(p.wholesalePrice)).sort((a, b) => a - b);
        const currentPrice = Number(material.wholesalePrice);
        const median =
          prices.length === 0 ? null : (prices[Math.floor(prices.length / 2)] ?? null);
        return {
          material: material.name,
          materialType: material.materialType,
          currentPrice,
          benchmarkMedian: median,
          suggestedPrice: median ?? currentPrice,
          sampleSize: prices.length,
        };
      },
    }),
  };
}

export async function runSupplierAgent(
  messages: CoreMessage[],
  options: { supplierId: string; onFinish?: (event: { text: string }) => void | Promise<void> }
) {
  return streamText({
    model: anthropic(LUNA_MODEL),
    system: SUPPLIER_SYSTEM,
    messages,
    tools: buildSupplierTools(options.supplierId),
    maxSteps: 5,
    onFinish: options.onFinish,
  });
}
