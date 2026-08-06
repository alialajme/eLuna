"use server";

import { revalidatePath } from "next/cache";
import { prisma, type VendorStatus } from "@e-luna/db";
import { safeCurrentUser } from "../lib/auth";

type ActionResult = { success: true } | { error: string };

async function setVendorStatus(
  id: string,
  status: VendorStatus
): Promise<ActionResult> {
  const user = await safeCurrentUser();
  if (!user) return { error: "Unauthorized" };

  try {
    await prisma.vendor.update({ where: { id }, data: { status } });
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
