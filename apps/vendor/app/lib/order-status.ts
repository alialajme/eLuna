import { prisma } from "@e-luna/db";

const AGGREGATE_RANGE = ["CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"];

export async function recomputeOrderStatus(orderId: string): Promise<void> {
  const order = await prisma.order
    .findUnique({
      where: { id: orderId },
      select: { status: true, items: { select: { fulfillmentStatus: true } } },
    })
    .catch(() => null);
  if (!order) return;
  if (!AGGREGATE_RANGE.includes(order.status)) return; // never touch PENDING/CANCELLED/REFUNDED

  const s = order.items.map((i) => i.fulfillmentStatus);
  const next =
    s.length > 0 && s.every((x) => x === "RETURNED")
      ? "REFUNDED"
      : s.length > 0 && s.every((x) => x === "DELIVERED" || x === "RETURNED")
        ? "DELIVERED"
        : s.some((x) => x === "SHIPPED" || x === "DELIVERED")
          ? "SHIPPED"
          : s.some((x) => x === "PROCESSING")
            ? "PROCESSING"
            : "CONFIRMED";

  if (next !== order.status) {
    await prisma.order.update({ where: { id: orderId }, data: { status: next } }).catch(() => null);
  }
}
