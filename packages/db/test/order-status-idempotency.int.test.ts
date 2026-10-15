/**
 * Order-status double-recompute idempotency tests (Part 5)
 *
 * `recomputeOrderStatus` (packages/db/src/order-status.ts) reads item
 * fulfillment statuses and derives a new order status, then only updates
 * the DB when the status changes.  It uses `.catch(() => null)` guards.
 *
 * `applyShipmentStatus` calls recomputeOrderStatus after a shipment update.
 *
 * INVARIANTS UNDER TEST:
 *  1. Calling recomputeOrderStatus twice in a row on the same order is a no-op
 *     the second time (idempotent, no corruption).
 *  2. Concurrent recompute calls on the same order all resolve without error
 *     and the order ends in the correct terminal state.
 *  3. Applying the same shipment DELIVERED status twice (duplicate webhook)
 *     does not move the order beyond DELIVERED or throw.
 *  4. Recomputing on a CANCELLED/REFUNDED order is a no-op (AGGREGATE_RANGE
 *     guard prevents overwriting terminal states).
 *  5. Recomputing on a non-existent order is a no-op (no error thrown).
 */

import { describe, it, expect } from "vitest";
import { prisma } from "../src/client";
import { recomputeOrderStatus, applyShipmentStatus } from "../src/order-status";
import { makeCustomer, makeVariant } from "./factories";

// ── helpers ────────────────────────────────────────────────────────────────

let _n = 0;
const uid = (p: string) => `${p}_ostat_${Date.now()}_${_n++}_${Math.random().toString(36).slice(2, 6)}`;

async function orderStatusOf(orderId: string) {
  const o = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true } });
  return o.status;
}

async function makeConfirmedOrder() {
  const { profileId, userId } = await makeCustomer(0);
  const address = await prisma.address.create({
    data: { userId, fullName: "T", phone: "050", addressLine1: "1 St", city: "Dubai" },
  });
  const { variantId, vendorId } = await makeVariant(10);

  const order = await prisma.order.create({
    data: {
      customerId: profileId,
      addressId: address.id,
      status: "CONFIRMED",
      subtotal: "100",
      total: "100",
      paymentMethod: "CARD",
      // Items start PENDING so recompute derives "CONFIRMED" (no advancement) —
      // AGGREGATE_RANGE includes CONFIRMED, but the derived status = CONFIRMED
      // when no items are SHIPPED/DELIVERED/PROCESSING/RETURNED.
      // Actually: PENDING items → derived "CONFIRMED" (the fallback/else case).
      items: {
        create: { variantId, vendorId, quantity: 1, unitPrice: "100.00", fulfillmentStatus: "PENDING" },
      },
    },
  });
  return { orderId: order.id, variantId, vendorId };
}

async function makeDeliveredOrder() {
  const { orderId, variantId, vendorId } = await makeConfirmedOrder();

  // Ship all items.
  const shipment = await prisma.shipment.create({
    data: { orderId, vendorId, courier: "aramex", status: "IN_TRANSIT" },
  });
  await prisma.orderItem.updateMany({
    where: { orderId },
    data: { fulfillmentStatus: "DELIVERED", shipmentId: shipment.id },
  });
  await prisma.shipment.update({ where: { id: shipment.id }, data: { status: "DELIVERED" } });
  await prisma.order.update({ where: { id: orderId }, data: { status: "DELIVERED" } });

  return { orderId, shipmentId: shipment.id };
}

// ── tests ───────────────────────────────────────────────────────────────────

