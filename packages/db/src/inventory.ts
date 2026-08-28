import type { Prisma } from "@prisma/client";
import { InsufficientInventoryError, InvalidAmountError } from "./errors";

type Tx = Prisma.TransactionClient;

export type StockLine = { variantId: string; quantity: number };

/**
 * Atomically reserve (decrement) stock for each line. MUST run inside a
 * `prisma.$transaction` so a failure on any line rolls back the whole order.
 *
 * Oversell safety: the conditional `updateMany({ where: { stock: { gte: qty } } })`
 * is a single atomic UPDATE. Under concurrency Postgres row-locks the variant;
 * a racing transaction re-evaluates the `stock >= qty` predicate against the
 * committed value, so exactly one of two racers can take the last unit. This is
 * the invariant proven by the concurrency tests: stock=3 + 100 buyers -> 3 sold.
 */
export async function reserveStockTx(tx: Tx, lines: StockLine[]): Promise<void> {
  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      throw new InvalidAmountError(`Invalid quantity for ${line.variantId}: ${line.quantity}`);
    }
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
}

/**
 * Release (increment) previously reserved stock — used when a payment fails or an
 * order is cancelled. Idempotency is the caller's responsibility (only release
 * once per reservation); guard with the order/payment state machine.
 */
export async function releaseStockTx(tx: Tx, lines: StockLine[]): Promise<void> {
  for (const line of lines) {
    if (line.quantity <= 0) continue;
    await tx.productVariant.updateMany({
      where: { id: line.variantId },
      data: { stock: { increment: line.quantity } },
    });
  }
}
