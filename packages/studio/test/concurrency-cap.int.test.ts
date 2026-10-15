import { describe, it, expect } from "vitest";
import { prisma } from "@ayvana/db";
import { startGeneration } from "../src";
import { makeVendor, makeGarment, grantShoots } from "./factories";

const cid = () => `cid_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

// Per-vendor concurrency ceiling (abuse / runaway guard). Credits are NOT the
// limiter here — the vendor is granted plenty of shoots — so a rejection proves
// the concurrency cap fired, not an empty wallet.
describe("AI Studio — per-vendor concurrency cap", () => {
  it("rejects a new shoot once the vendor has MAX_CONCURRENT_JOBS_PER_VENDOR (10) in flight", async () => {
    const { vendorId } = await makeVendor("ACTIVE", { shoots: 0 });
    await grantShoots(vendorId, 100); // credits are not the constraint

    // Fill the cap: 10 in-flight ANALYZE/QUEUED jobs.
    for (let i = 0; i < 10; i++) {
      const g = await makeGarment(vendorId);
      const r = await startGeneration({
        vendorId,
        garmentId: g.garmentId,
        idempotencyKey: `fill_${i}_${cid()}`,
        correlationId: cid(),
      });
      expect(r.ok).toBe(true);
    }

    // The 11th must be rejected by the concurrency cap (not credits).
    const g = await makeGarment(vendorId);
    const over = await startGeneration({
      vendorId,
      garmentId: g.garmentId,
      idempotencyKey: `over_${cid()}`,
      correlationId: cid(),
    });
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.reason).toBe("TOO_MANY_CONCURRENT");

    // Exactly 10 in-flight jobs exist — the 11th left no session/job behind.
    const inFlight = await prisma.generationJob.count({
      where: {
        session: { vendorId },
        state: {
          in: ["QUEUED", "VALIDATING", "ANALYZING", "GENERATING_IMAGES", "VALIDATING_IMAGES", "GENERATING_VIDEO", "VALIDATING_VIDEO"],
        },
      },
    });
    expect(inFlight).toBe(10);
  });

  it("does not count terminal jobs (COMPLETED/FAILED) against the cap", async () => {
    const { vendorId } = await makeVendor("ACTIVE", { shoots: 0 });
    await grantShoots(vendorId, 100);

    const g1 = await makeGarment(vendorId);
    const first = await startGeneration({
      vendorId,
      garmentId: g1.garmentId,
      idempotencyKey: `t1_${cid()}`,
      correlationId: cid(),
    });
    expect(first.ok).toBe(true);
    if (first.ok) {
      // Mark it terminal — it should free a concurrency slot.
      await prisma.generationJob.updateMany({
        where: { sessionId: first.sessionId },
        data: { state: "COMPLETED" },
      });
    }

    // A fresh start still succeeds (the completed job no longer occupies a slot).
    const g2 = await makeGarment(vendorId);
    const second = await startGeneration({
      vendorId,
      garmentId: g2.garmentId,
      idempotencyKey: `t2_${cid()}`,
      correlationId: cid(),
    });
    expect(second.ok).toBe(true);
  });
});
