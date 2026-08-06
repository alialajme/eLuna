"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@e-luna/db";
import { getAuthUser } from "@e-luna/auth";

type ActionResult = { success: true } | { error: string };

export async function updateCommissionRate(
  vendorId: string,
  percent: number
): Promise<ActionResult> {
  const user = await getAuthUser();
  if (!user) return { error: "Unauthorized" };
  if (user.role !== "ADMIN") return { error: "Forbidden" };

  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    return { error: "Rate must be between 0 and 100" };
  }

  try {
    await prisma.vendor.update({
      where: { id: vendorId },
      data: { commissionRate: percent / 100 },
    });
    revalidatePath("/commissions");
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Update failed" };
  }
}
