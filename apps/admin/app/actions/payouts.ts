"use server";

import { revalidatePath } from "next/cache";
import {
  prisma,
  type PayoutStatus,
  createVendorPayout,
  appendLedgerEntry,
  assertPayoutTransition,
  isDomainError,
} from "@e-luna/db";
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

export async function createPayout(vendorId: string): Promise<ActionResult> {
  const auth = await requireAdmin();
  if ("error" in auth) return auth;

  const vendor = await prisma.vendor
    .findUnique({ where: { id: vendorId }, select: { ibanNumber: true } })
    .catch(() => null);
  if (!vendor) return { error: "Vendor not found" };
  if (!vendor.ibanNumber) return { error: "Vendor has no IBAN on file" };

  try {
    // Race-safe, Decimal, reserved-aware payout creation lives in @e-luna/db so
    // the concurrency guarantee is unit-tested and this action stays thin.
    const result = await createVendorPayout(vendorId, vendor.ibanNumber);
    if (!result.ok) return { error: "No balance available to pay out" };
    revalidatePath("/payouts");
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Create failed" };
  }
}

async function setPayoutStatus(
  id: string,
  status: PayoutStatus,
  setProcessedAt: boolean,
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if ("error" in auth) return auth;

  try {
    await prisma.$transaction(async (tx) => {
      const current = await tx.payout.findUnique({
        where: { id },
        select: { status: true, vendorId: true, amount: true },
      });
      if (!current) throw new Error("NOT_FOUND");
      // Reject illegal transitions (e.g. COMPLETED -> PROCESSING) so a settled
      // payout can never revert and be paid again.
      assertPayoutTransition(current.status, status);

      await tx.payout.update({
        where: { id },
        data: setProcessedAt ? { status, processedAt: new Date() } : { status },
      });

      // Money actually leaves the platform on COMPLETED — post the immutable
      // debit to the financial ledger inside the same transaction.
      if (status === "COMPLETED") {
        await appendLedgerEntry(tx, {
          vendorId: current.vendorId,
          entryType: "PAYOUT",
          amount: current.amount.negated(),
          payoutId: id,
          note: "Payout completed",
        });
      }
    });
    revalidatePath("/payouts");
    return { success: true };
  } catch (err) {
    if (err instanceof Error && err.message === "NOT_FOUND") return { error: "Payout not found" };
    if (isDomainError(err)) return { error: "That payout status change isn't allowed." };
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
