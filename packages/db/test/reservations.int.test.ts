import { describe, it, expect } from "vitest";
import { prisma } from "../src/client";
import {
  reserveInventory,
  commitReservation,
  releaseReservation,
  expireStaleReservations,
} from "../src/reservations";
import { InsufficientInventoryError, InvalidAmountError } from "../src/errors";
import { makeVariant, stockOf } from "./factories";

const uniqKey = (p = "resv") => `${p}_${Date.now()}_${Math.random().toString(36).slice(2)}`;

describe("inventory reservations (integration, real Postgres)", () => {
  it("reserves stock and records an ACTIVE hold", async () => {
    const { variantId } = await makeVariant(5);
    const key = uniqKey();
    const r = await prisma.$transaction((tx) =>
      reserveInventory(tx, { idempotencyKey: key, lines: [{ variantId, quantity: 2 }] }),
    );
    expect(r.status).toBe("ACTIVE");
    expect(await stockOf(variantId)).toBe(3);
  });

  it("is idempotent — the same key never double-decrements", async () => {
    const { variantId } = await makeVariant(5);
    const key = uniqKey();
    const first = await prisma.$transaction((tx) =>
      reserveInventory(tx, { idempotencyKey: key, lines: [{ variantId, quantity: 2 }] }),
    );
    const second = await prisma.$transaction((tx) =>
      reserveInventory(tx, { idempotencyKey: key, lines: [{ variantId, quantity: 2 }] }),
    );
    expect(second.id).toBe(first.id);
    expect(await stockOf(variantId)).toBe(3); // decremented once, not twice
  });

  it("rejects an over-reservation and leaves stock + holds untouched", async () => {
    const { variantId } = await makeVariant(1);
    const key = uniqKey();
    await expect(
      prisma.$transaction((tx) =>
        reserveInventory(tx, { idempotencyKey: key, lines: [{ variantId, quantity: 5 }] }),
      ),
    ).rejects.toBeInstanceOf(InsufficientInventoryError);
    expect(await stockOf(variantId)).toBe(1);
    expect(await prisma.inventoryReservation.findUnique({ where: { idempotencyKey: key } })).toBeNull();
  });

  it("rejects non-positive / non-integer quantities", async () => {
    const { variantId } = await makeVariant(5);
    await expect(
      prisma.$transaction((tx) =>
        reserveInventory(tx, { idempotencyKey: uniqKey(), lines: [{ variantId, quantity: 0 }] }),
      ),
    ).rejects.toBeInstanceOf(InvalidAmountError);
    await expect(
      prisma.$transaction((tx) =>
        reserveInventory(tx, { idempotencyKey: uniqKey(), lines: [{ variantId, quantity: 1.5 }] }),
      ),
    ).rejects.toBeInstanceOf(InvalidAmountError);
  });

  it("commit makes the hold permanent — stock is NOT returned", async () => {
    const { variantId } = await makeVariant(5);
    const key = uniqKey();
    await prisma.$transaction((tx) =>
      reserveInventory(tx, { idempotencyKey: key, lines: [{ variantId, quantity: 2 }] }),
    );
    const committed = await prisma.$transaction((tx) => commitReservation(tx, key, "order_1"));
    expect(committed).toBe(true);
    // second commit is a no-op
    expect(await prisma.$transaction((tx) => commitReservation(tx, key))).toBe(false);
    // release after commit must NOT return stock
    expect(await prisma.$transaction((tx) => releaseReservation(tx, key))).toBe(false);
    expect(await stockOf(variantId)).toBe(3);
    const row = await prisma.inventoryReservation.findUniqueOrThrow({ where: { idempotencyKey: key } });
    expect(row.status).toBe("COMMITTED");
    expect(row.orderId).toBe("order_1");
  });

  it("release returns stock exactly once (idempotent recovery)", async () => {
    const { variantId } = await makeVariant(5);
    const key = uniqKey();
    await prisma.$transaction((tx) =>
      reserveInventory(tx, { idempotencyKey: key, lines: [{ variantId, quantity: 2 }] }),
    );
    expect(await stockOf(variantId)).toBe(3);
    expect(await prisma.$transaction((tx) => releaseReservation(tx, key))).toBe(true);
    expect(await stockOf(variantId)).toBe(5); // returned
    // second release is a no-op — no double return
    expect(await prisma.$transaction((tx) => releaseReservation(tx, key))).toBe(false);
    expect(await stockOf(variantId)).toBe(5);
  });

  it("concurrent releases return stock only once", async () => {
    const { variantId } = await makeVariant(10);
    const key = uniqKey();
    await prisma.$transaction((tx) =>
      reserveInventory(tx, { idempotencyKey: key, lines: [{ variantId, quantity: 4 }] }),
    );
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () => prisma.$transaction((tx) => releaseReservation(tx, key))),
    );
    const trueCount = results.filter((r) => r.status === "fulfilled" && r.value === true).length;
    expect(trueCount).toBe(1);
    expect(await stockOf(variantId)).toBe(10); // 6 + 4, returned exactly once
  });

  it("the sweeper expires stale ACTIVE holds and returns their stock", async () => {
    const { variantId } = await makeVariant(5);
    const key = uniqKey();
    await prisma.$transaction((tx) =>
      reserveInventory(tx, {
        idempotencyKey: key,
        lines: [{ variantId, quantity: 3 }],
        ttlMs: -1000, // already expired
      }),
    );
    expect(await stockOf(variantId)).toBe(2);
    const res = await expireStaleReservations(prisma, { now: new Date() });
    expect(res.expired).toBeGreaterThanOrEqual(1);
    expect(await stockOf(variantId)).toBe(5); // returned
    expect((await prisma.inventoryReservation.findUniqueOrThrow({ where: { idempotencyKey: key } })).status).toBe(
      "EXPIRED",
    );
    // a second sweep does not touch it again
    const before = await stockOf(variantId);
    await expireStaleReservations(prisma, { now: new Date() });
    expect(await stockOf(variantId)).toBe(before);
  });

  it("the sweeper leaves un-expired and committed holds alone", async () => {
    const live = await makeVariant(5);
    const liveKey = uniqKey();
    await prisma.$transaction((tx) =>
      reserveInventory(tx, { idempotencyKey: liveKey, lines: [{ variantId: live.variantId, quantity: 1 }], ttlMs: 60_000 }),
    );
    const sold = await makeVariant(5);
    const soldKey = uniqKey();
    await prisma.$transaction((tx) =>
      reserveInventory(tx, { idempotencyKey: soldKey, lines: [{ variantId: sold.variantId, quantity: 1 }], ttlMs: -1000 }),
    );
    await prisma.$transaction((tx) => commitReservation(tx, soldKey));

    await expireStaleReservations(prisma, { now: new Date() });

    expect(await stockOf(live.variantId)).toBe(4); // still held (not expired)
    expect(await stockOf(sold.variantId)).toBe(4); // committed = sold, not returned
    expect((await prisma.inventoryReservation.findUniqueOrThrow({ where: { idempotencyKey: liveKey } })).status).toBe(
      "ACTIVE",
    );
  });
});
