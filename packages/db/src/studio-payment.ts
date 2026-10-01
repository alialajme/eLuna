import { prisma } from "./client";
import { grantCredit } from "./studio-credits";
import { activateSubscription } from "./studio-billing";

// ─────────────────────────────────────────────
// AI Fashion Studio — payment reconciliation (subscriptions + credit packs)
//
// Mirrors `@ayvana/payments` `applyPaymentResult`: payment-first + idempotent.
// A StudioPayment row is created PENDING, then captured here (by the simulated
// capture in dev, or a signature-verified webhook in prod). Only a PENDING row
// is transitioned, so a duplicate webhook/replay NEVER double-grants credits.
// On capture: SUBSCRIPTION → activateSubscription (grants included shoots);
// CREDIT_PACK → grantCredit (pack credits). Both grants are idempotency-keyed on
// the payment id, a second guard against double-credit.
// ─────────────────────────────────────────────

export type StudioPaymentOutcome =
  | { kind: "captured"; paymentId: string; externalRef?: string | null }
  | { kind: "failed"; paymentId: string }
  | { kind: "ignored" };

/**
 * Idempotently apply a Studio payment outcome. Returns what happened so callers
 * can revalidate/log. Safe to call repeatedly (webhook re-delivery + dev sync).
 */
export async function applyStudioPaymentResult(
  outcome: StudioPaymentOutcome,
): Promise<{ applied: boolean; kind?: "SUBSCRIPTION" | "CREDIT_PACK"; vendorId?: string }> {
  if (outcome.kind === "ignored") return { applied: false };

  const payment = await prisma.studioPayment
    .findUnique({
      where: { id: outcome.paymentId },
      select: {
        id: true, vendorId: true, kind: true, status: true, amount: true,
        planId: true, billingCycle: true, packageId: true, grantedCredits: true,
      },
    })
    .catch(() => null);
  // Only a PENDING payment is actionable → idempotent on re-delivery.
  if (!payment || payment.status !== "PENDING") return { applied: false };

  if (outcome.kind === "failed") {
    await prisma.studioPayment.updateMany({ where: { id: payment.id, status: "PENDING" }, data: { status: "FAILED" } });
    return { applied: true, kind: payment.kind, vendorId: payment.vendorId };
  }

  // captured: flip to CAPTURED first (guarded on PENDING so the grant runs once),
  // then grant. The grant is itself idempotency-keyed on the payment id.
  const flip = await prisma.studioPayment.updateMany({
    where: { id: payment.id, status: "PENDING" },
    data: { status: "CAPTURED", externalRef: outcome.externalRef ?? null },
  });
  if (flip.count === 0) return { applied: false }; // lost the race → someone else is granting

  if (payment.kind === "SUBSCRIPTION" && payment.planId && payment.billingCycle) {
    const plan = await prisma.subscriptionPlan.findUnique({
      where: { id: payment.planId },
      select: { code: true, includedShoots: true },
    });
    if (plan) {
      await activateSubscription({
        vendorId: payment.vendorId,
        planId: payment.planId,
        billingCycle: payment.billingCycle,
        paymentId: payment.id,
        includedShoots: plan.includedShoots,
        planCode: plan.code,
      });
    }
  } else if (payment.kind === "CREDIT_PACK") {
    await grantCredit({
      vendorId: payment.vendorId,
      shoots: payment.grantedCredits,
      type: "PURCHASE",
      idempotencyKey: `pack-grant:${payment.id}`,
      paymentId: payment.id,
      reason: `Credit pack — ${payment.grantedCredits} shoots`,
      actor: "webhook",
    });
  }

  return { applied: true, kind: payment.kind, vendorId: payment.vendorId };
}
