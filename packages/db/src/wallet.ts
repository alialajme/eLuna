import type { Prisma, WalletTxnType } from "@prisma/client";
import { prisma } from "./client";
import { InsufficientFundsError, InvalidAmountError } from "./errors";
import { money, round2, type MoneyInput, type Money } from "./money";

type Tx = Prisma.TransactionClient;
type Client = Tx | typeof prisma;

export type WalletDebitParams = {
  customerProfileId: string;
  amount: MoneyInput;
  orderId?: string;
  reference?: string;
  note?: string;
};

export type WalletCreditParams = WalletDebitParams & {
  type?: Extract<WalletTxnType, "CREDIT" | "REFUND" | "REVERSAL" | "ADJUSTMENT">;
};

export type WalletMovement = { balanceAfter: Money };

/**
 * Atomically debit the wallet and append an immutable ledger row. MUST run inside
 * a `prisma.$transaction`.
 *
 * Double-spend safety: the conditional `updateMany({ where: { walletBalance:
 * { gte: amount } } })` is a single atomic UPDATE that Postgres row-locks. Two
 * concurrent AED 80 debits against an AED 100 balance cannot both succeed — the
 * second sees the committed balance and its predicate fails (count 0 -> throw).
 */
export async function debitWalletTx(tx: Tx, params: WalletDebitParams): Promise<WalletMovement> {
  const amount = money(params.amount);
  if (amount.lte(0)) throw new InvalidAmountError(`Wallet debit must be positive: ${amount.toString()}`);

  const res = await tx.customerProfile.updateMany({
    where: { id: params.customerProfileId, walletBalance: { gte: amount } },
    data: { walletBalance: { decrement: amount } },
  });
  if (res.count !== 1) {
    const p = await tx.customerProfile.findUnique({
      where: { id: params.customerProfileId },
      select: { walletBalance: true },
    });
    throw new InsufficientFundsError(
      params.customerProfileId,
      amount.toString(),
      (p?.walletBalance ?? money(0)).toString(),
    );
  }

  const profile = await tx.customerProfile.findUniqueOrThrow({
    where: { id: params.customerProfileId },
    select: { walletBalance: true },
  });

  await tx.walletTransaction.create({
    data: {
      customerProfileId: params.customerProfileId,
      type: "DEBIT",
      amount,
      balanceAfter: profile.walletBalance,
      orderId: params.orderId ?? null,
      reference: params.reference ?? null,
      note: params.note ?? null,
    },
  });

  return { balanceAfter: profile.walletBalance };
}

export type WalletReconciliation = {
  customerProfileId: string;
  cachedBalance: Money; // the denormalized CustomerProfile.walletBalance
  ledgerBalance: Money; // Σ credits − Σ debits from the append-only WalletTransaction log
  drift: Money; // cachedBalance − ledgerBalance (exactly 0 when consistent)
  reconciled: boolean; // drift is zero
};

/**
 * Recompute a customer's wallet balance from the immutable WalletTransaction
 * ledger and compare it to the denormalized `CustomerProfile.walletBalance`
 * cache. `amount` is always positive and `type` carries the sign: DEBIT spends
 * (−); every other type (CREDIT/REFUND/REVERSAL/ADJUSTMENT) adds (+).
 *
 * A non-zero `drift` is a data-integrity alarm: the cache and the ledger
 * disagree, which means a balance mutation skipped the ledger (or an opening
 * balance was seeded without a row). This is a READ-ONLY audit — it never
 * mutates — and uses Decimal throughout (never float). The invariant it checks:
 * a correctly-ledgered wallet opens at 0 and every movement appends a row, so
 * the ledger sum must equal the cached balance. Pass a transaction client to
 * read it consistently alongside other work.
 */
export async function reconcileWallet(
  customerProfileId: string,
  client: Client = prisma,
): Promise<WalletReconciliation> {
  const [rows, profile] = await Promise.all([
    client.walletTransaction.findMany({
      where: { customerProfileId },
      select: { type: true, amount: true },
    }),
    client.customerProfile.findUniqueOrThrow({
      where: { id: customerProfileId },
      select: { walletBalance: true },
    }),
  ]);

  const ledgerBalance = rows.reduce(
    (sum, r) => (r.type === "DEBIT" ? sum.minus(money(r.amount)) : sum.plus(money(r.amount))),
    money(0),
  );
  const cachedBalance = money(profile.walletBalance);
  const drift = round2(cachedBalance.minus(ledgerBalance));

  return {
    customerProfileId,
    cachedBalance: round2(cachedBalance),
    ledgerBalance: round2(ledgerBalance),
    drift,
    reconciled: drift.isZero(),
  };
}

/**
 * Reconcile every customer wallet in a single pass — an ops/audit sweep, not a
 * hot path. Returns ONLY the wallets whose cache disagrees with the ledger, so
 * an empty result means the whole system is consistent. One `groupBy` folds the
 * per-(customer, type) sums into a signed ledger balance per customer, then each
 * is compared to its cached `walletBalance`. Read-only; Decimal throughout.
 */
export async function reconcileAllWallets(client: Client = prisma): Promise<WalletReconciliation[]> {
  const [profiles, grouped] = await Promise.all([
    client.customerProfile.findMany({ select: { id: true, walletBalance: true } }),
    client.walletTransaction.groupBy({
      by: ["customerProfileId", "type"],
      _sum: { amount: true },
    }),
  ]);

  const ledgerByCustomer = new Map<string, Money>();
  for (const g of grouped) {
    const amt = money(g._sum.amount ?? 0);
    const prev = ledgerByCustomer.get(g.customerProfileId) ?? money(0);
    ledgerByCustomer.set(g.customerProfileId, g.type === "DEBIT" ? prev.minus(amt) : prev.plus(amt));
  }

  const drifted: WalletReconciliation[] = [];
  for (const p of profiles) {
    const ledgerBalance = ledgerByCustomer.get(p.id) ?? money(0);
    const cachedBalance = money(p.walletBalance);
    const drift = round2(cachedBalance.minus(ledgerBalance));
    if (!drift.isZero()) {
      drifted.push({
        customerProfileId: p.id,
        cachedBalance: round2(cachedBalance),
        ledgerBalance: round2(ledgerBalance),
        drift,
        reconciled: false,
      });
    }
  }
  return drifted;
}

/**
 * Atomically credit the wallet (top-up, cashback, refund, reversal) and append an
 * immutable ledger row. MUST run inside a `prisma.$transaction`.
 */
export async function creditWalletTx(tx: Tx, params: WalletCreditParams): Promise<WalletMovement> {
  const amount = money(params.amount);
  if (amount.lte(0)) throw new InvalidAmountError(`Wallet credit must be positive: ${amount.toString()}`);

  const profile = await tx.customerProfile.update({
    where: { id: params.customerProfileId },
    data: { walletBalance: { increment: amount } },
    select: { walletBalance: true },
  });

  await tx.walletTransaction.create({
    data: {
      customerProfileId: params.customerProfileId,
      type: params.type ?? "CREDIT",
      amount,
      balanceAfter: profile.walletBalance,
      orderId: params.orderId ?? null,
      reference: params.reference ?? null,
      note: params.note ?? null,
    },
  });

  return { balanceAfter: profile.walletBalance };
}
