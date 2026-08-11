"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@e-luna/db";
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

export async function createMaterialOrder(
  materialId: string,
  quantity: number,
  note?: string
): Promise<{ success: boolean; id?: string; error?: string }> {
  const auth = await resolveActiveVendor();
  if ("error" in auth) return { success: false, error: auth.error };

  const material = await prisma.material
    .findUnique({
      where: { id: materialId },
      include: { supplier: { select: { id: true, status: true } } },
    })
    .catch(() => null);

  if (!material || material.status !== "ACTIVE" || material.supplier.status !== "ACTIVE") {
    return { success: false, error: "Material is not available" };
  }
  if (!Number.isInteger(quantity) || quantity < material.moq) {
    return { success: false, error: `Minimum order quantity is ${material.moq}` };
  }
  if (quantity > material.stock) {
    return { success: false, error: `Only ${material.stock} in stock` };
  }
  const trimmedNote = note?.trim().slice(0, 500) || null;
  // Keep money in Decimal (no float multiply) — wholesalePrice is a Prisma.Decimal.
  const unitPrice = material.wholesalePrice;
  const total = unitPrice.mul(quantity);

  try {
    const order = await prisma.materialOrder.create({
      data: {
        vendorId: auth.vendor.id,
        supplierId: material.supplier.id,
        total,
        note: trimmedNote,
        items: {
          create: [
            {
              materialId: material.id,
              materialName: material.name,
              unit: material.unit,
              unitPrice,
              quantity,
            },
          ],
        },
      },
      select: { id: true },
    });
    revalidatePath("/sourcing/orders");
    return { success: true, id: order.id };
  } catch {
    return { success: false, error: "Failed to place order" };
  }
}

export async function cancelMaterialOrder(
  orderId: string
): Promise<{ success: boolean; error?: string }> {
  const auth = await resolveActiveVendor();
  if ("error" in auth) return { success: false, error: auth.error };

  const order = await prisma.materialOrder
    .findUnique({ where: { id: orderId }, select: { vendorId: true, status: true } })
    .catch(() => null);
  if (!order || order.vendorId !== auth.vendor.id) return { success: false, error: "Not found" };
  if (order.status !== "PENDING") return { success: false, error: "Only pending orders can be cancelled" };

  try {
    await prisma.materialOrder.update({ where: { id: orderId }, data: { status: "CANCELLED" } });
    revalidatePath("/sourcing/orders");
    revalidatePath(`/sourcing/orders/${orderId}`);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to cancel order" };
  }
}
