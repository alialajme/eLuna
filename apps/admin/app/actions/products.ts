"use server";

import { revalidatePath } from "next/cache";
import { prisma, type ProductStatus } from "@e-luna/db";
import { getAuthUser } from "@e-luna/auth";

type ActionResult = { success: true } | { error: string };

async function setProductStatus(
  id: string,
  status: ProductStatus
): Promise<ActionResult> {
  // Defense-in-depth: verify the ADMIN role in the action itself, not just in
  // middleware. Server actions are directly-invocable POST endpoints.
  const user = await getAuthUser();
  if (!user) return { error: "Unauthorized" };
  if (user.role !== "ADMIN") return { error: "Forbidden" };

  try {
    await prisma.product.update({ where: { id }, data: { status } });
    revalidatePath("/products");
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Update failed" };
  }
}

export async function rejectProduct(id: string): Promise<ActionResult> {
  return setProductStatus(id, "REJECTED");
}

export async function reinstateProduct(id: string): Promise<ActionResult> {
  return setProductStatus(id, "ACTIVE");
}
