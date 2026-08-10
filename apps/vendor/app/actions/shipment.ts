"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@e-luna/db";
import { getCourier } from "@e-luna/ui/couriers";
import { safeCurrentUser } from "../lib/auth";
import { getVendorByUserId } from "../lib/vendor";
import { recomputeOrderStatus } from "../lib/order-status";

export async function createShipment(input: {
  orderId: string;
  courier: string;
  trackingNumber: string;
  estimatedDelivery?: string;
}): Promise<{ success: boolean; error?: string; shipmentId?: string }> {
  const user = await safeCurrentUser();
  if (!user) return { success: false, error: "Not signed in" };
  const vendor = await getVendorByUserId(user.id);
  if (!vendor) return { success: false, error: "Vendor not found" };

  if (!input.trackingNumber.trim()) return { success: false, error: "Tracking number is required" };
  if (!getCourier(input.courier)) return { success: false, error: "Unknown courier" };

  const items = await prisma.orderItem
    .findMany({
      where: {
        orderId: input.orderId,
        vendorId: vendor.id,
        fulfillmentStatus: { in: ["PENDING", "PROCESSING"] },
      },
      select: { id: true },
    })
    .catch(() => []);
  if (items.length === 0) return { success: false, error: "No items available to ship for this order" };

  try {
    const shipment = await prisma.$transaction(async (tx) => {
      const created = await tx.shipment.create({
        data: {
          orderId: input.orderId,
          vendorId: vendor.id,
          courier: input.courier,
          trackingNumber: input.trackingNumber.trim(),
          status: "IN_TRANSIT",
          estimatedDelivery: input.estimatedDelivery ? new Date(input.estimatedDelivery) : null,
        },
      });
      await tx.orderItem.updateMany({
        where: { id: { in: items.map((i) => i.id) } },
        data: { shipmentId: created.id, fulfillmentStatus: "SHIPPED" },
      });
      return created;
    });
    await recomputeOrderStatus(input.orderId);
    revalidatePath("/orders");
    revalidatePath(`/orders/${input.orderId}`);
    return { success: true, shipmentId: shipment.id };
  } catch {
    return { success: false, error: "Failed to create shipment" };
  }
}

export async function markShipmentDelivered(
  shipmentId: string,
): Promise<{ success: boolean; error?: string }> {
  const user = await safeCurrentUser();
  if (!user) return { success: false, error: "Not signed in" };
  const vendor = await getVendorByUserId(user.id);
  if (!vendor) return { success: false, error: "Vendor not found" };

  const shipment = await prisma.shipment
    .findUnique({ where: { id: shipmentId }, select: { vendorId: true, orderId: true, status: true } })
    .catch(() => null);
  if (!shipment) return { success: false, error: "Shipment not found" };
  if (shipment.vendorId !== vendor.id) return { success: false, error: "Unauthorized" };
  if (shipment.status === "DELIVERED") return { success: false, error: "Already delivered" };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.shipment.update({
        where: { id: shipmentId },
        data: { status: "DELIVERED", deliveredAt: new Date() },
      });
      await tx.orderItem.updateMany({ where: { shipmentId }, data: { fulfillmentStatus: "DELIVERED" } });
    });
    await recomputeOrderStatus(shipment.orderId);
    revalidatePath("/orders");
    revalidatePath(`/orders/${shipment.orderId}`);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to mark delivered" };
  }
}
