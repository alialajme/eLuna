"use server";

import { revalidatePath } from "next/cache";
import { prisma, type PayoutStatus } from "@e-luna/db";
import { getAuthUser } from "@e-luna/auth";

type ActionResult = { success: true } | { error: string };

async function requireAdmin(): Promise<{ ok: true } | ActionResult> {
  // Defense-in-depth: verify the ADMIN role in the action itself, not just in
  // middleware. Server actions are directly-invocable POST endpoints, so route
  // gating alone would leave these updates open to any authenticated user.
  const user = await getAuthUser();
  if (!user) return { error: "Unauthorized" };
  if (user.role !== "ADMIN") return { error: "Forbidden" };
  return { ok: true };
}

async function computeAvailableBalance(vendorId: string): Promise<number> {
  // Fetch delivered order items and completed payouts in parallel.
  const [items, payouts] = await Promise.all([
    prisma.orderItem
      .findMany({
        where: { vendorId, fulfillmentStatus: "DELIVERED" },
        select: { unitPrice: true, quantity: true },
      })
      .catch(() => []),
    prisma.payout
      .findMany({
        where: { vendorId, status: "COMPLETED" },
        select: { amount: true },
      })
      .catch(() => []),
  ]);

  // Fetch vendor commission rate.
  const vendor = await prisma.vendor
    .findUnique({ where: { id: vendorId }, select: { commissionRate: true } })
    .catch(() => null);

  const commissionRate = Number(vendor?.commissionRate ?? 0.15);
  const grossRevenue = items.reduce(
    (sum, i) => sum + Number(i.unitPrice) * i.quantity,
    0
  );
  const netEarned = grossRevenue - grossRevenue * commissionRate;
  const paidOut = payouts.reduce((sum, p) => sum + Number(p.amount), 0);
  return Math.max(0, netEarned - paidOut);
}

export async function createPayout(vendorId: string): Promise<ActionResult> {
  const auth = await requireAdmin();
  if ("error" in auth) return auth;

  // Fetch vendor and verify IBAN on file.
  const vendor = await prisma.vendor
    .findUnique({ where: { id: vendorId }, select: { ibanNumber: true } })
    .catch(() => null);
  if (!vendor) return { error: "Vendor not found" };
  if (!vendor.ibanNumber) return { error: "Vendor has no IBAN on file" };

  // Compute available balance server-side; never trust client amount.
  const availableBalance = await computeAvailableBalance(vendorId);
  if (availableBalance <= 0) {
    return { error: "No balance available to pay out" };
  }

  try {
    await prisma.payout.create({
      data: {
        vendorId,
        amount: availableBalance,
        currency: "AED",
        ibanNumber: vendor.ibanNumber,
        status: "PENDING",
      },
    });
    revalidatePath("/payouts");
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Create failed" };
  }
}

async function setPayoutStatus(
  id: string,
  status: PayoutStatus,
  setProcessedAt: boolean
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if ("error" in auth) return auth;

  try {
    await prisma.payout.update({
      where: { id },
      data: setProcessedAt ? { status, processedAt: new Date() } : { status },
    });
    revalidatePath("/payouts");
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Update failed" };
  }
}

export async function markProcessing(id: string): Promise<ActionResult> {
  return setPayoutStatus(id, "PROCESSING", false);
}

export async function markCompleted(id: string): Promise<ActionResult> {
  return setPayoutStatus(id, "COMPLETED", true);
}

export async function markFailed(id: string): Promise<ActionResult> {
  return setPayoutStatus(id, "FAILED", false);
}
