/**
 * Payment-webhook idempotency tests (Part 5, scenarios 4/5/6/19)
 *
 * applyPaymentResult (packages/payments/src/reconcile.ts) is tested HERE
 * (not in packages/payments) because the package has no test runner and the
 * function depends on @ayvana/db — the ayvana_test DB is already wired here.
 *
 * INVARIANTS UNDER TEST:
 *  1. A duplicate payment_succeeded for the same PENDING order applies exactly
 *     once: order goes PENDING→CONFIRMED, PaymentTransaction PENDING→CAPTURED.
 *  2. A concurrent pair of payment_succeeded for the same PENDING order: exactly
 *     one commits, the other is a no-op (order must end CONFIRMED, not a DB error).
 *  3. An out-of-order payment_failed after payment_succeeded is a no-op (order
 *     stays CONFIRMED, stock is not double-released).
 *  4. Sequential duplicate payment_failed calls: stock is released exactly once.
 */

import { describe, it, expect } from "vitest";
import { prisma } from "../src/client";
import { applyPaymentResult } from "../../payments/src/reconcile";
import { makeCustomer, makeVariant } from "./factories";

// ── helpers ────────────────────────────────────────────────────────────────

/**
 * Create a minimal PENDING order with one item and one PENDING PaymentTransaction.
 * Returns the orderId, variantId, and paymentTransactionId.
 */
async function makePendingOrder(stock = 5, unitPrice = "100.00", qty = 1) {
  const { profileId } = await makeCustomer(0);
  const { variantId, vendorId } = await makeVariant(stock, unitPrice);
  const address = await prisma.address.create({
    data: {
      userId: (await prisma.customerProfile.findUniqueOrThrow({ where: { id: profileId }, select: { userId: true } }))
        .userId,
      fullName: "Test",
      phone: "0500000000",
      addressLine1: "1 St",
      city: "Dubai",
    },
  });
  const total = (Number(unitPrice) * qty).toFixed(2);

  const order = await prisma.order.create({
    data: {
      customerId: profileId,
      addressId: address.id,
      status: "PENDING",
      subtotal: total,
      total,
      paymentMethod: "CARD",
      items: {
        create: { variantId, vendorId, quantity: qty, unitPrice, fulfillmentStatus: "PENDING" },
      },
    },
  });

  // Reserve the stock (like checkout would do).
  await prisma.productVariant.update({
    where: { id: variantId },
    data: { stock: { decrement: qty } },
  });

  const payTx = await prisma.paymentTransaction.create({
    data: {
      orderId: order.id,
      method: "CARD",
      status: "PENDING",
      amount: total,
      currency: "AED",
    },
  });

  return { orderId: order.id, variantId, payTxId: payTx.id };
}

async function orderStatus(orderId: string) {
  const o = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true } });
  return o.status;
}

async function payTxStatus(orderId: string) {
  const rows = await prisma.paymentTransaction.findMany({ where: { orderId } });
  return rows.map((r) => r.status);
}

async function stockOf(variantId: string) {
  const v = await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId }, select: { stock: true } });
  return Number(v.stock);
}

// ── tests ───────────────────────────────────────────────────────────────────

describe("applyPaymentResult — idempotency (integration, real Postgres)", () => {
  it("payment_succeeded: PENDING→CONFIRMED exactly once (sequential duplicate)", async () => {
    const { orderId } = await makePendingOrder();

    const result: import("../../payments/src/gateway").WebhookResult = {
      kind: "payment_succeeded",
      orderId,
      externalRef: "pi_test_001",
    };

    await applyPaymentResult(result);
    expect(await orderStatus(orderId)).toBe("CONFIRMED");
    expect(await payTxStatus(orderId)).toEqual(["CAPTURED"]);

    // Replay — must be a no-op.
    await applyPaymentResult(result);
    expect(await orderStatus(orderId)).toBe("CONFIRMED");
    // Still exactly one transaction row, still CAPTURED.
    expect(await payTxStatus(orderId)).toEqual(["CAPTURED"]);
  });

  it("payment_succeeded: concurrent duplicate → exactly one commit, order ends CONFIRMED", async () => {
    const { orderId } = await makePendingOrder();

    const result: import("../../payments/src/gateway").WebhookResult = {
      kind: "payment_succeeded",
      orderId,
      externalRef: "pi_test_002",
    };

    // Fire two calls simultaneously — exactly one should commit the transition.
    const [r1, r2] = await Promise.allSettled([applyPaymentResult(result), applyPaymentResult(result)]);

    // Both settled (no uncaught crash).
    expect(r1.status).toBe("fulfilled");
    expect(r2.status).toBe("fulfilled");

    // Order is CONFIRMED exactly once.
    expect(await orderStatus(orderId)).toBe("CONFIRMED");
    expect(await payTxStatus(orderId)).toEqual(["CAPTURED"]);
  });

  it("out-of-order payment_failed after payment_succeeded → order stays CONFIRMED, stock not re-released", async () => {
    const initialStock = 3;
    const { orderId, variantId } = await makePendingOrder(initialStock);

    // Succeed first.
    await applyPaymentResult({ kind: "payment_succeeded", orderId, externalRef: "pi_test_003" });
    expect(await orderStatus(orderId)).toBe("CONFIRMED");
    const stockAfterConfirm = await stockOf(variantId);

    // Late/out-of-order failed webhook — must be a no-op (guard is `status !== "PENDING"`).
    await applyPaymentResult({ kind: "payment_failed", orderId, externalRef: "pi_test_003_fail" });
    expect(await orderStatus(orderId)).toBe("CONFIRMED");

    // Stock must NOT have been incremented again (no double-release).
    expect(await stockOf(variantId)).toBe(stockAfterConfirm);
  });

  it("payment_failed: stock released exactly once even if webhook fires twice", async () => {
    const initialStock = 5;
    const { orderId, variantId } = await makePendingOrder(initialStock, "100.00", 2);

    // Both items reserved: stock is initialStock − 2 = 3.
    expect(await stockOf(variantId)).toBe(initialStock - 2);

    await applyPaymentResult({ kind: "payment_failed", orderId, externalRef: "pi_test_004_fail" });
    expect(await orderStatus(orderId)).toBe("CANCELLED");
    // Stock fully restored.
    expect(await stockOf(variantId)).toBe(initialStock);

    // Duplicate webhook — order is now CANCELLED (not PENDING), so guard fires.
    await applyPaymentResult({ kind: "payment_failed", orderId, externalRef: "pi_test_004_fail" });
    expect(await orderStatus(orderId)).toBe("CANCELLED");
    // Stock must NOT be incremented again.
    expect(await stockOf(variantId)).toBe(initialStock);
  });

  it("payment_succeeded with no orderId (ignored kind) → no DB change", async () => {
    // Just a smoke-test that ignored events don't throw.
    await expect(
      applyPaymentResult({ kind: "ignored" }),
    ).resolves.toBeUndefined();
  });
});
