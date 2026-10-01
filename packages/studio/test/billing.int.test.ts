import { describe, it, expect } from "vitest";
import {
  prisma,
  reserveCredit,
  releaseCredit,
  consumeCredit,
  grantCredit,
  ensureWallet,
  applyStudioPaymentResult,
  getSubscription,
  seedStudioBilling,
} from "@ayvana/db";
import { startGeneration, runGenerationJob } from "../src";
import { makeVendor, makeGarment, grantShoots, walletOf } from "./factories";

const cid = () => `cid_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

// §31 critical billing/credit tests — the correctness guarantees of Phase 4.
describe("AI Studio monetization — credit correctness (§31)", () => {
  it("two concurrent generations can't spend ONE remaining shoot twice", async () => {
    const { vendorId } = await makeVendor("ACTIVE", { shoots: 0 });
    await grantShoots(vendorId, 1); // exactly one shoot
    const g1 = await makeGarment(vendorId);
    const g2 = await makeGarment(vendorId);

    // Fire two starts concurrently. Only one may reserve the single shoot.
    const [a, b] = await Promise.all([
      startGeneration({ vendorId, garmentId: g1.garmentId, idempotencyKey: `k1_${cid()}`, correlationId: cid() }),
      startGeneration({ vendorId, garmentId: g2.garmentId, idempotencyKey: `k2_${cid()}`, correlationId: cid() }),
    ]);

    const oks = [a, b].filter((r) => r.ok).length;
    const blocked = [a, b].filter((r) => !r.ok && r.reason === "INSUFFICIENT_CREDITS").length;
    expect(oks).toBe(1);
    expect(blocked).toBe(1);

    const w = await walletOf(vendorId);
    expect(w.available).toBe(0);
    expect(w.reserved).toBe(1); // exactly one reservation, never two
  });

  it("a platform/provider failure RELEASES the reserved shoot (never charge for infra failures)", async () => {
    const { vendorId } = await makeVendor("ACTIVE", { shoots: 0 });
    await grantShoots(vendorId, 1);
    // A garment with NO images → the pipeline fails at "no garment images".
    const garment = await prisma.garmentAsset.create({
      data: { vendorId, status: "QC_PASSED" },
      select: { id: true },
    });

    const start = await startGeneration({ vendorId, garmentId: garment.id, idempotencyKey: `k_${cid()}`, correlationId: cid() });
    expect(start.ok).toBe(true);
    if (!start.ok) return;

    const afterReserve = await walletOf(vendorId);
    expect(afterReserve.available).toBe(0);
    expect(afterReserve.reserved).toBe(1);

    const run = await runGenerationJob(start.jobId);
    expect(run.status).toBe("failed");

    const afterFail = await walletOf(vendorId);
    expect(afterFail.available).toBe(1); // released back
    expect(afterFail.reserved).toBe(0);
    expect(afterFail.lifetimeConsumed).toBe(0); // never consumed
  });

  it("a successful shoot CONSUMES the shoot exactly once (idempotent on replay)", async () => {
    const { vendorId } = await makeVendor("ACTIVE", { shoots: 0 });
    await grantShoots(vendorId, 1);
    const { garmentId } = await makeGarment(vendorId);
    const start = await startGeneration({ vendorId, garmentId, idempotencyKey: `k_${cid()}`, correlationId: cid() });
    expect(start.ok).toBe(true);
    if (!start.ok) return;

    const run1 = await runGenerationJob(start.jobId);
    expect(run1.status).toBe("completed");
    // Re-run the same job (at-least-once delivery) → must NOT double-consume.
    const run2 = await runGenerationJob(start.jobId);
    expect(run2.status).toBe("completed");

    const w = await walletOf(vendorId);
    expect(w.available).toBe(0);
    expect(w.reserved).toBe(0);
    expect(w.lifetimeConsumed).toBe(1); // consumed exactly once
  });

  it("a duplicate generation REQUEST (same idempotencyKey) does not double-charge", async () => {
    const { vendorId } = await makeVendor("ACTIVE", { shoots: 0 });
    await grantShoots(vendorId, 2);
    const { garmentId } = await makeGarment(vendorId);
    const key = `dup_${cid()}`;

    const a = await startGeneration({ vendorId, garmentId, idempotencyKey: key, correlationId: cid() });
    const b = await startGeneration({ vendorId, garmentId, idempotencyKey: key, correlationId: cid() });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.sessionId).toBe(b.sessionId); // deduped to the same shoot

    const w = await walletOf(vendorId);
    expect(w.available).toBe(1); // only ONE reserved, not two
    expect(w.reserved).toBe(1);
  });

  it("blocks a shoot when the wallet is empty (no session, no job created)", async () => {
    const { vendorId } = await makeVendor("ACTIVE", { shoots: 0 });
    const { garmentId } = await makeGarment(vendorId);
    const before = await prisma.generationSession.count({ where: { vendorId } });

    const res = await startGeneration({ vendorId, garmentId, idempotencyKey: `k_${cid()}`, correlationId: cid() });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe("INSUFFICIENT_CREDITS");

    const after = await prisma.generationSession.count({ where: { vendorId } });
    expect(after).toBe(before); // rolled back — no orphan session
  });
});

describe("AI Studio monetization — payments + subscriptions (§31)", () => {
  it("a duplicate payment webhook does NOT double-credit", async () => {
    await seedStudioBilling();
    const { vendorId } = await makeVendor("ACTIVE", { shoots: 0 });
    const pack = await prisma.creditPackage.findFirstOrThrow({ where: { code: "PACK_10" } });
    const payment = await prisma.studioPayment.create({
      data: {
        vendorId,
        kind: "CREDIT_PACK",
        amount: pack.price,
        packageId: pack.id,
        grantedCredits: pack.credits,
        idempotencyKey: `pay_${cid()}`,
      },
      select: { id: true },
    });

    // Apply the "captured" webhook twice (re-delivery).
    const r1 = await applyStudioPaymentResult({ kind: "captured", paymentId: payment.id, externalRef: "ext_1" });
    const r2 = await applyStudioPaymentResult({ kind: "captured", paymentId: payment.id, externalRef: "ext_1" });
    expect(r1.applied).toBe(true);
    expect(r2.applied).toBe(false); // second is a no-op (already CAPTURED)

    const w = await walletOf(vendorId);
    expect(w.available).toBe(pack.credits); // granted exactly once, not twice
  });

  it("a subscription payment activates the plan and grants its included shoots once", async () => {
    await seedStudioBilling();
    const { vendorId } = await makeVendor("ACTIVE", { shoots: 0 });
    const plan = await prisma.subscriptionPlan.findFirstOrThrow({ where: { code: "BOUTIQUE" } });
    const payment = await prisma.studioPayment.create({
      data: {
        vendorId,
        kind: "SUBSCRIPTION",
        amount: plan.priceMonthly,
        planId: plan.id,
        billingCycle: "MONTHLY",
        grantedCredits: plan.includedShoots,
        idempotencyKey: `pay_${cid()}`,
      },
      select: { id: true },
    });

    await applyStudioPaymentResult({ kind: "captured", paymentId: payment.id });
    await applyStudioPaymentResult({ kind: "captured", paymentId: payment.id }); // dup

    const sub = await getSubscription(vendorId);
    expect(sub?.planCode).toBe("BOUTIQUE");
    expect(sub?.status).toBe("ACTIVE");
    const w = await walletOf(vendorId);
    expect(w.available).toBe(plan.includedShoots); // 10, granted once
  });

  it("subscription expiry changes entitlements (expired flag flips)", async () => {
    await seedStudioBilling();
    const { vendorId } = await makeVendor("ACTIVE", { shoots: 0 });
    const plan = await prisma.subscriptionPlan.findFirstOrThrow({ where: { code: "TRY" } });
    await prisma.studioSubscription.create({
      data: {
        vendorId,
        planId: plan.id,
        status: "ACTIVE",
        billingCycle: "MONTHLY",
        currentPeriodStart: new Date(Date.now() - 60 * 24 * 3600 * 1000),
        currentPeriodEnd: new Date(Date.now() - 30 * 24 * 3600 * 1000), // ended a month ago
      },
    });
    const sub = await getSubscription(vendorId);
    expect(sub?.expired).toBe(true); // past period end → entitlements lapse
  });
});

describe("AI Studio monetization — wallet isolation (§31)", () => {
  it("a vendor's wallet mutation never touches another vendor's wallet", async () => {
    const a = await makeVendor("ACTIVE", { shoots: 0 });
    const b = await makeVendor("ACTIVE", { shoots: 0 });
    await grantShoots(a.vendorId, 5);
    await grantShoots(b.vendorId, 3);

    // Reserve on A inside a tx; B must be untouched.
    await prisma.$transaction(async (tx) => {
      const r = await reserveCredit({ vendorId: a.vendorId, idempotencyKey: `iso_${cid()}`, sessionId: `s_${cid()}` }, tx);
      expect(r.ok).toBe(true);
    });

    const wa = await walletOf(a.vendorId);
    const wb = await walletOf(b.vendorId);
    expect(wa.available).toBe(4);
    expect(wa.reserved).toBe(1);
    expect(wb.available).toBe(3); // untouched
    expect(wb.reserved).toBe(0);
  });

  it("ledger entries are scoped by vendorId (no cross-vendor leakage)", async () => {
    const a = await makeVendor("ACTIVE", { shoots: 0 });
    const b = await makeVendor("ACTIVE", { shoots: 0 });
    await grantShoots(a.vendorId, 7);
    await grantShoots(b.vendorId, 2);

    const aTxns = await prisma.creditTransaction.findMany({ where: { vendorId: a.vendorId }, select: { vendorId: true } });
    expect(aTxns.length).toBeGreaterThan(0);
    expect(aTxns.every((t) => t.vendorId === a.vendorId)).toBe(true);

    const wa = await ensureWallet(a.vendorId);
    expect(Number(wa.available)).toBe(7);
  });
});