describe("recomputeOrderStatus — idempotency (integration, real Postgres)", () => {
  it("sequential double-recompute on CONFIRMED order → idempotent", async () => {
    const { orderId } = await makeConfirmedOrder();
    // Items are PENDING → recompute derives "CONFIRMED" (the fallback), no change.

    await recomputeOrderStatus(orderId);
    expect(await orderStatusOf(orderId)).toBe("CONFIRMED");

    // Second call — same result, no error.
    await recomputeOrderStatus(orderId);
    expect(await orderStatusOf(orderId)).toBe("CONFIRMED");
  });

  it("concurrent recompute calls all resolve, order ends in consistent state", async () => {
    const { orderId } = await makeConfirmedOrder();

    // Promote all items to SHIPPED so recompute should advance to SHIPPED.
    await prisma.orderItem.updateMany({
      where: { orderId },
      data: { fulfillmentStatus: "SHIPPED" },
    });

    // 10 concurrent recompute calls.
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => recomputeOrderStatus(orderId)),
    );

    // None should reject.
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(0);

    // Order must be SHIPPED.
    expect(await orderStatusOf(orderId)).toBe("SHIPPED");
  });

  it("concurrent double-recompute toward DELIVERED → consistent, no corruption", async () => {
    const { orderId } = await makeConfirmedOrder();

    // Promote all items to DELIVERED.
    await prisma.orderItem.updateMany({
      where: { orderId },
      data: { fulfillmentStatus: "DELIVERED" },
    });

    // 20 concurrent recompute calls.
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => recomputeOrderStatus(orderId)),
    );

    expect(results.filter((r) => r.status === "rejected")).toHaveLength(0);
    expect(await orderStatusOf(orderId)).toBe("DELIVERED");
  });

  it("terminal CANCELLED order: recompute is a no-op (AGGREGATE_RANGE guard)", async () => {
    const { orderId } = await makeConfirmedOrder();
    await prisma.order.update({ where: { id: orderId }, data: { status: "CANCELLED" } });

    // Promote items to DELIVERED (to simulate a potential race).
    await prisma.orderItem.updateMany({ where: { orderId }, data: { fulfillmentStatus: "DELIVERED" } });

    await recomputeOrderStatus(orderId);
    // Must still be CANCELLED — the AGGREGATE_RANGE guard skips non-[CONFIRMED..DELIVERED] orders.
    expect(await orderStatusOf(orderId)).toBe("CANCELLED");
  });

  it("terminal REFUNDED order: recompute is a no-op", async () => {
    const { orderId } = await makeConfirmedOrder();
    await prisma.order.update({ where: { id: orderId }, data: { status: "REFUNDED" } });
    await prisma.orderItem.updateMany({ where: { orderId }, data: { fulfillmentStatus: "RETURNED" } });

    await recomputeOrderStatus(orderId);
    expect(await orderStatusOf(orderId)).toBe("REFUNDED");
  });

  it("non-existent order: recompute is a no-op (no error)", async () => {
    await expect(recomputeOrderStatus("nonexistent-order-id")).resolves.toBeUndefined();
  });
});

describe("applyShipmentStatus — idempotency (integration, real Postgres)", () => {
  it("applying DELIVERED twice → order stays DELIVERED, no duplicate item updates", async () => {
    const { orderId, shipmentId } = await makeDeliveredOrder();

    // Apply DELIVERED again (duplicate webhook).
    await applyShipmentStatus(shipmentId, "DELIVERED");

    // Order stays DELIVERED.
    expect(await orderStatusOf(orderId)).toBe("DELIVERED");

    // Items are still DELIVERED (not corrupted).
    const items = await prisma.orderItem.findMany({ where: { orderId }, select: { fulfillmentStatus: true } });
    expect(items.every((i) => i.fulfillmentStatus === "DELIVERED")).toBe(true);
  });

  it("concurrent duplicate DELIVERED events → all resolve, order consistent", async () => {
    const { orderId, shipmentId } = await makeDeliveredOrder();

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => applyShipmentStatus(shipmentId, "DELIVERED")),
    );

    // All should resolve (applyShipmentStatus uses .catch guards).
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(0);
    expect(await orderStatusOf(orderId)).toBe("DELIVERED");
  });

  it("applying same IN_TRANSIT status twice → idempotent (early-return guard)", async () => {
    const { orderId, variantId, vendorId } = await makeConfirmedOrder();
    const shipment = await prisma.shipment.create({
      data: { orderId, vendorId, courier: "fetchr", status: "IN_TRANSIT" },
    });

    // Apply same status twice — should be a no-op each time.
    await applyShipmentStatus(shipment.id, "IN_TRANSIT");
    await applyShipmentStatus(shipment.id, "IN_TRANSIT");

    const s = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id }, select: { status: true } });
    expect(s.status).toBe("IN_TRANSIT");
  });

  it("non-existent shipment: applyShipmentStatus is a no-op", async () => {
    await expect(applyShipmentStatus("nonexistent-shipment-id", "DELIVERED")).resolves.toBeUndefined();
  });
});
