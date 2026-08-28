import type { Prisma, WalletTxnType } from "@prisma/client";
import { InsufficientFundsError, InvalidAmountError } from "./errors";
import { money, type MoneyInput, type Money } from "./money";

type Tx = Prisma.TransactionClient;

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
