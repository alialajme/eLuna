"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../lib/auth";
import { getSupplierByUserId } from "../lib/supplier";

type ActiveSupplier = { id: string };

async function resolveActiveSupplier(): Promise<{ supplier: ActiveSupplier } | { error: string }> {
  const user = await safeCurrentUser();
  if (!user) return { error: "Not signed in" };
  const supplier = await getSupplierByUserId(user.id);
  if (!supplier) return { error: "Not a supplier" };
  if (supplier.status !== "ACTIVE") return { error: "Your supplier account is not active" };
  return { supplier: { id: supplier.id } };
}

// Loads an order owned by the active supplier and asserts its current status.
async function loadOwnedOrder(
  orderId: string,
  supplierId: string
): Promise<
  | { order: { id: string; status: string; items: { materialId: string | null; quantity: number }[] } }
  | { error: string }
> {
  const order = await prisma.materialOrder
    .findUnique({
      where: { id: orderId },
      select: { id: true, supplierId: true, status: true, items: { select: { materialId: true, quantity: true } } },
    })
    .catch(() => null);
  if (!order || order.supplierId !== supplierId) return { error: "Not found" };
  return { order: { id: order.id, status: order.status, items: order.items } };
}

export async function acceptMaterialOrder(
  orderId: string
): Promise<{ success: boolean; error?: string }> {
  const auth = await resolveActiveSupplier();
  if ("error" in auth) return { success: false, error: auth.error };

  const loaded = await loadOwnedOrder(orderId, auth.supplier.id);
  if ("error" in loaded) return { success: false, error: loaded.error };
  if (loaded.order.status !== "PENDING") return { success: false, error: "Order is not pending" };

  const line = loaded.order.items[0];
  if (!line || !line.materialId) return { success: false, error: "Material no longer available" };
  const materialId = line.materialId;
  const quantity = line.quantity;

  try {
    await prisma.$transaction(async (tx) => {
      // Race-safe stock commit: only decrements if enough stock remains.
      const updated = await tx.material.updateMany({
        where: { id: materialId, stock: { gte: quantity } },
        data: { stock: { decrement: quantity } },
      });
      if (updated.count === 0) throw new Error("INSUFFICIENT_STOCK");
      await tx.materialOrder.update({ where: { id: orderId }, data: { status: "ACCEPTED" } });
    });
    revalidatePath("/orders");
    revalidatePath(`/orders/${orderId}`);
    revalidatePath("/");
    return { success: true };
  } catch (err) {
    if (err instanceof Error && err.message === "INSUFFICIENT_STOCK") {
      return { success: false, error: "Insufficient stock to accept this order" };
    }
    return { success: false, error: "Failed to accept order" };
  }
}

export async function rejectMaterialOrder(
  orderId: string
): Promise<{ success: boolean; error?: string }> {
  const auth = await resolveActiveSupplier();
  if ("error" in auth) return { success: false, error: auth.error };

  const loaded = await loadOwnedOrder(orderId, auth.supplier.id);
  if ("error" in loaded) return { success: false, error: loaded.error };
  if (loaded.order.status !== "PENDING") return { success: false, error: "Order is not pending" };

  try {
    await prisma.materialOrder.update({ where: { id: orderId }, data: { status: "REJECTED" } });
    revalidatePath("/orders");
    revalidatePath(`/orders/${orderId}`);
    revalidatePath("/");
    return { success: true };
  } catch {
    return { success: false, error: "Failed to reject order" };
  }
}

export async function shipMaterialOrder(
  orderId: string,
  trackingNote?: string
): Promise<{ success: boolean; error?: string }> {
  const auth = await resolveActiveSupplier();
  if ("error" in auth) return { success: false, error: auth.error };

  const loaded = await loadOwnedOrder(orderId, auth.supplier.id);
  if ("error" in loaded) return { success: false, error: loaded.error };
  if (loaded.order.status !== "ACCEPTED") return { success: false, error: "Order is not accepted" };

  const note = trackingNote?.trim().slice(0, 200) || null;

  try {
    await prisma.materialOrder.update({
      where: { id: orderId },
      data: { status: "SHIPPED", trackingNote: note },
    });
    revalidatePath("/orders");
    revalidatePath(`/orders/${orderId}`);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to mark shipped" };
  }
}

export async function completeMaterialOrder(
  orderId: string
): Promise<{ success: boolean; error?: string }> {
  const auth = await resolveActiveSupplier();
  if ("error" in auth) return { success: false, error: auth.error };

  const loaded = await loadOwnedOrder(orderId, auth.supplier.id);
  if ("error" in loaded) return { success: false, error: loaded.error };
  if (loaded.order.status !== "SHIPPED") return { success: false, error: "Order is not shipped" };

  try {
    await prisma.materialOrder.update({ where: { id: orderId }, data: { status: "COMPLETED" } });
    revalidatePath("/orders");
    revalidatePath(`/orders/${orderId}`);
    revalidatePath("/");
    return { success: true };
  } catch {
    return { success: false, error: "Failed to complete order" };
  }
}
