import type { Prisma, CreditTxnType } from "@prisma/client";
import { prisma } from "./client";
import { money, round2, type Money } from "./money";

type Tx = Prisma.TransactionClient;
type Client = Tx | typeof prisma;

// ─────────────────────────────────────────────
// AI Fashion Studio — credit wallet + append-only ledger
//
// The billing unit is the "AI Shoot". A vendor's wallet holds `available`
// shoots; a generation RESERVEs 1 at start, CONSUMEs it on delivery/approval,
// and RELEASEs it if the platform/provider fails (never charge for infra
// failures — ADR R1). Modeled on `supplier-payouts.ts` (SELECT … FOR UPDATE +
// Decimal) + `ledger.ts` (append-only, ADR-0003). Every mutation is:
//   • row-locked (SELECT … FOR UPDATE on the wallet) → concurrency-safe,
//   • Decimal-only (never float),
//   • idempotent (a unique idempotencyKey makes re-delivery a no-op) → a
//     duplicate webhook/request can never double-credit or double-charge.
// ─────────────────────────────────────────────

export type WalletView = {
  vendorId: string;
  available: Money;
  reserved: Money;
  lifetimeConsumed: Money;
};

/** Read a vendor's wallet (creating a zeroed one on first read). */
export async function ensureWallet(vendorId: string, client: Client = prisma): Promise<WalletView> {
  const wallet = await client.creditWallet.upsert({
    where: { vendorId },
    create: { vendorId },
    update: {},
    select: { vendorId: true, available: true, reserved: true, lifetimeConsumed: true },
  });
  return {
    vendorId: wallet.vendorId,
    available: money(wallet.available),
    reserved: money(wallet.reserved),
    lifetimeConsumed: money(wallet.lifetimeConsumed),
  };
}

export type ReserveResult =
  | { ok: true; creditTxnId: string; availableAfter: Money; deduped: boolean }
  | { ok: false; reason: "INSUFFICIENT_CREDITS" };

/**
 * Atomically reserve `shoots` from a vendor's wallet (available → reserved).
 * Row-locks the wallet so two concurrent generations serialize: the second sees
 * the first's decremented `available` and is rejected if nothing is left — one
 * remaining shoot can never be spent twice. Idempotent on `idempotencyKey`: a
 * replay returns the original reservation instead of reserving again.
 *
 * Pass `tx` to reserve inside the SAME transaction that creates the
 * session/job/outbox (so there's no "reserved but job lost" window).
 */
export async function reserveCredit(
  params: {
    vendorId: string;
    shoots?: number;
    idempotencyKey: string;
    sessionId?: string;
    jobId?: string;
    reason?: string;
  },
  tx: Tx,
): Promise<ReserveResult> {
  const shoots = params.shoots ?? 1;

  // Idempotency: a replay of the same reservation returns the original.
  const prior = await tx.creditTransaction.findUnique({
    where: { idempotencyKey: params.idempotencyKey },
    select: { id: true, balanceAfter: true },
  });
  if (prior) return { ok: true, creditTxnId: prior.id, availableAfter: money(prior.balanceAfter), deduped: true };

  // Row lock the wallet (create if missing, then lock).
  await tx.creditWallet.upsert({ where: { vendorId: params.vendorId }, create: { vendorId: params.vendorId }, update: {} });
  await tx.$queryRaw`SELECT id FROM "CreditWallet" WHERE "vendorId" = ${params.vendorId} FOR UPDATE`;

  const wallet = await tx.creditWallet.findUniqueOrThrow({
    where: { vendorId: params.vendorId },
    select: { id: true, available: true, reserved: true },
  });
  const available = money(wallet.available);
  if (available.lt(shoots)) return { ok: false, reason: "INSUFFICIENT_CREDITS" };

  const newAvailable = round2(available.minus(shoots));
  const newReserved = round2(money(wallet.reserved).plus(shoots));
  await tx.creditWallet.update({
    where: { vendorId: params.vendorId },
    data: { available: newAvailable, reserved: newReserved },
  });

  const txn = await tx.creditTransaction.create({
    data: {
      walletId: wallet.id,
      vendorId: params.vendorId,
      type: "RESERVE",
      amount: round2(money(-shoots)),
      balanceAfter: newAvailable,
      sessionId: params.sessionId ?? null,
      jobId: params.jobId ?? null,
      idempotencyKey: params.idempotencyKey,
      reason: params.reason ?? "shoot reserved",
      actor: "system",
    },
    select: { id: true },
  });
  return { ok: true, creditTxnId: txn.id, availableAfter: newAvailable, deduped: false };
}

