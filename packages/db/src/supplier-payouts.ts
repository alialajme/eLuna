import type { Prisma } from "@prisma/client";
import { prisma } from "./client";
import { money, round2, type Money } from "./money";

type Tx = Prisma.TransactionClient;
type Client = Tx | typeof prisma;

export type SupplierBalance = {
  earned: Money; // Σ COMPLETED material-order totals (wholesale — no marketplace commission)
  reserved: Money; // PENDING + PROCESSING payouts (in-flight)
  paidOut: Money; // COMPLETED payouts
  available: Money; // earned − reserved − paidOut, floored at 0
};

/**
 * Authoritative supplier balance, computed with Decimal (never float).
 *
 * Suppliers earn the full order total (wholesale — no commission, unlike
 * vendors). Mirrors `computeVendorBalance`: `reserved` subtracts in-flight
 * (PENDING/PROCESSING) payouts as well as COMPLETED ones so an existing pending
 * payout reduces the amount available for a new one (prevents double-payout).
 * Pass a transaction client (after `SELECT … FOR UPDATE` on the supplier) for a
 * race-safe read.
 */
export async function computeSupplierBalance(
  supplierId: string,
  client: Client = prisma,
): Promise<SupplierBalance> {
  const [orders, payouts] = await Promise.all([
    client.materialOrder.findMany({
      where: { supplierId, status: "COMPLETED" },
      select: { total: true },
    }),
    client.supplierPayout.findMany({
      where: { supplierId, status: { in: ["PENDING", "PROCESSING", "COMPLETED"] } },
      select: { amount: true, status: true },
    }),
  ]);

  const earned = orders.reduce((sum, o) => sum.plus(money(o.total)), money(0));
  const reserved = payouts
    .filter((p) => p.status === "PENDING" || p.status === "PROCESSING")
    .reduce((sum, p) => sum.plus(money(p.amount)), money(0));
  const paidOut = payouts
    .filter((p) => p.status === "COMPLETED")
    .reduce((sum, p) => sum.plus(money(p.amount)), money(0));

  const availableRaw = earned.minus(reserved).minus(paidOut);
  const available = availableRaw.gt(0) ? round2(availableRaw) : money(0);

  return {
    earned: round2(earned),
    reserved: round2(reserved),
    paidOut: round2(paidOut),
    available,
  };
}

export type CreateSupplierPayoutResult =
  | { ok: true; payoutId: string; amount: Money }
  | { ok: false; reason: "NO_BALANCE" };

/**
 * Race-safe supplier payout creation. Takes a `FOR UPDATE` lock on the supplier
 * row so concurrent calls serialize: the second sees the first's PENDING payout
 * in `reserved` and computes 0 available — so a balance is never paid twice.
 */
export async function createSupplierPayout(
  supplierId: string,
  ibanNumber: string,
): Promise<CreateSupplierPayoutResult> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Supplier" WHERE id = ${supplierId} FOR UPDATE`;
    const balance = await computeSupplierBalance(supplierId, tx);
    if (balance.available.lte(0)) return { ok: false, reason: "NO_BALANCE" };

    const payout = await tx.supplierPayout.create({
      data: {
        supplierId,
        amount: balance.available,
        currency: "AED",
        ibanNumber,
        status: "PENDING",
      },
    });
    return { ok: true, payoutId: payout.id, amount: balance.available };
  });
}
