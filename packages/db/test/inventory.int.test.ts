import { describe, it, expect } from "vitest";
import { prisma } from "../src/client";
import { reserveStockTx, releaseStockTx } from "../src/inventory";
import { InsufficientInventoryError } from "../src/errors";
import { makeVariant, stockOf } from "./factories";

describe("inventory reservation (integration, real Postgres)", () => {
  it("decrements stock atomically on reserve", async () => {
    const { variantId } = await makeVariant(5);
    await prisma.$transaction((tx) => reserveStockTx(tx, [{ variantId, quantity: 2 }]));
    expect(await stockOf(variantId)).toBe(3);
  });

  it("throws InsufficientInventoryError and rolls back when stock is short", async () => {
    const { variantId } = await makeVariant(1);
    await expect(
      prisma.$transaction((tx) => reserveStockTx(tx, [{ variantId, quantity: 2 }])),
    ).rejects.toBeInstanceOf(InsufficientInventoryError);
    expect(await stockOf(variantId)).toBe(1); // unchanged
  });

  it("rolls back ALL lines if any single line is short (transactional)", async () => {
    const a = await makeVariant(5);
    const b = await makeVariant(0);
    await expect(
      prisma.$transaction((tx) =>
        reserveStockTx(tx, [
          { variantId: a.variantId, quantity: 1 },
          { variantId: b.variantId, quantity: 1 },
        ]),
      ),
    ).rejects.toBeInstanceOf(InsufficientInventoryError);
    expect(await stockOf(a.variantId)).toBe(5); // first line rolled back too
  });

  it("release restores stock", async () => {
    const { variantId } = await makeVariant(3);
    await prisma.$transaction((tx) => reserveStockTx(tx, [{ variantId, quantity: 3 }]));
    expect(await stockOf(variantId)).toBe(0);
    await prisma.$transaction((tx) => releaseStockTx(tx, [{ variantId, quantity: 3 }]));
    expect(await stockOf(variantId)).toBe(3);
  });

  // The core invariant: stock=3, 100 concurrent single-unit buyers -> exactly 3 succeed.
  it("never oversells under 100 concurrent buyers (stock=3)", async () => {
    const { variantId } = await makeVariant(3);

    const attempts = Array.from({ length: 100 }, () =>
      prisma.$transaction((tx) => reserveStockTx(tx, [{ variantId, quantity: 1 }])),
    );
    const results = await Promise.allSettled(attempts);

    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;

    expect(succeeded).toBe(3);
    expect(failed).toBe(97);
    const finalStock = await stockOf(variantId);
    expect(finalStock).toBe(0); // never negative
    expect(finalStock).toBeGreaterThanOrEqual(0);
  });
});
