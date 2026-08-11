"use server";

import { revalidatePath } from "next/cache";
import { prisma, recomputeOrderStatus, applyShipmentStatus } from "@e-luna/db";
import { getCourier } from "@e-luna/ui/couriers";
import { getCourierGateway } from "@e-luna/courier";
import { safeCurrentUser } from "../lib/auth";
import { getSupplierByUserId } from "../lib/supplier";

async function resolveActiveSupplier(): Promise<{ id: string } | { error: string }> {
  const user = await safeCurrentUser();
  if (!user) return { error: "Not signed in" };
  const supplier = await getSupplierByUserId(user.id);
  if (!supplier) return { error: "Not a supplier" };
  if (supplier.status !== "ACTIVE") return { error: "Your supplier account is not active" };
  return { id: supplier.id };
}

const PAID = ["CONFIRMED", "PROCESSING"];

export async function shipDropshipItems(input: {
  orderId: string;
  vendorId: string;
  courier: string;
  trackingNumber?: string;
  trackingNote?: string;
}): Promise<{ success: boolean; error?: string }> {
  const auth = await resolveActiveSupplier();
  if ("error" in auth) return { success: false, error: auth.error };
  if (!getCourier(input.courier)) return { success: false, error: "Unknown courier" };

  const order = await prisma.order
    .findUnique({
      where: { id: input.orderId },
      select: {
        status: true,
        address: { select: { fullName: true, addressLine1: true, city: true, emirate: true } },
        items: {
          where: {
            vendorId: input.vendorId,
            fulfillmentStatus: { in: ["PENDING", "PROCESSING"] },
            shipmentId: null,
            variant: { product: { dropshipSupplierId: auth.id } },
          },
          select: { id: true },
        },
      },
    })
    .catch(() => null);
  if (!order) return { success: false, error: "Not found" };
  if (!PAID.includes(order.status)) return { success: false, error: "Order is not ready to fulfil" };
  if (order.items.length === 0) return { success: false, error: "No items to fulfil for this order" };

  const result = await getCourierGateway(input.courier).createShipment({
    reference: input.orderId,
    courier: input.courier,
    destination: {
      name: order.address.fullName,
      addressLine1: order.address.addressLine1,
      city: order.address.city,
      emirate: order.address.emirate,
    },
  });
  if (result.status === "failed") return { success: false, error: result.error };

  let trackingNumber: string;
  let externalRef: string | null = null;
  let labelUrl: string | null = null;
  if (result.status === "created") {
    trackingNumber = result.trackingNumber;
    externalRef = result.externalRef;
    labelUrl = result.labelUrl ?? null;
  } else {
    if (!input.trackingNumber?.trim()) return { success: false, error: "Tracking number is required" };
    trackingNumber = input.trackingNumber.trim();
  }

  const itemIds = order.items.map((i) => i.id);
  try {
    await prisma.$transaction(async (tx) => {
      const shipment = await tx.shipment.create({
        data: {
          orderId: input.orderId,
          vendorId: input.vendorId,
          supplierId: auth.id,
          courier: input.courier,
          trackingNumber,
          externalRef,
          labelUrl,
          status: "IN_TRANSIT",
        },
      });
      await tx.orderItem.updateMany({
        where: { id: { in: itemIds } },
        data: { shipmentId: shipment.id, fulfillmentStatus: "SHIPPED" },
      });
    });
    await recomputeOrderStatus(input.orderId);
    revalidatePath("/fulfilment");
    revalidatePath("/");
    return { success: true };
  } catch {
    return { success: false, error: "Failed to create shipment" };
  }
}

export async function markDropshipDelivered(shipmentId: string): Promise<{ success: boolean; error?: string }> {
  const auth = await resolveActiveSupplier();
  if ("error" in auth) return { success: false, error: auth.error };

  const shipment = await prisma.shipment
    .findUnique({ where: { id: shipmentId }, select: { supplierId: true, status: true } })
    .catch(() => null);
  if (!shipment || shipment.supplierId !== auth.id) return { success: false, error: "Not found" };
  if (shipment.status === "DELIVERED") return { success: false, error: "Already delivered" };

  try {
    await applyShipmentStatus(shipmentId, "DELIVERED");
    revalidatePath("/fulfilment");
    revalidatePath("/");
    return { success: true };
  } catch {
    return { success: false, error: "Failed to mark delivered" };
  }
}
