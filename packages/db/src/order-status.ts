import { prisma } from "./client";
import type { ShipmentStatus } from "@prisma/client";

const AGGREGATE_RANGE = ["CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"];

/** Aggregate a customer order's status from its items' fulfillment. Never touches PENDING/CANCELLED/REFUNDED. */
export async function recomputeOrderStatus(orderId: string): Promise<void> {
  const order = await prisma.order
    .findUnique({
      where: { id: orderId },
      select: { status: true, items: { select: { fulfillmentStatus: true } } },
    })
    .catch(() => null);
  if (!order) return;
  if (!AGGREGATE_RANGE.includes(order.status)) return;

  const s = order.items.map((i) => i.fulfillmentStatus);
  const next =
    s.length > 0 && s.every((x) => x === "RETURNED")
      ? "REFUNDED"
      : s.length > 0 && s.every((x) => x === "DELIVERED" || x === "RETURNED")
        ? "DELIVERED"
        : s.some((x) => x === "SHIPPED" || x === "DELIVERED")
          ? "SHIPPED"
          : s.some((x) => x === "PROCESSING")
            ? "PROCESSING"
            : "CONFIRMED";

  if (next !== order.status) {
    await prisma.order.update({ where: { id: orderId }, data: { status: next } }).catch(() => null);
  }
}

/** Idempotently apply a shipment status; DELIVERED also flips items + timestamps and recomputes the order. */
export async function applyShipmentStatus(shipmentId: string, status: ShipmentStatus): Promise<void> {
  const shipment = await prisma.shipment
    .findUnique({ where: { id: shipmentId }, select: { orderId: true, status: true } })
    .catch(() => null);
  if (!shipment || shipment.status === status) return;

  if (status === "DELIVERED") {
    await prisma
      .$transaction(async (tx) => {
        await tx.shipment.update({ where: { id: shipmentId }, data: { status: "DELIVERED", deliveredAt: new Date() } });
        await tx.orderItem.updateMany({ where: { shipmentId }, data: { fulfillmentStatus: "DELIVERED" } });
      })
      .catch(() => null);
  } else {
    await prisma.shipment.update({ where: { id: shipmentId }, data: { status } }).catch(() => null);
  }
  await recomputeOrderStatus(shipment.orderId);
}
