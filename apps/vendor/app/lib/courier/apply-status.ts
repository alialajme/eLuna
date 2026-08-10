import { prisma, type ShipmentStatus } from "@e-luna/db";
import { recomputeOrderStatus } from "../order-status";

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
