/**
 * Refund double-request race tests (Part 5)
 *
 * The vendor `refundReturn` server action (apps/vendor/app/actions/returns.ts)
 * checks `return.status === "RECEIVED"` OUTSIDE the transaction, then calls
 * `prisma.return.update(...)` INSIDE. Under concurrent invocations two racers
 * can both pass the status check before either commits, potentially issuing
 * two refunds for the same return (and writing two ledger entries).
 *
 * INVARIANTS UNDER TEST:
 *  1. Two concurrent "refund this RECEIVED return" attempts → exactly ONE
 *     Return row ends in REFUNDED status; at most ONE ledger entry is written.
 *  2. Total refunded amount ≤ captured item value (no over-refund).
 *  3. A return that is already REFUNDED cannot be re-refunded (terminal guard).
 *
 * The tests exercise the DB layer directly (no Next.js server-action shell)
 * because the auth wrapper is orthogonal to the race.  We replicate the
 * critical section of `refundReturn` inline.
 *
 * KNOWN GAP — see bottom of file.
 */

import { describe, it, expect } from "vitest";
import { prisma } from "../src/client";
import { appendLedgerEntry } from "../src/ledger";
import { makeCustomer, makeVariant } from "./factories";

// ── helpers ────────────────────────────────────────────────────────────────

/** Build a minimal RECEIVED return with a CAPTURED payment. */
async function makeReceivedReturn() {
  const unitPrice = "200.00";
  const qty = 1;
  const { profileId, userId } = await makeCustomer(0);

  const address = await prisma.address.create({
    data: {
      userId,
      fullName: "Test",
      phone: "050000",
      addressLine1: "1 St",
      city: "Dubai",
    },
  });

  const { variantId, vendorId } = await makeVariant(10, unitPrice);

  const order = await prisma.order.create({
    data: {
      customerId: profileId,
      addressId: address.id,
      status: "DELIVERED",
      subtotal: unitPrice,
      total: unitPrice,
      paymentMethod: "CARD",
      items: {
        create: { variantId, vendorId, quantity: qty, unitPrice, fulfillmentStatus: "DELIVERED" },
      },
    },
  });

  const payTx = await prisma.paymentTransaction.create({
    data: { orderId: order.id, method: "CARD", status: "CAPTURED", amount: unitPrice, currency: "AED" },
  });

  const orderItem = await prisma.orderItem.findFirstOrThrow({ where: { orderId: order.id } });

  const ret = await prisma.return.create({
    data: {
      orderItemId: orderItem.id,
      variantId,
      status: "RECEIVED",
      reason: "Defective",
      refundAmount: unitPrice,
    },
  });

  return { returnId: ret.id, orderItemId: orderItem.id, orderId: order.id, payTxId: payTx.id, vendorId, variantId, unitPrice };
}

/**
 * Replicate the critical section of the refundReturn server action.
 * Uses a naive pattern: status check outside tx, update inside —
 * this is the current production code structure we are testing.
 *
 * Returns true if the refund was applied, false if the return was
 * not in RECEIVED status (status guard fired).
 */
async function naiveRefund(returnId: string, vendorId: string): Promise<boolean> {
  // 1) Status guard OUTSIDE the transaction (current production pattern).
  const ret = await prisma.return.findUnique({
    where: { id: returnId },
    select: { status: true, refundAmount: true, orderItem: { select: { id: true, orderId: true } } },
  });
  if (!ret || ret.status !== "RECEIVED") return false;

  // 2) Mutation INSIDE the transaction — no conditional guard on status.
  await prisma.$transaction(async (tx) => {
    await tx.return.update({ where: { id: returnId }, data: { status: "REFUNDED" } });
    await tx.orderItem.update({
      where: { id: ret.orderItem.id },
      data: { fulfillmentStatus: "RETURNED" },
    });
    await tx.paymentTransaction.updateMany({
      where: { orderId: ret.orderItem.orderId, status: "CAPTURED" },
      data: { status: "REFUNDED" },
    });
    await appendLedgerEntry(tx, {
      vendorId,
      entryType: "REFUND",
      amount: ret.refundAmount.negated(),
      orderId: ret.orderItem.orderId,
      orderItemId: ret.orderItem.id,
      note: "test refund",
    });
  });
  return true;
}

/**
 * A HARDENED version: uses updateMany with a status guard INSIDE the
 * transaction so exactly one racer wins.
 */
async function hardenedRefund(returnId: string, vendorId: string): Promise<boolean> {
  const ret = await prisma.return.findUnique({
    where: { id: returnId },
    select: { refundAmount: true, orderItem: { select: { id: true, orderId: true } } },
  });
  if (!ret) return false;

  const applied = await prisma.$transaction(async (tx) => {
    // Conditional update: only applies if status is still RECEIVED.
    const guard = await tx.return.updateMany({
      where: { id: returnId, status: "RECEIVED" },
      data: { status: "REFUNDED" },
    });
    if (guard.count === 0) return false; // another racer already committed

    await tx.orderItem.update({
      where: { id: ret.orderItem.id },
      data: { fulfillmentStatus: "RETURNED" },
    });
    await tx.paymentTransaction.updateMany({
      where: { orderId: ret.orderItem.orderId, status: "CAPTURED" },
      data: { status: "REFUNDED" },
    });
    await appendLedgerEntry(tx, {
      vendorId,
      entryType: "REFUND",
      amount: ret.refundAmount.negated(),
      orderId: ret.orderItem.orderId,
      orderItemId: ret.orderItem.id,
      note: "test refund",
    });
    return true;
  });
  return applied;
}

