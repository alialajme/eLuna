"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@e-luna/db";
import { getGateway } from "@e-luna/payments";
import { safeCurrentUser } from "../lib/auth";
import { getVendorByUserId } from "../lib/vendor";
import { recomputeOrderStatus } from "../lib/order-status";

type Result = { success: boolean; error?: string };

async function resolveVendorId(): Promise<{ vendorId?: string; error?: string }> {
  const user = await safeCurrentUser();
  if (!user) return { error: "Not signed in" };
  const vendor = await getVendorByUserId(user.id);
  if (!vendor) return { error: "Vendor not found" };
  return { vendorId: vendor.id };
}

type OwnedReturn = {
  id: string;
  refundAmount: unknown;
  orderItem: { id: string; orderId: string; variantId: string; quantity: number };
};

async function loadOwnedReturn(
  returnId: string,
  vendorId: string,
  expected: string,
): Promise<{ data?: OwnedReturn; error?: string }> {
  const ret = await prisma.return
    .findUnique({
      where: { id: returnId },
      select: {
        id: true,
        status: true,
        refundAmount: true,
        orderItem: {
          select: { id: true, orderId: true, variantId: true, quantity: true, vendorId: true },
        },
      },
    })
    .catch(() => null);
  if (!ret) return { error: "Return not found" };
  if (ret.orderItem.vendorId !== vendorId) return { error: "Unauthorized" };
  if (ret.status !== expected) return { error: "Invalid status for this action" };
  return {
    data: {
      id: ret.id,
      refundAmount: ret.refundAmount,
      orderItem: {
        id: ret.orderItem.id,
        orderId: ret.orderItem.orderId,
        variantId: ret.orderItem.variantId,
        quantity: ret.orderItem.quantity,
      },
    },
  };
}

export async function approveReturn(returnId: string, notes?: string): Promise<Result> {
  const a = await resolveVendorId();
  if (!a.vendorId) return { success: false, error: a.error };
  const l = await loadOwnedReturn(returnId, a.vendorId, "REQUESTED");
  if (!l.data) return { success: false, error: l.error };
  try {
    await prisma.return.update({ where: { id: returnId }, data: { status: "APPROVED", approvalNotes: notes ?? null } });
    revalidatePath("/returns");
    return { success: true };
  } catch {
    return { success: false, error: "Failed to approve" };
  }
}

export async function rejectReturn(returnId: string, notes?: string): Promise<Result> {
  const a = await resolveVendorId();
  if (!a.vendorId) return { success: false, error: a.error };
  const l = await loadOwnedReturn(returnId, a.vendorId, "REQUESTED");
  if (!l.data) return { success: false, error: l.error };
  try {
    await prisma.return.update({ where: { id: returnId }, data: { status: "REJECTED", approvalNotes: notes ?? null } });
    revalidatePath("/returns");
    return { success: true };
  } catch {
    return { success: false, error: "Failed to reject" };
  }
}

export async function markReturnReceived(returnId: string): Promise<Result> {
  const a = await resolveVendorId();
  if (!a.vendorId) return { success: false, error: a.error };
  const l = await loadOwnedReturn(returnId, a.vendorId, "APPROVED");
  if (!l.data) return { success: false, error: l.error };
  try {
    await prisma.return.update({ where: { id: returnId }, data: { status: "RECEIVED" } });
    revalidatePath("/returns");
    return { success: true };
  } catch {
    return { success: false, error: "Failed to update" };
  }
}

export async function refundReturn(returnId: string, restock: boolean): Promise<Result> {
  const a = await resolveVendorId();
  if (!a.vendorId) return { success: false, error: a.error };
  const l = await loadOwnedReturn(returnId, a.vendorId, "RECEIVED");
  if (!l.data) return { success: false, error: l.error };
  const { id, refundAmount, orderItem } = l.data;

  const order = await prisma.order
    .findUnique({
      where: { id: orderItem.orderId },
      select: {
        paymentMethod: true,
        paymentTransactions: { select: { id: true, externalRef: true }, take: 1 },
        items: { select: { id: true, fulfillmentStatus: true } },
      },
    })
    .catch(() => null);
  if (!order) return { success: false, error: "Order not found" };
  const tx = order.paymentTransactions[0] ?? null;

  // Money first — abort with no state change if the gateway refund fails.
  const gw = getGateway(order.paymentMethod);
  const refund = await gw.refund({ externalRef: tx?.externalRef ?? "", amount: Number(refundAmount) });
  if (!refund.success) return { success: false, error: refund.error ?? "Refund failed" };

  const allReturned = order.items.every(
    (i) => i.id === orderItem.id || i.fulfillmentStatus === "RETURNED",
  );

  try {
    await prisma.$transaction(async (dbtx) => {
      await dbtx.return.update({ where: { id }, data: { status: "REFUNDED", isRestocked: restock } });
      await dbtx.orderItem.update({ where: { id: orderItem.id }, data: { fulfillmentStatus: "RETURNED" } });
      if (restock) {
        await dbtx.productVariant.update({
          where: { id: orderItem.variantId },
          data: { stock: { increment: orderItem.quantity } },
        });
      }
      if (tx) {
        await dbtx.paymentTransaction.update({
          where: { id: tx.id },
          data: { status: allReturned ? "REFUNDED" : "PARTIALLY_REFUNDED" },
        });
      }
    });
    await recomputeOrderStatus(orderItem.orderId);
    revalidatePath("/returns");
    return { success: true };
  } catch {
    return { success: false, error: "Refund issued but records failed to update — contact support" };
  }
}