/**
 * Consume a reservation on a successful, delivered/approved shoot
 * (reserved → lifetimeConsumed). Idempotent on `consume:${sessionId}` so a
 * re-run of the pipeline/approve never double-consumes. No-op if the session
 * was never reserved (e.g. Simulated dev flow with an empty wallet).
 */
export async function consumeCredit(params: {
  vendorId: string;
  sessionId: string;
  shoots?: number;
  reason?: string;
}): Promise<{ ok: true; deduped: boolean }> {
  const shoots = params.shoots ?? 1;
  const idempotencyKey = `consume:${params.sessionId}`;
  return prisma.$transaction(async (tx) => {
    const prior = await tx.creditTransaction.findUnique({ where: { idempotencyKey }, select: { id: true } });
    if (prior) return { ok: true, deduped: true };

    // Only consume against an actual RESERVE for this session (never invent a charge).
    const reserved = await tx.creditTransaction.findFirst({
      where: { sessionId: params.sessionId, type: "RESERVE" },
      select: { id: true },
    });
    if (!reserved) return { ok: true, deduped: true };

    await tx.$queryRaw`SELECT id FROM "CreditWallet" WHERE "vendorId" = ${params.vendorId} FOR UPDATE`;
    const wallet = await tx.creditWallet.findUnique({
      where: { vendorId: params.vendorId },
      select: { id: true, reserved: true, lifetimeConsumed: true, available: true },
    });
    if (!wallet) return { ok: true, deduped: true };

    const newReserved = round2(maxZero(money(wallet.reserved).minus(shoots)));
    const newConsumed = round2(money(wallet.lifetimeConsumed).plus(shoots));
    await tx.creditWallet.update({
      where: { vendorId: params.vendorId },
      data: { reserved: newReserved, lifetimeConsumed: newConsumed },
    });
    await tx.creditTransaction.create({
      data: {
        walletId: wallet.id,
        vendorId: params.vendorId,
        type: "CONSUME",
        amount: round2(money(-shoots)),
        balanceAfter: round2(money(wallet.available)),
        sessionId: params.sessionId,
        idempotencyKey,
        reason: params.reason ?? "shoot delivered",
        actor: "system",
      },
    });
    return { ok: true, deduped: false };
  });
}

/**
 * Release a reservation back to available on a platform/provider failure or
 * cancellation (reserved → available). NEVER charge for infra failures (ADR R1).
 * Idempotent on `release:${sessionId}`; no-op if nothing was reserved.
 */
