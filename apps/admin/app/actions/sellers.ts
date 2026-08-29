"use server";

import { revalidatePath } from "next/cache";
import { prisma, type VendorStatus, writeAuditLog } from "@e-luna/db";
import { getAuthUser } from "@e-luna/auth";

type ActionResult = { success: true } | { error: string };

async function setVendorStatus(
  id: string,
  status: VendorStatus
): Promise<ActionResult> {
  // Defense-in-depth: verify the ADMIN role in the action itself, not just in
  // middleware. Server actions are directly-invocable POST endpoints, so route
  // gating alone would leave this update open to any authenticated user.
  const user = await getAuthUser();
  if (!user) return { error: "Unauthorized" };
  if (user.role !== "ADMIN") return { error: "Forbidden" };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.vendor.update({ where: { id }, data: { status } });
      // Immutable audit trail of the vendor-status change, atomic with it.
      await writeAuditLog(tx, {
        actorId: user.userId,
        actorRole: user.role,
        action: `vendor.status.${status.toLowerCase()}`,
        targetType: "Vendor",
        targetId: id,
        metadata: { status },
      });
    });
    revalidatePath("/");
    revalidatePath("/sellers");
    revalidatePath("/sellers/approvals");
    revalidatePath(`/sellers/${id}`);
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Update failed" };
  }
}

export async function approveVendor(id: string): Promise<ActionResult> {
  return setVendorStatus(id, "ACTIVE");
}

export async function rejectVendor(id: string): Promise<ActionResult> {
  return setVendorStatus(id, "REJECTED");
}

export async function suspendVendor(id: string): Promise<ActionResult> {
  return setVendorStatus(id, "SUSPENDED");
}

export async function reactivateVendor(id: string): Promise<ActionResult> {
  return setVendorStatus(id, "ACTIVE");
}
