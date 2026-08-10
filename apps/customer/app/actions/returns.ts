"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../lib/auth";

const RETURN_WINDOW_MS = 14 * 86_400_000;

export async function requestReturn(
  orderItemId: string,
  reason: string,
): Promise<{ success: boolean; error?: string }> {
  const user = await safeCurrentUser();
  if (!user) return { success: false, error: "Please sign in" };
  const profile = await prisma.customerProfile
    .findUnique({ where: { userId: user.id }, select: { id: true } })
    .catch(() => null);
  if (!profile) return { success: false, error: "Customer profile not found" };

  if (!reason.trim()) return { success: false, error: "Please provide a reason" };

  const item = await prisma.orderItem
    .findUnique({
      where: { id: orderItemId },
      select: {
        quantity: true,
        unitPrice: true,
        variantId: true,
        fulfillmentStatus: true,
        order: { select: { customerId: true, updatedAt: true } },
        shipment: { select: { deliveredAt: true } },
        returns: { select: { status: true } },
      },
    })
    .catch(() => null);
  if (!item) return { success: false, error: "Item not found" };
  if (item.order.customerId !== profile.id) return { success: false, error: "Not your order" };
  if (item.fulfillmentStatus !== "DELIVERED") {
    return { success: false, error: "Only delivered items can be returned" };
  }

  const deliveredAt = item.shipment?.deliveredAt ?? item.order.updatedAt;
  if (Date.now() - new Date(deliveredAt).getTime() > RETURN_WINDOW_MS) {
    return { success: false, error: "The 14-day return window has passed" };
  }
  if (item.returns.some((r) => r.status !== "REJECTED")) {
    return { success: false, error: "A return already exists for this item" };
  }

  try {
    await prisma.return.create({
      data: {
        orderItemId,
        variantId: item.variantId,
        status: "REQUESTED",
        reason: reason.trim(),
        refundAmount: Number(item.unitPrice) * item.quantity,
        isRestocked: false,
      },
    });
    revalidatePath("/orders");
    return { success: true };
  } catch {
    return { success: false, error: "Could not submit return request" };
  }
}
