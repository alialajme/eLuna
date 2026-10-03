"use server";

import { revalidatePath } from "next/cache";
import {
  prisma,
  applyStudioPaymentResult,
  listPlans,
  listPackages,
  type StudioBillingCycle,
} from "@ayvana/db";
import { getGateway } from "@ayvana/payments";
import { safeCurrentUser } from "../lib/auth";
import { getVendorByUserId } from "../lib/vendor";

// ─────────────────────────────────────────────
// Vendor Studio billing actions (subscriptions + credit packs).
//
// Security: vendorId is ALWAYS resolved server-side (safeCurrentUser →
// getVendorByUserId → ACTIVE) — never a client param. We NEVER trust the browser
// for price/credits: the amount + granted credits are read from the DB plan/pack
// config (admin-editable), not from the request.
//
// Flow (payment-first, mirrors the customer checkout): create a PENDING
// StudioPayment → call the payment gateway → if `captured` (the keyless
// Simulated path, or a wallet/sync method) reconcile immediately so the vendor's
// credits/subscription are granted; if `requires_action` (real Stripe) hand the
// clientSecret to the browser and let the signature-verified webhook reconcile.
// `applyStudioPaymentResult` is idempotent so a webhook racing this is safe.
// ─────────────────────────────────────────────

type Resolved = { ok: true; vendor: { id: string } } | { ok: false; error: string };

async function resolveActiveVendor(): Promise<Resolved> {
  const user = await safeCurrentUser();
  if (!user) return { ok: false, error: "Unauthorized" };
  const vendor = await getVendorByUserId(user.id);
  if (!vendor) return { ok: false, error: "Vendor not found" };
  if (vendor.status !== "ACTIVE") return { ok: false, error: "Your store is not active yet." };
  return { ok: true, vendor: { id: vendor.id } };
}

export type BillingActionResult =
  | { ok: true; captured: boolean; clientSecret?: string }
  | { ok: false; error: string };

/** Subscribe to (or upgrade/switch) a plan. Price + included shoots come from DB config. */
export async function subscribeToPlan(
  planCode: string,
  cycle: StudioBillingCycle = "MONTHLY",
): Promise<BillingActionResult> {
  const resolved = await resolveActiveVendor();
  if (!resolved.ok) return { ok: false, error: resolved.error };

  const plans = await listPlans({ activeOnly: true });
  const plan = plans.find((p) => p.code === planCode);
  if (!plan) return { ok: false, error: "That plan is not available." };

  const amount = cycle === "ANNUAL" && plan.priceAnnual != null ? plan.priceAnnual : plan.priceMonthly;

  const payment = await prisma.studioPayment.create({
    data: {
      vendorId: resolved.vendor.id,
      kind: "SUBSCRIPTION",
      amount,
      planId: plan.id,
      billingCycle: cycle,
      grantedCredits: plan.includedShoots,
      idempotencyKey: `sub:${resolved.vendor.id}:${plan.id}:${Date.now()}`,
    },
    select: { id: true },
  });

  return charge(payment.id, amount, `AYVANA Studio — ${plan.name} (${cycle.toLowerCase()})`);
}

/** Buy a credit pack (overage shoots). Price + credits come from DB config. */
export async function purchaseCreditPack(packageCode: string): Promise<BillingActionResult> {
  const resolved = await resolveActiveVendor();
  if (!resolved.ok) return { ok: false, error: resolved.error };

  const packs = await listPackages({ activeOnly: true });
  const pack = packs.find((p) => p.code === packageCode);
  if (!pack) return { ok: false, error: "That pack is not available." };

  const payment = await prisma.studioPayment.create({
    data: {
      vendorId: resolved.vendor.id,
      kind: "CREDIT_PACK",
      amount: pack.price,
      packageId: pack.id,
      grantedCredits: pack.credits,
      idempotencyKey: `pack:${resolved.vendor.id}:${pack.id}:${Date.now()}`,
    },
    select: { id: true },
  });

  return charge(payment.id, pack.price, `AYVANA Studio — ${pack.name}`);
}

/**
 * Run the payment + reconcile. Keyless → the Simulated gateway returns
 * `captured`, so we reconcile inline and the vendor's credits land immediately
 * (the demo "subscribe"/"buy-pack" flow). Real Stripe returns `requires_action`
 * → the browser confirms and the webhook reconciles.
 */
async function charge(paymentId: string, amount: number, description: string): Promise<BillingActionResult> {
  const gateway = getGateway("CARD");
  const result = await gateway.createPayment({
    amount,
    currency: "AED",
    orderId: paymentId, // used as the gateway reference/metadata key
    customerEmail: "billing@ayvana.ae",
    description,
  });

  if (result.status === "failed") {
    await applyStudioPaymentResult({ kind: "failed", paymentId });
    return { ok: false, error: result.error };
  }

  if (result.status === "captured") {
    await applyStudioPaymentResult({ kind: "captured", paymentId, externalRef: result.externalRef });
    revalidatePath("/billing");
    revalidatePath("/studio");
    return { ok: true, captured: true };
  }

  // requires_action — real Stripe; the webhook will reconcile on confirmation.
  await prisma.studioPayment
    .update({ where: { id: paymentId }, data: { externalRef: result.externalRef } })
    .catch(() => undefined);
  return { ok: true, captured: false, clientSecret: result.clientSecret };
}
