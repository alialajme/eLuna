import { prisma } from "@e-luna/db";

/** Idempotently move a shipped material order to COMPLETED on courier delivery. No-op otherwise. */
export async function applyMaterialOrderDelivery(materialOrderId: string): Promise<void> {
  await prisma.materialOrder
    .updateMany({ where: { id: materialOrderId, status: "SHIPPED" }, data: { status: "COMPLETED" } })
    .catch(() => null);
}
