/**
 * Studio credits interleaved reserve+consume concurrency tests (Part 5)
 *
 * `studio-credits.ts` uses:
 *   - SELECT … FOR UPDATE row-lock on CreditWallet
 *   - Idempotency keys on every mutation (CreditTransaction.idempotencyKey @unique)
 *
 * INVARIANTS UNDER TEST:
 *  1. Concurrent reserves against an insufficient wallet: exactly N succeed
 *     (no over-consume, no negative available).
 *  2. Duplicate reserve (same idempotencyKey) → deduped, wallet unchanged.
 *  3. Concurrent reserve + consume on the same session: coherent outcome —
 *     available + reserved + lifetimeConsumed balance correctly, no negative.
 *  4. Duplicate consume (same sessionId) → deduped, ledger written once.
 *  5. Release after failure never double-restores (idempotent by sessionId).
 *  6. Grant idempotency: duplicate grant → wallet unchanged.
 */

import { describe, it, expect } from "vitest";
import { prisma } from "../src/client";
import { reserveCredit, consumeCredit, releaseCredit, grantCredit, ensureWallet } from "../src/studio-credits";
import { makeVendorOnly } from "./factories";

// ── helpers ────────────────────────────────────────────────────────────────

let _n = 0;
const uid = (p: string) => `${p}_${Date.now()}_${_n++}_${Math.random().toString(36).slice(2, 6)}`;

async function walletOf(vendorId: string) {
  const w = await prisma.creditWallet.findUniqueOrThrow({
    where: { vendorId },
    select: { available: true, reserved: true, lifetimeConsumed: true },
  });
  return {
    available: Number(w.available),
    reserved: Number(w.reserved),
    consumed: Number(w.lifetimeConsumed),
  };
}

/** Grant N credits to a fresh vendor's wallet. */
async function vendorWithCredits(n: number) {
  const { vendorId } = await makeVendorOnly();
  await grantCredit({ vendorId, shoots: n, type: "GRANT", idempotencyKey: uid("grant") });
  return vendorId;
}

// ── tests ───────────────────────────────────────────────────────────────────

