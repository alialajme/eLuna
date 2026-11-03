import { describe, it, expect } from "vitest";
import { prisma } from "../src/client";
import { debitWalletTx, creditWalletTx, reconcileWallet, reconcileAllWallets } from "../src/wallet";
import { makeCustomer } from "./factories";

describe("wallet reconciliation (integration, real Postgres)", () => {
  it("reconciles a wallet built entirely through the ledger functions (drift 0)", async () => {
    const { profileId } = await makeCustomer(0);
    // Every movement goes through a ledger row: +100 top-up, −30 spend, +15 refund.
    await prisma.$transaction((tx) =>
      creditWalletTx(tx, { customerProfileId: profileId, amount: 100, type: "CREDIT" }),
    );
    await prisma.$transaction((tx) => debitWalletTx(tx, { customerProfileId: profileId, amount: 30 }));
    await prisma.$transaction((tx) =>
      creditWalletTx(tx, { customerProfileId: profileId, amount: 15, type: "REFUND" }),
    );

    const rec = await reconcileWallet(profileId);
    expect(rec.cachedBalance.toString()).toBe("85");
    expect(rec.ledgerBalance.toString()).toBe("85");
    expect(rec.drift.toString()).toBe("0");
    expect(rec.reconciled).toBe(true);
  });

  it("reports drift 0 and balances 0 for an untouched wallet", async () => {
    const { profileId } = await makeCustomer(0);
    const rec = await reconcileWallet(profileId);
    expect(rec.ledgerBalance.toString()).toBe("0");
    expect(rec.cachedBalance.toString()).toBe("0");
    expect(rec.reconciled).toBe(true);
  });

  it("flags drift when the cached balance is mutated outside the ledger", async () => {
    const { profileId } = await makeCustomer(0);
    await prisma.$transaction((tx) =>
      creditWalletTx(tx, { customerProfileId: profileId, amount: 50, type: "CREDIT" }),
    );
    // Corrupt the denormalized cache directly — no ledger row written.
    await prisma.customerProfile.update({
      where: { id: profileId },
      data: { walletBalance: { increment: 20 } },
    });

    const rec = await reconcileWallet(profileId);
    expect(rec.cachedBalance.toString()).toBe("70");
    expect(rec.ledgerBalance.toString()).toBe("50");
    expect(rec.drift.toString()).toBe("20"); // cache − ledger
    expect(rec.reconciled).toBe(false);
  });

  it("flags an un-ledgered opening balance as drift", async () => {
    // Seeded with funds but no opening CREDIT row — exactly the integrity hole to catch.
    const { profileId } = await makeCustomer(100);
    const rec = await reconcileWallet(profileId);
    expect(rec.cachedBalance.toString()).toBe("100");
    expect(rec.ledgerBalance.toString()).toBe("0");
    expect(rec.drift.toString()).toBe("100");
    expect(rec.reconciled).toBe(false);
  });

  it("sweep returns only drifted wallets (ignores consistent ones)", async () => {
    // Two consistent wallets (built through the ledger) + one drifted (seeded).
    const consistentA = await makeCustomer(0);
    await prisma.$transaction((tx) =>
      creditWalletTx(tx, { customerProfileId: consistentA.profileId, amount: 40, type: "CREDIT" }),
    );
    const consistentB = await makeCustomer(0); // untouched, 0 == 0
    const drifted = await makeCustomer(75); // opening balance with no ledger row

    const result = await reconcileAllWallets();
    const byId = new Map(result.map((r) => [r.customerProfileId, r]));

    // The shared test DB holds rows from other files, so assert on OUR ids only.
    expect(byId.has(consistentA.profileId)).toBe(false);
    expect(byId.has(consistentB.profileId)).toBe(false);

    const d = byId.get(drifted.profileId);
    expect(d).toBeDefined();
    expect(d!.cachedBalance.toString()).toBe("75");
    expect(d!.ledgerBalance.toString()).toBe("0");
    expect(d!.drift.toString()).toBe("75");
    expect(d!.reconciled).toBe(false);
  });
});
