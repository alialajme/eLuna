"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@ayvana/db";
import { safeCurrentUser } from "../lib/auth";
import { getSupplierByUserId } from "../lib/supplier";

type ActiveSupplier = { id: string };
type Result = { success: boolean; error?: string };

async function resolveActiveSupplier(): Promise<{ supplier: ActiveSupplier } | { error: string }> {
  const user = await safeCurrentUser();
  if (!user) return { error: "Not signed in" };
  const supplier = await getSupplierByUserId(user.id);
  if (!supplier) return { error: "Not a supplier" };
  if (supplier.status !== "ACTIVE") return { error: "Your supplier account is not active" };
  return { supplier: { id: supplier.id } };
}

async function loadOwnedReturn(
  returnId: string,
  supplierId: string
): Promise<{ ret: { id: string; status: string; orderId: string } } | { error: string }> {
  const ret = await prisma.materialReturn
    .findUnique({ where: { id: returnId }, select: { id: true, supplierId: true, status: true, orderId: true } })
    .catch(() => null);
  if (!ret || ret.supplierId !== supplierId) return { error: "Not found" };
  return { ret: { id: ret.id, status: ret.status, orderId: ret.orderId } };
}

function revalidate(orderId: string) {
  revalidatePath("/returns");
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/");
}

// Atomic status transition: only the caller that flips `from → to` wins, so a
// concurrent duplicate action can't advance the same return twice.
async function transition(
  returnId: string,
  from: string,
  to: "APPROVED" | "REJECTED" | "RECEIVED",
  resolutionNote: string | null,
  orderId: string
): Promise<Result> {
  try {
    const updated = await prisma.materialReturn.updateMany({
      where: { id: returnId, status: from as never },
      data: { status: to, ...(resolutionNote !== null ? { resolutionNote } : {}) },
    });
    if (updated.count === 0) return { success: false, error: "That return status change isn't allowed" };
    revalidate(orderId);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to update return" };
  }
}

export async function approveMaterialReturn(returnId: string, note?: string): Promise<Result> {
  const auth = await resolveActiveSupplier();
  if ("error" in auth) return { success: false, error: auth.error };
  const loaded = await loadOwnedReturn(returnId, auth.supplier.id);
  if ("error" in loaded) return { success: false, error: loaded.error };
  return transition(returnId, "REQUESTED", "APPROVED", note?.trim().slice(0, 300) || null, loaded.ret.orderId);
}

export async function rejectMaterialReturn(returnId: string, note?: string): Promise<Result> {
  const auth = await resolveActiveSupplier();
  if ("error" in auth) return { success: false, error: auth.error };
  const loaded = await loadOwnedReturn(returnId, auth.supplier.id);
  if ("error" in loaded) return { success: false, error: loaded.error };
  return transition(returnId, "REQUESTED", "REJECTED", note?.trim().slice(0, 300) || null, loaded.ret.orderId);
}

export async function markMaterialReturnReceived(returnId: string): Promise<Result> {
  const auth = await resolveActiveSupplier();
  if ("error" in auth) return { success: false, error: auth.error };
  const loaded = await loadOwnedReturn(returnId, auth.supplier.id);
  if ("error" in loaded) return { success: false, error: loaded.error };
  return transition(returnId, "APPROVED", "RECEIVED", null, loaded.ret.orderId);
}

/**
 * Complete the return: RECEIVED → REFUNDED, flip the parent order to REFUNDED
 * (which drops its total from the supplier's `earned` balance), and optionally
 * restock the returned quantity. No money moves (PO-record model — wholesale
 * settlement is offline); the refund is a bookkeeping reversal.
 */
export async function refundMaterialReturn(returnId: string, restock: boolean): Promise<Result> {
  const auth = await resolveActiveSupplier();
  if ("error" in auth) return { success: false, error: auth.error };
  const loaded = await loadOwnedReturn(returnId, auth.supplier.id);
  if ("error" in loaded) return { success: false, error: loaded.error };
  if (loaded.ret.status !== "RECEIVED") return { success: false, error: "Return must be marked received first" };

  const orderId = loaded.ret.orderId;

  try {
    await prisma.$transaction(async (tx) => {
      // Atomic return guard — only the tx that flips RECEIVED→REFUNDED proceeds.
      const done = await tx.materialReturn.updateMany({
        where: { id: returnId, status: "RECEIVED" },
        data: { status: "REFUNDED", isRestocked: restock },
      });
      if (done.count === 0) throw new Error("ALREADY_REFUNDED");

      // Reverse the earning: a REFUNDED order is excluded from computeSupplierBalance.
      const flipped = await tx.materialOrder.updateMany({
        where: { id: orderId, status: { in: ["SHIPPED", "COMPLETED"] } },
        data: { status: "REFUNDED" },
      });
      if (flipped.count === 0) throw new Error("ORDER_STATE");

      if (restock) {
        const items = await tx.materialOrderItem.findMany({
          where: { orderId },
          select: { materialId: true, quantity: true },
        });
        for (const it of items) {
          if (it.materialId) {
            // updateMany (not update) so a since-deleted material is a no-op, not a throw.
            await tx.material.updateMany({
              where: { id: it.materialId },
              data: { stock: { increment: it.quantity } },
            });
          }
        }
      }
    });
    revalidate(orderId);
    return { success: true };
  } catch (err) {
    if (err instanceof Error && err.message === "ALREADY_REFUNDED") {
      return { success: false, error: "Return already refunded" };
    }
    if (err instanceof Error && err.message === "ORDER_STATE") {
      return { success: false, error: "Order is no longer in a refundable state" };
    }
    return { success: false, error: "Failed to refund return" };
  }
}
