"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../lib/auth";
import { getVendorByUserId } from "../lib/vendor";

const STATUS_ORDER = ["PENDING", "PROCESSING", "SHIPPED", "DELIVERED"] as const;
type ForwardStatus = "PROCESSING" | "SHIPPED" | "DELIVERED";

export async function updateFulfillmentStatus(
  orderItemId: string,
  status: ForwardStatus
): Promise<{ success: boolean; error?: string }> {
  const user = await safeCurrentUser();
  if (!user) return { success: false, error: "Not signed in" };

  const vendor = await getVendorByUserId(user.id);
  if (!vendor) return { success: false, error: "Vendor not found" };

  const item = await prisma.orderItem
    .findUnique({
      where: { id: orderItemId },
      select: { vendorId: true, fulfillmentStatus: true, orderId: true },
    })
    .catch(() => null);

  if (!item) return { success: false, error: "Order item not found" };
  if (item.vendorId !== vendor.id) return { success: false, error: "Unauthorized" };

  const currentIndex = STATUS_ORDER.indexOf(
    item.fulfillmentStatus as (typeof STATUS_ORDER)[number]
  );
  const nextIndex = STATUS_ORDER.indexOf(status);
  if (nextIndex <= currentIndex) {
    return { success: false, error: "Invalid status transition" };
  }

  try {
    await prisma.orderItem.update({
      where: { id: orderItemId },
      data: { fulfillmentStatus: status },
    });
    revalidatePath("/orders");
    revalidatePath(`/orders/${item.orderId}`);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to update status" };
  }
}
