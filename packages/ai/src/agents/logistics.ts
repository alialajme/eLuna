import { streamText, tool } from "ai";
import type { CoreMessage } from "ai";
import { z } from "zod";
import { prisma } from "@e-luna/db";
import { anthropic, LUNA_MODEL, DEFAULT_SYSTEM_CONTEXT } from "../config";

const LOGISTICS_SYSTEM = `${DEFAULT_SYSTEM_CONTEXT}

You are the Delivery Agent — a READ-ONLY delivery & returns helper for a Luna customer.
Use your tools to answer where an order is, when it should arrive, and whether an item can be returned.
You do NOT ship, move, cancel, or return anything — never claim you have. To return an item, tell the
customer to use the "Request return" button on the order page (delivered items only, within 14 days).
Couriers we use: Aramex, Fetchr, Quiqup, Emirates Post, DHL. Typical delivery is 2–5 business days.
Ground every answer in the tools; never invent tracking numbers, dates, or statuses. Be concise.`;

const RETURN_WINDOW_MS = 14 * 86_400_000;

export function buildLogisticsTools(customerId: string) {
  return {
    list_my_orders: tool({
      description: "List the customer's recent orders with their status and a shipment summary.",
      parameters: z.object({ limit: z.number().int().min(1).max(20).default(5) }),
      execute: async ({ limit }) => {
        const orders = await prisma.order
          .findMany({
            where: { customerId },
            orderBy: { createdAt: "desc" },
            take: limit,
            select: {
              id: true,
              status: true,
              createdAt: true,
              _count: { select: { items: true } },
              shipments: { select: { status: true }, orderBy: { createdAt: "desc" } },
            },
          })
          .catch(() => []);
        return {
          orders: orders.map((o) => ({
            orderId: o.id,
            shortId: o.id.slice(-8).toUpperCase(),
            status: o.status,
            placed: o.createdAt.toISOString().slice(0, 10),
            itemCount: o._count.items,
            shipmentCount: o.shipments.length,
            latestShipmentStatus: o.shipments[0]?.status ?? null,
          })),
        };
      },
    }),

    track_order: tool({
      description: "Get detailed shipment tracking for one of the customer's orders.",
      parameters: z.object({ orderId: z.string() }),
      execute: async ({ orderId }) => {
        const order = await prisma.order
          .findFirst({
            where: { id: orderId, customerId },
            select: {
              status: true,
              shipments: {
                orderBy: { createdAt: "asc" },
                select: {
                  id: true,
                  courier: true,
                  trackingNumber: true,
                  status: true,
                  estimatedDelivery: true,
                  deliveredAt: true,
                },
              },
              items: {
                select: { shipmentId: true, variant: { select: { product: { select: { title: true } } } } },
              },
            },
          })
          .catch(() => null);
        if (!order) return { error: "Order not found in your account" };

        const titlesBy = new Map<string, string[]>();
        const notYetShipped: string[] = [];
        for (const it of order.items) {
          const title = it.variant.product.title;
          if (it.shipmentId) {
            const a = titlesBy.get(it.shipmentId) ?? [];
            a.push(title);
            titlesBy.set(it.shipmentId, a);
          } else {
            notYetShipped.push(title);
          }
        }
        return {
          orderStatus: order.status,
          shipments: order.shipments.map((s) => ({
            courier: s.courier,
            trackingNumber: s.trackingNumber,
            status: s.status,
            estimatedDelivery: s.estimatedDelivery ? s.estimatedDelivery.toISOString().slice(0, 10) : null,
            deliveredAt: s.deliveredAt ? s.deliveredAt.toISOString().slice(0, 10) : null,
            items: titlesBy.get(s.id) ?? [],
          })),
          notYetShipped,
        };
      },
    }),

    return_options: tool({
      description:
        "For one of the customer's orders, report which items can be returned and any existing return status. Advisory only.",
      parameters: z.object({ orderId: z.string() }),
      execute: async ({ orderId }) => {
        const order = await prisma.order
          .findFirst({
            where: { id: orderId, customerId },
            select: {
              updatedAt: true,
              items: {
                select: {
                  fulfillmentStatus: true,
                  shipment: { select: { deliveredAt: true } },
                  returns: { select: { status: true } },
                  variant: { select: { product: { select: { title: true } } } },
                },
              },
            },
          })
          .catch(() => null);
        if (!order) return { error: "Order not found in your account" };

        const items = order.items.map((it) => {
          const active = it.returns.find((r) => r.status !== "REJECTED");
          const delivered = it.fulfillmentStatus === "DELIVERED";
          const anchor = it.shipment?.deliveredAt ?? order.updatedAt;
          const withinWindow = Date.now() - new Date(anchor).getTime() <= RETURN_WINDOW_MS;
          return {
            product: it.variant.product.title,
            delivered,
            withinWindow,
            existingReturn: active?.status ?? null,
            canRequestReturn: delivered && withinWindow && !active,
          };
        });
        return {
          items,
          note: "To start a return, use the 'Request return' button on the order page (delivered items, within 14 days).",
        };
      },
    }),
  };
}

export async function runLogisticsAgent(
  messages: CoreMessage[],
  options: { customerId: string; onFinish?: (event: { text: string }) => void | Promise<void> },
) {
  return streamText({
    model: anthropic(LUNA_MODEL),
    system: LOGISTICS_SYSTEM,
    messages,
    tools: buildLogisticsTools(options.customerId),
    maxSteps: 5,
    onFinish: options.onFinish,
  });
}
