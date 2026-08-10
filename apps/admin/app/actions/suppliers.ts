"use server";

import { revalidatePath } from "next/cache";
import { prisma, type SupplierStatus } from "@e-luna/db";
import { getAuthUser } from "@e-luna/auth";

type ActionResult = { success: true } | { error: string };

async function setSupplierStatus(
  id: string,
  status: SupplierStatus
): Promise<ActionResult> {
  // Defense-in-depth: verify the ADMIN role in the action itself, not just in
  // middleware. Server actions are directly-invocable POST endpoints.
  const user = await getAuthUser();
  if (!user) return { error: "Unauthorized" };
  if (user.role !== "ADMIN") return { error: "Forbidden" };

  try {
    await prisma.supplier.update({ where: { id }, data: { status } });
    revalidatePath("/");
    revalidatePath("/suppliers");
    revalidatePath("/suppliers/approvals");
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Update failed" };
  }
}

export async function approveSupplier(id: string): Promise<ActionResult> {
  return setSupplierStatus(id, "ACTIVE");
}

export async function rejectSupplier(id: string): Promise<ActionResult> {
  return setSupplierStatus(id, "REJECTED");
}

export async function suspendSupplier(id: string): Promise<ActionResult> {
  return setSupplierStatus(id, "SUSPENDED");
}

export async function reactivateSupplier(id: string): Promise<ActionResult> {
  return setSupplierStatus(id, "ACTIVE");
}
