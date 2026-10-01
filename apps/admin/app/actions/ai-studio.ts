"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@ayvana/db";
import { getAuthUser } from "@ayvana/auth";

// ADMIN-gated AI-Studio config edits (plan/pack params) + review-queue actions.
// Defense-in-depth: the (dashboard) layout + middleware already gate, and every
// action here independently re-checks ADMIN via getAuthUser (server actions are
// directly-invocable POST endpoints). No price/limit is hard-coded in app code —
// these edits are the single source of truth, read by the vendor billing UI.

type ActionResult = { success: true } | { error: string };

async function requireAdmin(): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getAuthUser();
  if (!user) return { ok: false, error: "Unauthorized" };
  if (user.role !== "ADMIN") return { ok: false, error: "Forbidden" };
  return { ok: true };
}

/** Edit a subscription plan's price / included shoots / limits (no deploy). */
export async function updatePlan(
  planId: string,
  data: { priceMonthly?: number; priceAnnual?: number | null; includedShoots?: number; maxResolution?: string; overageCreditPrice?: number | null; isActive?: boolean },
): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: gate.error };

  if (data.priceMonthly != null && (!Number.isFinite(data.priceMonthly) || data.priceMonthly < 0))
    return { error: "Monthly price must be ≥ 0" };
  if (data.priceAnnual != null && (!Number.isFinite(data.priceAnnual) || data.priceAnnual < 0))
    return { error: "Annual price must be ≥ 0" };
  if (data.includedShoots != null && (!Number.isInteger(data.includedShoots) || data.includedShoots < 0))
    return { error: "Included shoots must be a whole number ≥ 0" };

  try {
    await prisma.subscriptionPlan.update({
      where: { id: planId },
      data: {
        ...(data.priceMonthly != null ? { priceMonthly: data.priceMonthly } : {}),
        ...(data.priceAnnual !== undefined ? { priceAnnual: data.priceAnnual } : {}),
        ...(data.includedShoots != null ? { includedShoots: data.includedShoots } : {}),
        ...(data.maxResolution != null ? { maxResolution: data.maxResolution } : {}),
        ...(data.overageCreditPrice !== undefined ? { overageCreditPrice: data.overageCreditPrice } : {}),
        ...(data.isActive != null ? { isActive: data.isActive } : {}),
      },
    });
    revalidatePath("/ai-studio/plans");
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Update failed" };
  }
}

/** Edit a credit pack's credits / price / active state (no deploy). */
export async function updatePackage(
  packageId: string,
  data: { credits?: number; price?: number; isActive?: boolean },
): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: gate.error };

  if (data.credits != null && (!Number.isInteger(data.credits) || data.credits < 1))
    return { error: "Credits must be a whole number ≥ 1" };
  if (data.price != null && (!Number.isFinite(data.price) || data.price < 0)) return { error: "Price must be ≥ 0" };

  try {
    await prisma.creditPackage.update({
      where: { id: packageId },
      data: {
        ...(data.credits != null ? { credits: data.credits } : {}),
        ...(data.price != null ? { price: data.price } : {}),
        ...(data.isActive != null ? { isActive: data.isActive } : {}),
      },
    });
    revalidatePath("/ai-studio/plans");
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Update failed" };
  }
}

/**
 * Resolve a REVIEW_REQUIRED shoot. "approve" releases it to PREVIEW (the vendor
 * can then use the images; the reserved credit is consumed on their approval).
 * "reject" marks it FAILED and releases the reserved shoot (no charge).
 */
export async function resolveReview(sessionId: string, decision: "approve" | "reject"): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: gate.error };

  const session = await prisma.generationSession
    .findUnique({ where: { id: sessionId }, select: { id: true, status: true, vendorId: true } })
    .catch(() => null);
  if (!session) return { error: "Not found" };
  if (session.status !== "REVIEW_REQUIRED") return { error: "This shoot is no longer awaiting review." };

  try {
    if (decision === "approve") {
      await prisma.generationSession.update({ where: { id: sessionId }, data: { status: "PREVIEW" } });
    } else {
      // Reject → fail + release the reserved shoot (never charge for a reject).
      const { releaseCredit } = await import("@ayvana/db");
      await prisma.generationSession.update({ where: { id: sessionId }, data: { status: "FAILED" } });
      await releaseCredit({ vendorId: session.vendorId, sessionId, reason: "rejected in admin review" }).catch(
        () => undefined,
      );
    }
    revalidatePath("/ai-studio/review");
    revalidatePath("/ai-studio");
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not resolve" };
  }
}
