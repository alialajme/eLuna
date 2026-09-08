import type { Prisma } from "@prisma/client";
import { prisma } from "./client";

type Tx = Prisma.TransactionClient;
type Client = Tx | typeof prisma;

export type OutboxEventInput = {
  type: string;
  payload?: Prisma.InputJsonValue;
};

/**
 * Append a domain event to the outbox. MUST be called inside the same
 * `$transaction` as the state change it records — that atomicity is the whole
 * point (no lost events, no phantom events).
 */
export async function appendOutboxEvent(client: Client, event: OutboxEventInput) {
  return client.outboxEvent.create({
    data: { type: event.type, payload: event.payload ?? {} },
  });
}

export type OutboxRecord = {
  id: string;
  type: string;
  payload: unknown;
  attempts: number;
};

export type ProcessOutboxOptions = {
  batchSize?: number;
  maxAttempts?: number;
  /** base backoff between retries, doubled per attempt */
  retryBackoffMs?: number;
  /** how long a claimed (PROCESSING) event is invisible before it can be re-claimed */
  visibilityTimeoutMs?: number;
  now?: () => Date;
};

export type ProcessOutboxResult = { processed: number; failed: number; claimed: number };

type ClaimedRow = { id: string; type: string; payload: unknown; attempts: number };

/**
 * Claim a batch of due events and run `handler` for each.
 *
 * Claiming is a single atomic `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP
 * LOCKED) RETURNING …` that flips rows to PROCESSING with a visibility deadline.
 * Because the claim commits the PROCESSING flag, concurrent workers select
 * disjoint sets and never double-process. A crashed worker's PROCESSING rows
 * become claimable again after `visibilityTimeoutMs` (at-least-once — the
 * handler must be idempotent). A handler throw reschedules the event with
 * backoff until `maxAttempts`, after which it stays FAILED.
 */
export async function processOutbox(
  handler: (event: OutboxRecord) => Promise<void>,
  opts: ProcessOutboxOptions = {},
): Promise<ProcessOutboxResult> {
  const batchSize = opts.batchSize ?? 20;
  const maxAttempts = opts.maxAttempts ?? 5;
  const backoff = opts.retryBackoffMs ?? 1000;
  const visibility = opts.visibilityTimeoutMs ?? 30_000;
  const now = opts.now ?? (() => new Date());

  const result: ProcessOutboxResult = { processed: 0, failed: 0, claimed: 0 };

  const t = now();
  const deadline = new Date(t.getTime() + visibility);

  // Atomically claim due PENDING (or stale PROCESSING) rows. SKIP LOCKED lets
  // parallel workers take disjoint sets; flipping to PROCESSING inside the same
  // statement means the claim is durable, not just lock-held.
  const claimed = await prisma.$queryRaw<ClaimedRow[]>`
    UPDATE "OutboxEvent"
    SET status = 'PROCESSING', "availableAt" = ${deadline}
    WHERE id IN (
      SELECT id FROM "OutboxEvent"
      WHERE (status = 'PENDING' OR status = 'PROCESSING') AND "availableAt" <= ${t}
      ORDER BY "createdAt" ASC
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, type, payload, attempts
  `;

  result.claimed = claimed.length;

  for (const event of claimed) {
    try {
      await handler({ id: event.id, type: event.type, payload: event.payload, attempts: event.attempts });
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: { status: "PROCESSED", processedAt: now(), error: null },
      });
      result.processed++;
    } catch (err) {
      const attempts = event.attempts + 1;
      const giveUp = attempts >= maxAttempts;
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          attempts,
          error: err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500),
          status: giveUp ? "FAILED" : "PENDING",
          availableAt: giveUp ? now() : new Date(now().getTime() + backoff * 2 ** event.attempts),
        },
      });
      result.failed++;
    }
  }

  return result;
}
