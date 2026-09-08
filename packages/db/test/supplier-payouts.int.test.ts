import { describe, it, expect } from "vitest";
import { prisma } from "../src/client";
import { computeSupplierBalance, createSupplierPayout } from "../src/supplier-payouts";
import { makeSupplierOnly, makeMaterialOrder } from "./factories";

describe("computeSupplierBalance (integration)", () => {
  it("earns the full total of COMPLETED orders (wholesale, no commission)", async () => {
    const { supplierId } = await makeSupplierOnly();
    await makeMaterialOrder(supplierId, "300.00", "COMPLETED");
    await makeMaterialOrder(supplierId, "150.50", "COMPLETED");
    const b = await computeSupplierBalance(supplierId);
    expect(b.earned.toString()).toBe("450.5");
    expect(b.available.toString()).toBe("450.5");
  });

  it("excludes non-COMPLETED orders (pending/accepted/shipped/cancelled)", async () => {
    const { supplierId } = await makeSupplierOnly();
    await makeMaterialOrder(supplierId, "100.00", "COMPLETED");
    await makeMaterialOrder(supplierId, "999.00", "SHIPPED");
    await makeMaterialOrder(supplierId, "999.00", "PENDING");
    await makeMaterialOrder(supplierId, "999.00", "CANCELLED");
    const b = await computeSupplierBalance(supplierId);
    expect(b.earned.toString()).toBe("100");
  });

  it("subtracts in-flight PENDING/PROCESSING payouts via `reserved`", async () => {
    const { supplierId } = await makeSupplierOnly();
    await makeMaterialOrder(supplierId, "200.00", "COMPLETED");
    await prisma.supplierPayout.create({
      data: { supplierId, amount: "120.00", currency: "AED", ibanNumber: "AE0", status: "PENDING" },
    });
    const b = await computeSupplierBalance(supplierId);
    expect(b.reserved.toString()).toBe("120");
    expect(b.available.toString()).toBe("80");
  });

  it("counts COMPLETED payouts as paidOut", async () => {
    const { supplierId } = await makeSupplierOnly();
    await makeMaterialOrder(supplierId, "200.00", "COMPLETED");
    await prisma.supplierPayout.create({
      data: { supplierId, amount: "50.00", currency: "AED", ibanNumber: "AE0", status: "COMPLETED" },
    });
    const b = await computeSupplierBalance(supplierId);
    expect(b.paidOut.toString()).toBe("50");
    expect(b.available.toString()).toBe("150");
  });
});

describe("createSupplierPayout (integration)", () => {
  it("creates one payout for the available balance, then blocks a second", async () => {
    const { supplierId } = await makeSupplierOnly();
    await makeMaterialOrder(supplierId, "300.00", "COMPLETED");

    const first = await createSupplierPayout(supplierId, "AE0");
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.amount.toString()).toBe("300");

    const second = await createSupplierPayout(supplierId, "AE0");
    expect(second.ok).toBe(false);
    expect(await prisma.supplierPayout.count({ where: { supplierId } })).toBe(1);
  });

  // Core invariant: a balance can never be paid out twice under a race.
  it("never double-pays under concurrent createSupplierPayout", async () => {
    const { supplierId } = await makeSupplierOnly();
    await makeMaterialOrder(supplierId, "500.00", "COMPLETED");

    const results = await Promise.allSettled([
      createSupplierPayout(supplierId, "AE0"),
      createSupplierPayout(supplierId, "AE0"),
      createSupplierPayout(supplierId, "AE0"),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled" && r.value.ok).length;
    expect(ok).toBe(1);

    const payouts = await prisma.supplierPayout.findMany({ where: { supplierId } });
    expect(payouts).toHaveLength(1);
    expect(payouts[0].amount.toString()).toBe("500");
  });
});
