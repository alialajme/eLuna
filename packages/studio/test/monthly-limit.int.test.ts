import { describe, it, expect } from "vitest";
import { prisma } from "@ayvana/db";
import { startGeneration } from "../src";
import { makeVendor, makeGarment, grantShoots } from "./factories";

const cid = () => `cid_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

/** Create an ACTIVE monthly subscription for `vendorId` on a plan with the given
 *  monthlyLimit (null = no cap). Wallet credits are granted separately. */
async function subscribe(vendorId: string, monthlyLimit: number | null) {
  const plan = await prisma.subscriptionPlan.create({
    data: {
      code: `TESTPLAN_${cid()}`,
      name: "Test Plan",
      priceMonthly: 199,
      includedShoots: 0, // credits granted explicitly in the test
      maxResolution: "2K",
      monthlyLimit,
    },
    select: { id: true },
  });
  await prisma.studioSubscription.create({
    data: {
      vendorId,
      planId: plan.id,
      status: "ACTIVE",
      billingCycle: "MONTHLY",
      currentPeriodStart: new Date(Date.now() - 24 * 3600 * 1000), // yesterday
      currentPeriodEnd: new Date(Date.now() + 29 * 24 * 3600 * 1000), // ~29d left
    },
  });
}

async function start(vendorId: string) {
  const g = await makeGarment(vendorId);
  return startGeneration({
    vendorId,
    garmentId: g.garmentId,
    idempotencyKey: `k_${cid()}`,
    correlationId: cid(),
  });
}

// SubscriptionPlan.monthlyLimit is an OPTIONAL per-plan ceiling on shoots started
// per billing period. Enforced only when non-null; null (every default plan) =
// no cap. The wallet is the real spend gate — credits are NOT the limiter here.
describe("AI Studio — optional plan monthly limit", () => {
  it("blocks the (limit+1)th shoot this period when the plan sets monthlyLimit", async () => {
    const { vendorId } = await makeVendor("ACTIVE", { shoots: 0 });
    await grantShoots(vendorId, 100); // credits are not the constraint
    await subscribe(vendorId, 2); // plan caps at 2 shoots/period

    const a = await start(vendorId);
    const b = await start(vendorId);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);

    const c = await start(vendorId);
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.reason).toBe("MONTHLY_LIMIT_REACHED");
  });

  it("does NOT cap when the plan's monthlyLimit is null (default)", async () => {
    const { vendorId } = await makeVendor("ACTIVE", { shoots: 0 });
    await grantShoots(vendorId, 100);
    await subscribe(vendorId, null); // no ceiling

    for (let i = 0; i < 3; i++) {
      const r = await start(vendorId);
      expect(r.ok).toBe(true); // wallet has credits; no monthly cap applies
    }
  });

  it("does NOT cap a vendor with no subscription (packs-only / pay-as-you-go)", async () => {
    const { vendorId } = await makeVendor("ACTIVE", { shoots: 0 });
    await grantShoots(vendorId, 5); // credits from a pack, no subscription

    for (let i = 0; i < 3; i++) {
      const r = await start(vendorId);
      expect(r.ok).toBe(true);
    }
  });
});
