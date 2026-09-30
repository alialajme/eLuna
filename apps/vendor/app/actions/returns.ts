"use server";

import { revalidatePath } from "next/cache";
import {
  prisma,
  recomputeOrderStatus,
  assertPaymentTransition,
  appendLedgerEntry,
  computeRefundBreakdown,
  money,
  writeAuditLog,
} from "@ayvana/db";
import { getGateway } from "@ayvana/payments";
import { safeCurrentUser } from "../lib/auth";
import { getVendorByUserId } from "../lib/vendor";

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
  orderItem: { id: string; orderId: string; variantId: string; quantity: number; unitPrice: unknown };
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
          select: { id: true, orderId: true, variantId: true, quantity: true, unitPrice: true, vendorId: true },
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
        unitPrice: ret.orderItem.unitPrice,
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
        paymentTransactions: { select: { id: true, externalRef: true, status: true }, take: 1 },
        items: { select: { id: true, fulfillmentStatus: true } },
      },
    })
    .catch(() => null);
  if (!order) return { success: false, error: "Order not found" };
  const tx = order.paymentTransactions[0] ?? null;

  // Bound the refund to what was captured for the item and split it into the
  // vendor's net reversal + the platform's commission reversal. Throws (caught)
  // if the stored refundAmount somehow exceeds the item's captured value.
  const vendor = await prisma.vendor
    .findUnique({ where: { id: a.vendorId }, select: { commissionRate: true } })
    .catch(() => null);
  const capturedItemValue = money(String(orderItem.unitPrice)).mul(orderItem.quantity);
  let breakdown;
  try {
    breakdown = computeRefundBreakdown(
      String(refundAmount),
      capturedItemValue,
      vendor?.commissionRate ?? "0.15",
    );
  } catch {
    return { success: false, error: "Refund amount exceeds the captured item value" };
  }

  // Only issue a real (money-moving) refund when the payment was actually
  // captured. An uncaptured payment (e.g. a COD order whose cash was never
  // collected, or a card intent that never settled) has taken no money, so we
  // process the return WITHOUT calling the gateway and WITHOUT flipping the
  // payment to REFUNDED — refunding money that was never taken is a bug.
  const captured = tx?.status === "CAPTURED" || tx?.status === "PARTIALLY_REFUNDED";

  if (captured && tx) {
    // Money first — abort with no state change if the gateway refund fails.
    const gw = getGateway(order.paymentMethod);
    const refund = await gw.refund({ externalRef: tx.externalRef ?? "", amount: Number(breakdown.gross) });
    if (!refund.success) return { success: false, error: refund.error ?? "Refund failed" };
  }

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
      if (captured && tx) {
        const target = allReturned ? "REFUNDED" : "PARTIALLY_REFUNDED";
        // Defense-in-depth: reject an illegal payment transition (e.g. a double
        // refund) rather than silently corrupting the financial record.
        assertPaymentTransition(tx.status, target);
        await dbtx.paymentTransaction.update({
          where: { id: tx.id },
          data: { status: target },
        });
        // Immutable audit entries: reverse the vendor's net revenue and the
        // platform's commission for the refunded item.
        await appendLedgerEntry(dbtx, {
          vendorId: a.vendorId!,
          entryType: "REFUND",
          amount: breakdown.net.negated(),
          orderId: orderItem.orderId,
          orderItemId: orderItem.id,
          note: "Vendor net revenue reversed on refund",
        });
        await appendLedgerEntry(dbtx, {
          vendorId: a.vendorId!,
          entryType: "COMMISSION",
          amount: breakdown.commission.negated(),
          orderId: orderItem.orderId,
          orderItemId: orderItem.id,
          note: "Platform commission reversed on refund",
        });
      }

      // Immutable audit trail of the refund, atomic with it.
      await writeAuditLog(dbtx, {
        actorRole: "VENDOR",
        action: "refund.issued",
        targetType: "Return",
        targetId: id,
        metadata: {
          vendorId: a.vendorId!,
          orderId: orderItem.orderId,
          orderItemId: orderItem.id,
          gross: breakdown.gross.toString(),
          moneyMoved: captured,
        },
      });
    });
    await recomputeOrderStatus(orderItem.orderId);
    revalidatePath("/returns");
    return { success: true };
  } catch {
    return { success: false, error: "Refund issued but records failed to update — contact support" };
  }
}