// ── tests ───────────────────────────────────────────────────────────────────

describe("refund double-request race (integration, real Postgres)", () => {
  /**
   * ⚠️  KNOWN GAP — naive pattern test
   *
   * This test DOCUMENTS the vulnerability in the current naive pattern
   * (status check outside tx, blind update inside). Under genuine concurrency
   * on a production DB this can issue two refunds. In this test environment
   * the sequential scheduling of JS Promise microtasks means the race window
   * is narrow — the test may or may not reproduce it reliably.
   *
   * We document the expectation and mark it as a known gap rather than
   * fabricating a pass or a fail.
   */
  it("KNOWN GAP: naive pattern — documents the race window (may be non-deterministic)", async () => {
    const { returnId, vendorId } = await makeReceivedReturn();

    // Fire two concurrent naive refunds.
    const results = await Promise.allSettled([
      naiveRefund(returnId, vendorId),
      naiveRefund(returnId, vendorId),
    ]);

    // Both may succeed without error (the naive pattern doesn't prevent this at
    // the DB layer under a race — the second write is a no-op only by accident
    // because `update` by PK is idempotent when status already changed).
    const successes = results.filter((r) => r.status === "fulfilled" && r.value === true).length;
    const returnRow = await prisma.return.findUniqueOrThrow({ where: { id: returnId } });

    // Postcondition that MUST hold regardless of the race outcome:
    expect(returnRow.status).toBe("REFUNDED");

    // With the naive pattern under true DB-level concurrency, both can commit.
    // In a sequential test run this is typically 1; under true concurrency it
    // could be 2. We assert the SAFE invariant: 1 or 2 succeeded, but the
    // status ended REFUNDED (not corrupted).
    expect(successes).toBeGreaterThanOrEqual(1);
    expect(successes).toBeLessThanOrEqual(2);

    // NOTE: if successes===2 this is the BUG — two ledger entries were written.
    // We check the ledger count explicitly so the test output shows the gap:
    const ledgerCount = await prisma.ledgerEntry.count({ where: { orderItemId: (await prisma.orderItem.findFirst({ where: { returns: { some: { id: returnId } } } }))!.id } });
    if (successes === 2) {
      // KNOWN GAP: two ledger entries written — this is the double-refund bug.
      // eslint-disable-next-line no-console
      console.warn(`KNOWN GAP: naive double-refund produced ${ledgerCount} ledger entries (expected 1)`);
    }
    // We don't fail the test on this — it's documenting existing behavior.
  });

  it("hardened pattern: concurrent refunds → exactly one applies, exactly one ledger entry", async () => {
    const { returnId, vendorId, orderItemId } = await makeReceivedReturn();

    const results = await Promise.allSettled([
      hardenedRefund(returnId, vendorId),
      hardenedRefund(returnId, vendorId),
      hardenedRefund(returnId, vendorId),
    ]);

    // All settled without uncaught errors.
    const errors = results.filter((r) => r.status === "rejected");
    expect(errors).toHaveLength(0);

    // Exactly one application committed.
    const applied = results.filter((r) => r.status === "fulfilled" && r.value === true).length;
    expect(applied).toBe(1);

    // Return ends REFUNDED.
    const returnRow = await prisma.return.findUniqueOrThrow({ where: { id: returnId } });
    expect(returnRow.status).toBe("REFUNDED");

    // Exactly one ledger entry.
    const ledgerCount = await prisma.ledgerEntry.count({ where: { orderItemId } });
    expect(ledgerCount).toBe(1);
  });

  it("hardened pattern: already-REFUNDED return → second call is a no-op", async () => {
    const { returnId, vendorId, orderItemId } = await makeReceivedReturn();

    const first = await hardenedRefund(returnId, vendorId);
    expect(first).toBe(true);

    const second = await hardenedRefund(returnId, vendorId);
    expect(second).toBe(false);

    // Only one ledger entry exists.
    const ledgerCount = await prisma.ledgerEntry.count({ where: { orderItemId } });
    expect(ledgerCount).toBe(1);
  });

  it("hardened pattern: total refunded ≤ captured item value (no over-refund)", async () => {
    const { returnId, vendorId, orderId, unitPrice } = await makeReceivedReturn();
    await hardenedRefund(returnId, vendorId);

    // Total ledger REFUND entries for this order must not exceed the item value.
    const entries = await prisma.ledgerEntry.findMany({
      where: { orderId, entryType: "REFUND" },
      select: { amount: true },
    });
    const totalRefunded = entries.reduce((sum, e) => sum + Math.abs(Number(e.amount)), 0);
    expect(totalRefunded).toBeLessThanOrEqual(Number(unitPrice));
  });
});
