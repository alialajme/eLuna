import { prisma } from "@e-luna/db";
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
    await prisma.$transaction([
      prisma.order.update({ where: { id: order.id }, data: { status: "CANCELLED" } }),
      prisma.paymentTransaction.updateMany({
        where: { orderId: order.id, status: "PENDING" },
        data: { status: "FAILED" },
      }),
    ]);
  }
}
