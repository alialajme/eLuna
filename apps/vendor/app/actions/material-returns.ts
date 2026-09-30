"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@ayvana/db";
import { safeCurrentUser } from "../lib/auth";
import { getVendorByUserId } from "../lib/vendor";

type ActiveVendor = { id: string };

async function resolveActiveVendor(): Promise<{ vendor: ActiveVendor } | { error: string }> {
  const user = await safeCurrentUser();
  if (!user) return { error: "Not signed in" };
  const vendor = await getVendorByUserId(user.id);
  if (!vendor) return { error: "Vendor not found" };
  if (vendor.status !== "ACTIVE") return { error: "Your vendor account is not active" };
  return { vendor: { id: vendor.id } };
}

// A buyer can only return materials they've received — the order must be
// SHIPPED or COMPLETED. (PENDING/ACCEPTED = not yet sent; CANCELLED/REJECTED/
// REFUNDED = nothing to return.)
const RETURNABLE = ["SHIPPED", "COMPLETED"];

export async function requestMaterialReturn(
  orderId: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  const auth = await resolveActiveVendor();
  if ("error" in auth) return { success: false, error: auth.error };

  const trimmed = reason.trim();
  if (trimmed.length < 3) return { success: false, error: "Please describe the reason for the return" };

  const order = await prisma.materialOrder
    .findUnique({
      where: { id: orderId },
      select: {
        vendorId: true,
        supplierId: true,
        status: true,
        total: true,
        items: { select: { quantity: true } },
        materialReturn: { select: { id: true } },
      },
    })
    .catch(() => null);

  if (!order || order.vendorId !== auth.vendor.id) return { success: false, error: "Not found" };
  if (!RETURNABLE.includes(order.status)) {
    return { success: false, error: "This order can't be returned" };
  }
  if (order.materialReturn) return { success: false, error: "A return already exists for this order" };

  const quantity = order.items.reduce((sum, it) => sum + it.quantity, 0);

  try {
    await prisma.materialReturn.create({
      data: {
        orderId,
        vendorId: order.vendorId,
        supplierId: order.supplierId,
        status: "REQUESTED",
        reason: trimmed.slice(0, 500),
        quantity,
        refundAmount: order.total, // Decimal — snapshot of the reversed order total
      },
    });
    revalidatePath("/sourcing/orders");
    revalidatePath(`/sourcing/orders/${orderId}`);
    return { success: true };
  } catch (err) {
    // Unique(orderId) guards the concurrent double-request race.
    if (err instanceof Error && "code" in err && (err as { code?: string }).code === "P2002") {
      return { success: false, error: "A return already exists for this order" };
    }
    return { success: false, error: "Failed to request return" };
  }
}
