import { describe, it, expect } from "vitest";
import { prisma } from "../src/client";
import { debitWalletTx, creditWalletTx } from "../src/wallet";
import { InsufficientFundsError, InvalidAmountError } from "../src/errors";
import { makeCustomer, balanceOf } from "./factories";

describe("wallet (integration, real Postgres)", () => {
  it("debits and writes an immutable ledger row with balanceAfter", async () => {
    const { profileId } = await makeCustomer(100);
    const { balanceAfter } = await prisma.$transaction((tx) =>
      debitWalletTx(tx, { customerProfileId: profileId, amount: 30, note: "checkout" }),
    );
    expect(balanceAfter.toString()).toBe("70");
    expect(await balanceOf(profileId)).toBe("70");

    const ledger = await prisma.walletTransaction.findMany({ where: { customerProfileId: profileId } });
    expect(ledger).toHaveLength(1);
    expect(ledger[0].type).toBe("DEBIT");
    expect(ledger[0].amount.toString()).toBe("30");
    expect(ledger[0].balanceAfter.toString()).toBe("70");
  });

  it("rejects a debit exceeding balance and writes no ledger row", async () => {
    const { profileId } = await makeCustomer(50);
    await expect(
      prisma.$transaction((tx) => debitWalletTx(tx, { customerProfileId: profileId, amount: 80 })),
    ).rejects.toBeInstanceOf(InsufficientFundsError);
    expect(await balanceOf(profileId)).toBe("50"); // unchanged
    expect(await prisma.walletTransaction.count({ where: { customerProfileId: profileId } })).toBe(0);
  });

  it("rejects non-positive amounts", async () => {
    const { profileId } = await makeCustomer(50);
    await expect(
      prisma.$transaction((tx) => debitWalletTx(tx, { customerProfileId: profileId, amount: 0 })),
    ).rejects.toBeInstanceOf(InvalidAmountError);
  });

  it("credits (refund) and appends a ledger row", async () => {
    const { profileId } = await makeCustomer(20);
    await prisma.$transaction((tx) =>
      creditWalletTx(tx, { customerProfileId: profileId, amount: 15, type: "REFUND", note: "return" }),
    );
    expect(await balanceOf(profileId)).toBe("35");
    const row = await prisma.walletTransaction.findFirstOrThrow({ where: { customerProfileId: profileId } });
    expect(row.type).toBe("REFUND");
    expect(row.balanceAfter.toString()).toBe("35");
  });

  // The core invariant: AED 100 wallet, ten concurrent AED 80 debits -> exactly one succeeds.
  it("prevents double-spend under concurrency (100 balance, 10x80)", async () => {
    const { profileId } = await makeCustomer(100);

    const attempts = Array.from({ length: 10 }, () =>
      prisma.$transaction((tx) => debitWalletTx(tx, { customerProfileId: profileId, amount: 80 })),
    );
    const results = await Promise.allSettled(attempts);

    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    expect(succeeded).toBe(1);
    expect(await balanceOf(profileId)).toBe("20"); // 100 - 80, never negative
    expect(await prisma.walletTransaction.count({ where: { customerProfileId: profileId, type: "DEBIT" } })).toBe(1);
  });
});
