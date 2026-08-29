import { Prisma, type LedgerEntryType } from "@prisma/client";
import { prisma } from "./client";
import { money, round2, type Money } from "./money";
import { InvalidAmountError } from "./errors";

type Tx = Prisma.TransactionClient;
type Client = Tx | typeof prisma;

export type LedgerEntryInput = {
  vendorId: string;
  entryType: LedgerEntryType;
  amount: Prisma.Decimal.Value; // signed: credit +, debit −
  orderId?: string;
  orderItemId?: string;
  payoutId?: string;
  note?: string;
};

/**
 * Append one immutable ledger row. Use inside the same transaction as the state
 * change it records so the movement and its audit entry commit atomically.
 */
export async function appendLedgerEntry(client: Client, input: LedgerEntryInput) {
  return client.ledgerEntry.create({
    data: {
      vendorId: input.vendorId,
      entryType: input.entryType,
      amount: money(input.amount),
      orderId: input.orderId ?? null,
      orderItemId: input.orderItemId ?? null,
      payoutId: input.payoutId ?? null,
      note: input.note ?? null,
    },
  });
}

export type VendorBalance = {
  grossRevenue: Money; // sum of delivered item line totals
  commission: Money; // platform cut
  netEarned: Money; // grossRevenue − commission
  reserved: Money; // PENDING + PROCESSING payouts (in-flight, not yet paid)
  paidOut: Money; // COMPLETED payouts
  available: Money; // netEarned − reserved − paidOut, floored at 0
};

/**
 * Authoritative vendor balance, computed with Decimal (never float).
 *
 * Fixes the double-payout bug: `reserved` subtracts in-flight (PENDING/
 * PROCESSING) payouts as well as COMPLETED ones, so an existing pending payout
 * reduces the amount available for a new one. Pass a transaction client (after a
 * `SELECT … FOR UPDATE` on the vendor) to make the read race-safe.
 *
 * Revenue is derived from DELIVERED order items — refunded items become RETURNED
 * and are excluded automatically, so refunds reduce the balance without a
 * separate write.
 */
export async function computeVendorBalance(
  vendorId: string,
  client: Client = prisma,
): Promise<VendorBalance> {
  const [items, payouts, vendor] = await Promise.all([
    client.orderItem.findMany({
      where: { vendorId, fulfillmentStatus: "DELIVERED" },
      select: { unitPrice: true, quantity: true },
    }),
    client.payout.findMany({
      where: { vendorId, status: { in: ["PENDING", "PROCESSING", "COMPLETED"] } },
      select: { amount: true, status: true },
    }),
    client.vendor.findUnique({ where: { id: vendorId }, select: { commissionRate: true } }),
  ]);

  const commissionRate = money(vendor?.commissionRate ?? "0.15");
  const grossRevenue = items.reduce((sum, i) => sum.plus(money(i.unitPrice).mul(i.quantity)), money(0));
  const commission = round2(grossRevenue.mul(commissionRate));
  const netEarned = round2(grossRevenue).minus(commission);

  const reserved = payouts
    .filter((p) => p.status === "PENDING" || p.status === "PROCESSING")
    .reduce((sum, p) => sum.plus(money(p.amount)), money(0));
  const paidOut = payouts
    .filter((p) => p.status === "COMPLETED")
    .reduce((sum, p) => sum.plus(money(p.amount)), money(0));

  const availableRaw = netEarned.minus(reserved).minus(paidOut);
  const available = availableRaw.gt(0) ? round2(availableRaw) : money(0);

  return {
    grossRevenue: round2(grossRevenue),
    commission,
    netEarned,
    reserved: round2(reserved),
    paidOut: round2(paidOut),
    available,
  };
}

export type RefundBreakdown = {
  gross: Money; // total returned to the customer for the item
  commission: Money; // platform commission reversed
  net: Money; // vendor net revenue reversed (gross − commission)
};

/**
 * Split a refund into the vendor's net reversal and the platform's commission
 * reversal, and enforce that the refund cannot exceed what was captured for the
 * item. Pure/Decimal so it is unit-tested independently of the server action.
 *
 * @throws InvalidAmountError if the refund exceeds the captured item value or is non-positive.
 */
export function computeRefundBreakdown(
  grossRefund: Prisma.Decimal.Value,
  capturedItemValue: Prisma.Decimal.Value,
  commissionRate: Prisma.Decimal.Value,
): RefundBreakdown {
  const gross = money(grossRefund);
  const captured = money(capturedItemValue);
  if (gross.lte(0)) throw new InvalidAmountError(`Refund must be positive: ${gross.toString()}`);
  if (gross.gt(captured)) {
    throw new InvalidAmountError(
      `Refund ${gross.toString()} exceeds captured item value ${captured.toString()}`,
    );
  }
  const commission = round2(gross.mul(money(commissionRate)));
  const net = round2(gross).minus(commission);
  return { gross: round2(gross), commission, net };
}

export type CreatePayoutResult =
  | { ok: true; payoutId: string; amount: Money }
  | { ok: false; reason: "NO_BALANCE" };

/**
 * Race-safe payout creation. Takes a `FOR UPDATE` lock on the vendor row so
 * concurrent calls serialize: the second sees the first's PENDING payout in
 * `reserved` and computes 0 available — so a balance can never be paid out
 * twice. Creates exactly one PENDING payout for the full available balance.
 *
 * The money-out ledger entry is posted when the payout COMPLETES, not here.
 */
export async function createVendorPayout(
  vendorId: string,
  ibanNumber: string,
): Promise<CreatePayoutResult> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Vendor" WHERE id = ${vendorId} FOR UPDATE`;
    const balance = await computeVendorBalance(vendorId, tx);
    if (balance.available.lte(0)) return { ok: false, reason: "NO_BALANCE" };

    const payout = await tx.payout.create({
      data: {
        vendorId,
        amount: balance.available,
        currency: "AED",
        ibanNumber,
        status: "PENDING",
      },
    });
    return { ok: true, payoutId: payout.id, amount: balance.available };
  });
}
