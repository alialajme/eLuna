import { streamText, tool } from "ai";
import { z } from "zod";
import { anthropic, LUNA_MODEL, DEFAULT_SYSTEM_CONTEXT } from "../config";

const LOGISTICS_SYSTEM = `${DEFAULT_SYSTEM_CONTEXT}

You are the Logistics Agent. You coordinate shipments, track orders, select couriers,
and handle return requests for the e-Luna platform. Focus on UAE and GCC delivery operations.`;

export const logisticsTools = {
  select_courier: tool({
    description: "Select the optimal courier for a shipment based on destination, weight, and cost",
    parameters: z.object({
      orderId: z.string(),
      destinationEmirate: z.string(),
      weightKg: z.number(),
      isUrgent: z.boolean().default(false),
    }),
    execute: async ({ orderId, destinationEmirate, weightKg, isUrgent }) => {
      return { courierId: "", courierName: "", estimatedDays: 0, cost: 0 };
    },
  }),

  create_shipment: tool({
    description: "Create a shipment record and generate a waybill",
    parameters: z.object({
      orderId: z.string(),
      courierId: z.string(),
    }),
    execute: async ({ orderId, courierId }) => {
      return { shipmentId: "", trackingNumber: "", waybillUrl: "" };
    },
  }),

  track_order: tool({
    description: "Get the current tracking status of an order's shipment",
    parameters: z.object({
      trackingNumber: z.string(),
    }),
    execute: async ({ trackingNumber }) => {
      return { status: "", location: "", estimatedDelivery: "", events: [] };
    },
  }),

  initiate_return: tool({
    description: "Initiate a return request for an order item",
    parameters: z.object({
      orderItemId: z.string(),
      reason: z.string(),
    }),
    execute: async ({ orderItemId, reason }) => {
      return { returnId: "", status: "REQUESTED", pickupDate: "" };
    },
  }),
};

export async function runLogisticsAgent(
  messages: { role: "user" | "assistant"; content: string }[],
) {
  return streamText({
    model: anthropic(LUNA_MODEL),
    system: LOGISTICS_SYSTEM,
    messages,
    tools: logisticsTools,
    maxSteps: 5,
  });
}
