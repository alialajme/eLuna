import { Prisma, type ReservationStatus } from "@prisma/client";
import { prisma } from "./client";
import { InsufficientInventoryError, InvalidAmountError } from "./errors";

type Tx = Prisma.TransactionClient;
type Client = Tx | typeof prisma;

export type ReservationLine = { variantId: string; quantity: number };

/** Default hold TTL before the sweeper reclaims an abandoned ACTIVE reservation. */
export const DEFAULT_RESERVATION_TTL_MS = 30 * 60 * 1000; // 30 minutes

export type ReserveParams = {
  /** One reservation per checkout attempt — a retry with the same key never double-decrements. */
  idempotencyKey: string;
  lines: ReservationLine[];
  orderId?: string;
  ttlMs?: number;
};

function assertLines(lines: ReservationLine[]): void {
  if (lines.length === 0) throw new InvalidAmountError("A reservation needs at least one line");
  for (const l of lines) {
    if (!Number.isInteger(l.quantity) || l.quantity <= 0) {
      throw new InvalidAmountError(`Invalid quantity for ${l.variantId}: ${l.quantity}`);
    }
  }
}

function linesOf(raw: Prisma.JsonValue): ReservationLine[] {
  return (raw ?? []) as unknown as ReservationLine[];
}

/**
 * Persistently reserve stock for an in-flight order. MUST run inside a
 * `prisma.$transaction`. Idempotent by `idempotencyKey`:
 *
 * - If a reservation already exists for the key, it is returned as-is — stock is
 *   NOT decremented again (handles checkout retries).
 * - Otherwise each line's stock is decremented with the same oversell-safe
 *   conditional `updateMany` as `reserveStockTx`, then an ACTIVE reservation row
 *   is written. The `@unique(idempotencyKey)` is the concurrency backstop: if two
 *   txs race the same key, one row insert wins and the loser's whole tx (incl. its
 *   decrement) rolls back — so stock is decremented exactly once.
 */
export async function reserveInventory(tx: Tx, params: ReserveParams) {
  assertLines(params.lines);

  const existing = await tx.inventoryReservation.findUnique({
    where: { idempotencyKey: params.idempotencyKey },
  });
  if (existing) return existing;

  for (const line of params.lines) {
    const res = await tx.productVariant.updateMany({
      where: { id: line.variantId, stock: { gte: line.quantity } },
      data: { stock: { decrement: line.quantity } },
    });
    if (res.count !== 1) {
      const current = await tx.productVariant.findUnique({
        where: { id: line.variantId },
        select: { stock: true },
      });
      throw new InsufficientInventoryError(line.variantId, line.quantity, current?.stock ?? 0);
    }
  }

  return tx.inventoryReservation.create({
    data: {
      idempotencyKey: params.idempotencyKey,
      orderId: params.orderId ?? null,
      status: "ACTIVE",
      expiresAt: new Date(Date.now() + (params.ttlMs ?? DEFAULT_RESERVATION_TTL_MS)),
      lines: params.lines as unknown as Prisma.InputJsonValue,
    },
  });
}

/**
 * Mark an ACTIVE hold as COMMITTED — the order is paid/confirmed, so the already-
 * decremented stock is now permanently sold. Idempotent: returns true only on the
 * ACTIVE→COMMITTED transition; a second call (or a non-ACTIVE row) returns false
 * and changes nothing. Optionally stamps the orderId. MUST run inside a tx.
 */
export async function commitReservation(
  tx: Tx,
  idempotencyKey: string,
  orderId?: string,
): Promise<boolean> {
  const res = await tx.inventoryReservation.updateMany({
    where: { idempotencyKey, status: "ACTIVE" },
    data: { status: "COMMITTED", ...(orderId ? { orderId } : {}) },
  });
  return res.count === 1;
}

/**
 * Atomically move a reservation `from`→`to` and return its stock — exactly once.
 * The guarded `updateMany(where status=from)` is the concurrency + idempotency
 * backstop: only the transition that flips the row returns stock, so two racing
 * releases/sweeps never double-increment. A line whose variant was since deleted
 * is a safe no-op (`updateMany` matches 0 rows).
 */
async function transitionAndReturnStock(
  tx: Tx,
  idempotencyKey: string,
  from: ReservationStatus,
  to: ReservationStatus,
): Promise<boolean> {
  const res = await tx.inventoryReservation.updateMany({
    where: { idempotencyKey, status: from },
    data: { status: to },
  });
  if (res.count !== 1) return false;

  const reservation = await tx.inventoryReservation.findUniqueOrThrow({
    where: { idempotencyKey },
    select: { lines: true },
  });
  for (const line of linesOf(reservation.lines)) {
    if (line.quantity > 0) {
      await tx.productVariant.updateMany({
        where: { id: line.variantId },
        data: { stock: { increment: line.quantity } },
      });
    }
  }
  return true;
}

/**
 * Release an ACTIVE hold (payment failed / order cancelled) and return its stock.
 * Idempotent: returns true only on the ACTIVE→RELEASED transition; a committed,
 * expired, or already-released hold returns false and returns no stock. MUST run
 * inside a tx.
 */
export async function releaseReservation(tx: Tx, idempotencyKey: string): Promise<boolean> {
  return transitionAndReturnStock(tx, idempotencyKey, "ACTIVE", "RELEASED");
}

export type SweepResult = { scanned: number; expired: number };

/**
 * Reclaim abandoned holds: find ACTIVE reservations past `expiresAt` and expire
 * each in its own transaction, returning stock via the same guarded transition.
 * The per-row ACTIVE→EXPIRED guard makes it safe to run concurrently (a second
 * sweeper's update matches 0 rows) and idempotent (a committed/released hold is
 * never touched). Intended for a periodic worker/cron; `batchSize` bounds a pass.
 * Read-safe to call opportunistically. Pass `now` in tests.
 */
export async function expireStaleReservations(
  client: typeof prisma = prisma,
  opts: { now?: Date; batchSize?: number } = {},
): Promise<SweepResult> {
  const now = opts.now ?? new Date();
  const batchSize = opts.batchSize ?? 100;

  const stale = await client.inventoryReservation.findMany({
    where: { status: "ACTIVE", expiresAt: { lt: now } },
    select: { idempotencyKey: true },
    take: batchSize,
    orderBy: { expiresAt: "asc" },
  });

  let expired = 0;
  for (const s of stale) {
    const didExpire = await client.$transaction((tx) =>
      transitionAndReturnStock(tx, s.idempotencyKey, "ACTIVE", "EXPIRED"),
    );
    if (didExpire) expired++;
  }
  return { scanned: stale.length, expired };
}
