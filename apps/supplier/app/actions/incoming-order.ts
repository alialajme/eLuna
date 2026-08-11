"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../lib/auth";
import { getSupplierByUserId } from "../lib/supplier";
import { getCourier } from "@e-luna/ui/couriers";
import { getCourierGateway } from "@e-luna/courier";

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
      // Atomic status guard: only the transaction that flips PENDING→ACCEPTED wins.
      // A concurrent accept that already committed leaves count 0 here — we then
      // roll back the stock this transaction just decremented.
      const accepted = await tx.materialOrder.updateMany({
        where: { id: orderId, status: "PENDING" },
        data: { status: "ACCEPTED" },
      });
      if (accepted.count === 0) {
        await tx.material.update({ where: { id: materialId }, data: { stock: { increment: quantity } } });
        throw new Error("ALREADY_ACCEPTED");
      }
    });
    revalidatePath("/orders");
    revalidatePath(`/orders/${orderId}`);
    revalidatePath("/");
    return { success: true };
  } catch (err) {
    if (err instanceof Error && err.message === "INSUFFICIENT_STOCK") {
      return { success: false, error: "Insufficient stock to accept this order" };
    }
    if (err instanceof Error && err.message === "ALREADY_ACCEPTED") {
      return { success: false, error: "Order is not pending" };
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
  input: { courier: string; trackingNumber?: string; trackingNote?: string }
): Promise<{ success: boolean; error?: string }> {
  const auth = await resolveActiveSupplier();
  if ("error" in auth) return { success: false, error: auth.error };

  const loaded = await loadOwnedOrder(orderId, auth.supplier.id);
  if ("error" in loaded) return { success: false, error: loaded.error };
  if (loaded.order.status !== "ACCEPTED") return { success: false, error: "Order is not accepted" };

  if (!getCourier(input.courier)) return { success: false, error: "Unknown courier" };

  // Destination: Vendor has no structured address model today, so name only (best-effort).
  // Real couriers need a full address — an operator follow-up (docs/deployment/couriers.md).
  const detail = await prisma.materialOrder
    .findUnique({ where: { id: orderId }, select: { vendor: { select: { storeName: true } } } })
    .catch(() => null);

  const result = await getCourierGateway(input.courier).createShipment({
    reference: orderId,
    courier: input.courier,
    destination: {
      name: detail?.vendor.storeName ?? "",
      addressLine1: "",
      city: "",
      emirate: null,
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

  const note = input.trackingNote?.trim().slice(0, 200) || null;

  try {
    // Atomic status guard: only flip ACCEPTED→SHIPPED (a concurrent complete/cancel between the
    // read and here must not be overwritten). Mirrors the acceptMaterialOrder pattern.
    const shipped = await prisma.materialOrder.updateMany({
      where: { id: orderId, status: "ACCEPTED" },
      data: { status: "SHIPPED", courier: input.courier, trackingNumber, externalRef, labelUrl, trackingNote: note },
    });
    if (shipped.count === 0) return { success: false, error: "Order is not accepted" };
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
    // Atomic status guard: only flip SHIPPED→COMPLETED (idempotent with the courier delivery webhook).
    const completed = await prisma.materialOrder.updateMany({
      where: { id: orderId, status: "SHIPPED" },
      data: { status: "COMPLETED" },
    });
    if (completed.count === 0) return { success: false, error: "Order is not shipped" };
    revalidatePath("/orders");
    revalidatePath(`/orders/${orderId}`);
    revalidatePath("/");
    return { success: true };
  } catch {
    return { success: false, error: "Failed to complete order" };
  }
}