export async function releaseCredit(params: {
  vendorId: string;
  sessionId: string;
  shoots?: number;
  reason?: string;
}): Promise<{ ok: true; deduped: boolean }> {
  const shoots = params.shoots ?? 1;
  const idempotencyKey = `release:${params.sessionId}`;
  return prisma.$transaction(async (tx) => {
    const prior = await tx.creditTransaction.findUnique({ where: { idempotencyKey }, select: { id: true } });
    if (prior) return { ok: true, deduped: true };

    // Only release against an actual RESERVE, and never after a CONSUME.
    const [reserved, consumed] = await Promise.all([
      tx.creditTransaction.findFirst({ where: { sessionId: params.sessionId, type: "RESERVE" }, select: { id: true } }),
      tx.creditTransaction.findFirst({ where: { sessionId: params.sessionId, type: "CONSUME" }, select: { id: true } }),
    ]);
    if (!reserved || consumed) return { ok: true, deduped: true };

    await tx.$queryRaw`SELECT id FROM "CreditWallet" WHERE "vendorId" = ${params.vendorId} FOR UPDATE`;
    const wallet = await tx.creditWallet.findUnique({
      where: { vendorId: params.vendorId },
      select: { id: true, reserved: true, available: true },
    });
    if (!wallet) return { ok: true, deduped: true };

    const newReserved = round2(maxZero(money(wallet.reserved).minus(shoots)));
    const newAvailable = round2(money(wallet.available).plus(shoots));
    await tx.creditWallet.update({
      where: { vendorId: params.vendorId },
      data: { reserved: newReserved, available: newAvailable },
    });
    await tx.creditTransaction.create({
      data: {
        walletId: wallet.id,
        vendorId: params.vendorId,
        type: "RELEASE",
        amount: round2(money(shoots)),
        balanceAfter: newAvailable,
        sessionId: params.sessionId,
        idempotencyKey,
        reason: params.reason ?? "released (platform failure)",
        actor: "system",
      },
    });
    return { ok: true, deduped: false };
  });
}

/**
 * Grant shoots to a wallet (subscription GRANT or pack PURCHASE). Idempotent on
 * `idempotencyKey` — a duplicate payment webhook can never double-credit.
 * Row-locked so a grant racing a reserve stays consistent.
 */
export async function grantCredit(params: {
  vendorId: string;
  shoots: number;
  type: Extract<CreditTxnType, "GRANT" | "PURCHASE" | "ROLLOVER" | "ADJUST" | "EXPIRE">;
  idempotencyKey: string;
  paymentId?: string;
  reason?: string;
  actor?: string;
}): Promise<{ ok: true; availableAfter: Money; deduped: boolean }> {
  return prisma.$transaction(async (tx) => {
    const prior = await tx.creditTransaction.findUnique({
      where: { idempotencyKey: params.idempotencyKey },
      select: { id: true, balanceAfter: true },
    });
    if (prior) return { ok: true, availableAfter: money(prior.balanceAfter), deduped: true };

    await tx.creditWallet.upsert({ where: { vendorId: params.vendorId }, create: { vendorId: params.vendorId }, update: {} });
    await tx.$queryRaw`SELECT id FROM "CreditWallet" WHERE "vendorId" = ${params.vendorId} FOR UPDATE`;
    const wallet = await tx.creditWallet.findUniqueOrThrow({
      where: { vendorId: params.vendorId },
      select: { id: true, available: true },
    });

    // EXPIRE is a debit; everything else a credit.
    const signed = params.type === "EXPIRE" ? -Math.abs(params.shoots) : Math.abs(params.shoots);
    const newAvailable = round2(maxZero(money(wallet.available).plus(signed)));
    await tx.creditWallet.update({ where: { vendorId: params.vendorId }, data: { available: newAvailable } });
    await tx.creditTransaction.create({
      data: {
        walletId: wallet.id,
        vendorId: params.vendorId,
        type: params.type,
        amount: round2(money(signed)),
        balanceAfter: newAvailable,
        paymentId: params.paymentId ?? null,
        idempotencyKey: params.idempotencyKey,
        reason: params.reason ?? null,
        actor: params.actor ?? "system",
      },
    });
    return { ok: true, availableAfter: newAvailable, deduped: false };
  });
}

/** Recent ledger entries for a vendor (newest first). */
export async function listCreditTransactions(vendorId: string, limit = 50) {
  return prisma.creditTransaction
    .findMany({
      where: { vendorId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        type: true,
        amount: true,
        balanceAfter: true,
        reason: true,
        sessionId: true,
        paymentId: true,
        createdAt: true,
      },
    })
    .catch(() => []);
}

function maxZero(v: Money): Money {
  return v.gt(0) ? v : money(0);
}
