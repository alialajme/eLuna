"use server";

import { revalidatePath } from "next/cache";
import {
  prisma,
  type PayoutStatus,
  createSupplierPayout,
  assertPayoutTransition,
  isDomainError,
  writeAuditLog,
  auditSafe,
} from "@ayvana/db";
import { getAuthUser } from "@ayvana/auth";

type ActionResult = { success: true } | { error: string };
type AdminActor = { userId: string; role: string | null };

async function requireAdmin(): Promise<{ ok: true; actor: AdminActor } | { error: string }> {
  // Defense-in-depth: verify ADMIN in the action itself (server actions are
  // directly-invocable POST endpoints), not just in middleware.
  const user = await getAuthUser();
  if (!user) return { error: "Unauthorized" };
  if (user.role !== "ADMIN") return { error: "Forbidden" };
  return { ok: true, actor: { userId: user.userId, role: user.role } };
}

export async function createPayout(supplierId: string): Promise<ActionResult> {
  const auth = await requireAdmin();
  if ("error" in auth) return auth;

  const supplier = await prisma.supplier
    .findUnique({ where: { id: supplierId }, select: { ibanNumber: true } })
    .catch(() => null);
  if (!supplier) return { error: "Supplier not found" };
  if (!supplier.ibanNumber) return { error: "Supplier has no IBAN on file" };

  try {
    // Race-safe, Decimal, reserved-aware creation lives in @ayvana/db so the
    // concurrency guarantee is unit-tested and this action stays thin.
    const result = await createSupplierPayout(supplierId, supplier.ibanNumber);
    if (!result.ok) return { error: "No balance available to pay out" };
    await auditSafe({
      actorId: auth.actor.userId,
      actorRole: auth.actor.role,
      action: "supplier_payout.created",
      targetType: "SupplierPayout",
      targetId: result.payoutId,
      metadata: { supplierId, amount: result.amount.toString() },
    });
    revalidatePath("/supplier-payouts");
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Create failed" };
  }
}

async function setStatus(id: string, status: PayoutStatus, setProcessedAt: boolean): Promise<ActionResult> {
  const auth = await requireAdmin();
  if ("error" in auth) return auth;

  try {
    await prisma.$transaction(async (tx) => {
      const current = await tx.supplierPayout.findUnique({
        where: { id },
        select: { status: true, supplierId: true, amount: true },
      });
      if (!current) throw new Error("NOT_FOUND");
      // Reject illegal transitions (e.g. COMPLETED -> PROCESSING) so a settled
      // payout can never revert and be paid again.
      assertPayoutTransition(current.status, status);

      await tx.supplierPayout.update({
        where: { id },
        data: setProcessedAt ? { status, processedAt: new Date() } : { status },
      });

      await writeAuditLog(tx, {
        actorId: auth.actor.userId,
        actorRole: auth.actor.role,
        action: `supplier_payout.${status.toLowerCase()}`,
        targetType: "SupplierPayout",
        targetId: id,
        metadata: { supplierId: current.supplierId, amount: current.amount.toString() },
      });
    });
    revalidatePath("/supplier-payouts");
    return { success: true };
  } catch (err) {
    if (err instanceof Error && err.message === "NOT_FOUND") return { error: "Payout not found" };
    if (isDomainError(err)) return { error: "That payout status change isn't allowed." };
    return { error: err instanceof Error ? err.message : "Update failed" };
  }
}

export async function markProcessing(id: string): Promise<ActionResult> {
  return setStatus(id, "PROCESSING", false);
}
export async function markCompleted(id: string): Promise<ActionResult> {
  return setStatus(id, "COMPLETED", true);
}
export async function markFailed(id: string): Promise<ActionResult> {
  return setStatus(id, "FAILED", false);
}
