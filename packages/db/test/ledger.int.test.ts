import { describe, it, expect } from "vitest";
import { prisma } from "../src/client";
import { computeVendorBalance, appendLedgerEntry, createVendorPayout } from "../src/ledger";
import { makeVendorOnly, makeSale } from "./factories";

describe("computeVendorBalance (integration)", () => {
  it("computes gross/commission/net with Decimal (no float drift)", async () => {
    const { vendorId } = await makeVendorOnly("0.15");
    await makeSale(vendorId, "10.10", 10); // gross 101.00 (float would be 101.00000000000001)
    const b = await computeVendorBalance(vendorId);
    expect(b.grossRevenue.toString()).toBe("101");
    expect(b.commission.toString()).toBe("15.15");
    expect(b.netEarned.toString()).toBe("85.85");
    expect(b.available.toString()).toBe("85.85");
  });

  it("excludes RETURNED (refunded) items from gross", async () => {
    const { vendorId } = await makeVendorOnly("0.10");
    await makeSale(vendorId, "100.00", 1, "DELIVERED");
    await makeSale(vendorId, "100.00", 1, "RETURNED");
    const b = await computeVendorBalance(vendorId);
    expect(b.grossRevenue.toString()).toBe("100");
    expect(b.available.toString()).toBe("90");
  });

  it("subtracts in-flight PENDING/PROCESSING payouts via `reserved`", async () => {
    const { vendorId } = await makeVendorOnly("0");
    await makeSale(vendorId, "200.00", 1);
    await prisma.payout.create({
      data: { vendorId, amount: "120.00", currency: "AED", ibanNumber: "AE0", status: "PENDING" },
    });
    const b = await computeVendorBalance(vendorId);
    expect(b.reserved.toString()).toBe("120");
    expect(b.available.toString()).toBe("80");
  });

  it("counts COMPLETED payouts as paidOut", async () => {
    const { vendorId } = await makeVendorOnly("0");
    await makeSale(vendorId, "200.00", 1);
    await prisma.payout.create({
      data: { vendorId, amount: "50.00", currency: "AED", ibanNumber: "AE0", status: "COMPLETED" },
    });
    const b = await computeVendorBalance(vendorId);
    expect(b.paidOut.toString()).toBe("50");
    expect(b.available.toString()).toBe("150");
  });
});

describe("appendLedgerEntry (integration)", () => {
  it("writes a signed, append-only row", async () => {
    const { vendorId } = await makeVendorOnly();
    await appendLedgerEntry(prisma, { vendorId, entryType: "PAYOUT", amount: -100, note: "test" });
    const rows = await prisma.ledgerEntry.findMany({ where: { vendorId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].entryType).toBe("PAYOUT");
    expect(rows[0].amount.toString()).toBe("-100");
  });
});

describe("createVendorPayout (integration)", () => {
  it("creates one payout for the available balance, then blocks a second", async () => {
    const { vendorId } = await makeVendorOnly("0");
    await makeSale(vendorId, "300.00", 1);

    const first = await createVendorPayout(vendorId, "AE0");
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.amount.toString()).toBe("300");

    // Second attempt sees the PENDING payout in `reserved` -> nothing available.
    const second = await createVendorPayout(vendorId, "AE0");
    expect(second.ok).toBe(false);

    expect(await prisma.payout.count({ where: { vendorId } })).toBe(1);
  });

  // The core invariant: a balance can never be paid out twice under a race.
  it("never double-pays under concurrent createVendorPayout", async () => {
    const { vendorId } = await makeVendorOnly("0");
    await makeSale(vendorId, "500.00", 1);

    const results = await Promise.allSettled([
      createVendorPayout(vendorId, "AE0"),
      createVendorPayout(vendorId, "AE0"),
      createVendorPayout(vendorId, "AE0"),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled" && r.value.ok).length;
    expect(ok).toBe(1);

    const payouts = await prisma.payout.findMany({ where: { vendorId } });
    expect(payouts).toHaveLength(1);
    expect(payouts[0].amount.toString()).toBe("500");
  });
});
