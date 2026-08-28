import { prisma, releaseStockTx } from "@e-luna/db";
import type { WebhookResult } from "./gateway";

/**
 * Idempotently apply a payment outcome to an order. Only orders currently in
 * PENDING are transitioned, so webhook re-delivery and the sync reconciler are
 * both safe to call repeatedly.
 */
export async function applyPaymentResult(result: WebhookResult): Promise<void> {
  if (result.kind === "ignored" || !result.orderId) return;

  const order = await prisma.order
    .findUnique({ where: { id: result.orderId }, select: { id: true, status: true } })
    .catch(() => null);
  if (!order || order.status !== "PENDING") return;

  if (result.kind === "payment_succeeded") {
    await prisma.$transaction([
      prisma.order.update({ where: { id: order.id }, data: { status: "CONFIRMED" } }),
      prisma.paymentTransaction.updateMany({
        where: { orderId: order.id, status: "PENDING" },
        data: {
          status: "CAPTURED",
          ...(result.walletType ? { metadata: { walletType: result.walletType } } : {}),
        },
      }),
    ]);
  } else if (result.kind === "payment_failed") {
    // Release the inventory reserved when the PENDING order was created. The
    // `order.status === "PENDING"` guard above makes this run at most once, so
    // stock is never double-released on webhook re-delivery.
    const items = await prisma.orderItem.findMany({
      where: { orderId: order.id },
      select: { variantId: true, quantity: true },
    });
    await prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id: order.id }, data: { status: "CANCELLED" } });
      await tx.paymentTransaction.updateMany({
        where: { orderId: order.id, status: "PENDING" },
        data: { status: "FAILED" },
      });
      await releaseStockTx(tx, items);
    });
  }
}