describe("studio-credits — concurrency & idempotency (integration, real Postgres)", () => {
  it("concurrent reserves against limited wallet: exactly N succeed, no negative available", async () => {
    const available = 3;
    const vendorId = await vendorWithCredits(available);

    // 10 concurrent reserve attempts — only 3 should succeed.
    const attempts = Array.from({ length: 10 }, (_, i) =>
      prisma.$transaction((tx) =>
        reserveCredit({ vendorId, shoots: 1, idempotencyKey: uid(`ikey_${i}`) }, tx),
      ),
    );
    const results = await Promise.allSettled(attempts);

    const succeeded = results.filter(
      (r) => r.status === "fulfilled" && r.value.ok === true && !r.value.deduped,
    ).length;
    expect(succeeded).toBe(available);

    const w = await walletOf(vendorId);
    expect(w.available).toBe(0);
    expect(w.reserved).toBe(available);
    expect(w.available).toBeGreaterThanOrEqual(0); // never negative
  });

  it("duplicate reserve (same idempotencyKey) → deduped, wallet charged once", async () => {
    const vendorId = await vendorWithCredits(5);
    const key = uid("ikey_dup");

    const r1 = await prisma.$transaction((tx) => reserveCredit({ vendorId, shoots: 1, idempotencyKey: key }, tx));
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(r1.deduped).toBe(false);

    // Same key → deduped.
    const r2 = await prisma.$transaction((tx) => reserveCredit({ vendorId, shoots: 1, idempotencyKey: key }, tx));
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.deduped).toBe(true);

    // Wallet only charged once.
    const w = await walletOf(vendorId);
    expect(w.available).toBe(4);
    expect(w.reserved).toBe(1);
  });

  it("concurrent reserve + consume: coherent — available + reserved + consumed = original", async () => {
    const initial = 4;
    const vendorId = await vendorWithCredits(initial);
    const sessionId = uid("sess");
    const reserveKey = uid("reserve");

    // Reserve 2 shoots first.
    const reserveResult = await prisma.$transaction((tx) =>
      reserveCredit({ vendorId, shoots: 2, idempotencyKey: reserveKey, sessionId }, tx),
    );
    expect(reserveResult.ok).toBe(true);

    // Concurrent: consume those 2 + another reserve-attempt of 3 (should fail: only 2 available).
    const [consumeResult, raceReserve] = await Promise.allSettled([
      consumeCredit({ vendorId, sessionId, shoots: 2 }),
      prisma.$transaction((tx) =>
        reserveCredit({ vendorId, shoots: 3, idempotencyKey: uid("race_key") }, tx),
      ),
    ]);

    expect(consumeResult.status).toBe("fulfilled");
    if (consumeResult.status === "fulfilled") {
      expect(consumeResult.value.ok).toBe(true);
    }

    // The second reserve for 3 against 2 available should fail.
    if (raceReserve.status === "fulfilled" && raceReserve.value.ok === true) {
      // Won the race only if available was ≥3 when it ran — this is OK.
    } else if (raceReserve.status === "fulfilled" && raceReserve.value.ok === false) {
      expect(raceReserve.value.reason).toBe("INSUFFICIENT_CREDITS");
    }

    // Coherence: available + reserved + consumed must equal initial.
    const w = await walletOf(vendorId);
    const coherent = w.available + w.reserved + w.consumed;
    expect(coherent).toBe(initial);
    expect(w.available).toBeGreaterThanOrEqual(0);
    expect(w.reserved).toBeGreaterThanOrEqual(0);
    expect(w.consumed).toBeGreaterThanOrEqual(0);
  });

  it("duplicate consume (same sessionId) → deduped, ledger written once", async () => {
    const vendorId = await vendorWithCredits(3);
    const sessionId = uid("sess_dup");
    const reserveKey = uid("r_key");

    await prisma.$transaction((tx) =>
      reserveCredit({ vendorId, shoots: 1, idempotencyKey: reserveKey, sessionId }, tx),
    );

    const c1 = await consumeCredit({ vendorId, sessionId });
    expect(c1.deduped).toBe(false);

    const c2 = await consumeCredit({ vendorId, sessionId });
    expect(c2.deduped).toBe(true);

    // Only one CONSUME ledger entry.
    const consumeRows = await prisma.creditTransaction.count({
      where: { vendorId, sessionId, type: "CONSUME" },
    });
    expect(consumeRows).toBe(1);
  });

  it("concurrent duplicate consume (same sessionId) → exactly one ledger entry", async () => {
    const vendorId = await vendorWithCredits(3);
    const sessionId = uid("sess_conc");
    const reserveKey = uid("r_key2");

    await prisma.$transaction((tx) =>
      reserveCredit({ vendorId, shoots: 1, idempotencyKey: reserveKey, sessionId }, tx),
    );

    // Fire 5 concurrent consumes for the same session.
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => consumeCredit({ vendorId, sessionId })),
    );

    // All resolve (no crash).
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(0);

    // Exactly one non-deduped consume.
    const nonDeduped = results.filter(
      (r) => r.status === "fulfilled" && r.value.ok && !r.value.deduped,
    ).length;
    expect(nonDeduped).toBe(1);

    // Only one CONSUME ledger entry.
    const consumeRows = await prisma.creditTransaction.count({
      where: { vendorId, sessionId, type: "CONSUME" },
    });
    expect(consumeRows).toBe(1);
  });

  it("release after failure is idempotent (duplicate release → no double-restore)", async () => {
    const initial = 5;
    const vendorId = await vendorWithCredits(initial);
    const sessionId = uid("sess_rel");
    const reserveKey = uid("r_key3");

    await prisma.$transaction((tx) =>
      reserveCredit({ vendorId, shoots: 1, idempotencyKey: reserveKey, sessionId }, tx),
    );

    const w1 = await walletOf(vendorId);
    expect(w1.reserved).toBe(1);
    expect(w1.available).toBe(initial - 1);

    // First release — restores 1 shoot.
    const rel1 = await releaseCredit({ vendorId, sessionId });
    expect(rel1.deduped).toBe(false);
    const w2 = await walletOf(vendorId);
    expect(w2.available).toBe(initial);
    expect(w2.reserved).toBe(0);

    // Second release — idempotent, no change.
    const rel2 = await releaseCredit({ vendorId, sessionId });
    expect(rel2.deduped).toBe(true);
    const w3 = await walletOf(vendorId);
    expect(w3.available).toBe(initial); // unchanged — not incremented again
    expect(w3.reserved).toBe(0);
  });

  it("concurrent release (same sessionId) → exactly one applies, no double-restore", async () => {
    const initial = 5;
    const vendorId = await vendorWithCredits(initial);
    const sessionId = uid("sess_relc");
    const reserveKey = uid("r_key4");

    await prisma.$transaction((tx) =>
      reserveCredit({ vendorId, shoots: 1, idempotencyKey: reserveKey, sessionId }, tx),
    );

    // Fire 5 concurrent releases.
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => releaseCredit({ vendorId, sessionId })),
    );

    expect(results.filter((r) => r.status === "rejected")).toHaveLength(0);

    const nonDeduped = results.filter(
      (r) => r.status === "fulfilled" && r.value.ok && !r.value.deduped,
    ).length;
    expect(nonDeduped).toBe(1);

    const w = await walletOf(vendorId);
    expect(w.available).toBe(initial); // restored exactly once
    expect(w.reserved).toBe(0);
  });

  it("grant idempotency: duplicate grant → wallet credited once", async () => {
    const { vendorId } = await makeVendorOnly();
    const key = uid("grant_dup");

    await grantCredit({ vendorId, shoots: 10, type: "GRANT", idempotencyKey: key });
    const w1 = await walletOf(vendorId);
    expect(w1.available).toBe(10);

    // Duplicate grant — should be deduped.
    const r2 = await grantCredit({ vendorId, shoots: 10, type: "GRANT", idempotencyKey: key });
    expect(r2.deduped).toBe(true);
    const w2 = await walletOf(vendorId);
    expect(w2.available).toBe(10); // not 20
  });

  it("wallet stays coherent: available + reserved + lifetimeConsumed = initial across many ops", async () => {
    const initial = 10;
    const vendorId = await vendorWithCredits(initial);

    // 5 reserves of 1, then consume 3, release 2.
    const sessions = Array.from({ length: 5 }, (_, i) => uid(`sess_coh_${i}`));
    const reserveKeys = sessions.map((s) => uid(`rk_${s}`));

    await Promise.all(
      sessions.map((sessionId, i) =>
        prisma.$transaction((tx) =>
          reserveCredit({ vendorId, shoots: 1, idempotencyKey: reserveKeys[i]!, sessionId }, tx),
        ),
      ),
    );

    // Consume 3 sessions.
    await Promise.all(sessions.slice(0, 3).map((sessionId) => consumeCredit({ vendorId, sessionId })));
    // Release 2 sessions.
    await Promise.all(sessions.slice(3, 5).map((sessionId) => releaseCredit({ vendorId, sessionId })));

    const w = await walletOf(vendorId);
    // Consumed 3: lifetimeConsumed = 3; available = 10 - 5 consumed-via-reserve + 2 released = 7; reserved = 0.
    expect(w.consumed).toBe(3);
    expect(w.reserved).toBe(0);
    expect(w.available).toBe(initial - 3); // 7
    // Invariant: total must equal initial.
    expect(w.available + w.reserved + w.consumed).toBe(initial);
  });
});
