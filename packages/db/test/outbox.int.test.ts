import { describe, it, expect } from "vitest";
import { prisma } from "../src/client";
import { appendOutboxEvent, processOutbox } from "../src/outbox";

const uniqueType = (p: string) => `${p}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;

describe("transactional outbox (integration)", () => {
  it("appends an event atomically with its transaction (rolls back on failure)", async () => {
    const type = uniqueType("test.atomic");
    await expect(
      prisma.$transaction(async (tx) => {
        await appendOutboxEvent(tx, { type, payload: { a: 1 } });
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    expect(await prisma.outboxEvent.count({ where: { type } })).toBe(0);
  });

  it("processes pending events and marks them PROCESSED", async () => {
    const type = uniqueType("test.process");
    await appendOutboxEvent(prisma, { type, payload: { orderId: "o1" } });

    const seen: unknown[] = [];
    const res = await processOutbox(async (e) => {
      if (e.type === type) seen.push(e.payload);
    });
    expect(res.processed).toBeGreaterThanOrEqual(1);
    expect(seen).toContainEqual({ orderId: "o1" });

    const row = await prisma.outboxEvent.findFirstOrThrow({ where: { type } });
    expect(row.status).toBe("PROCESSED");
    expect(row.processedAt).not.toBeNull();
  });

  it("reschedules a failing event with backoff, then FAILS after maxAttempts", async () => {
    const type = uniqueType("test.fail");
    await appendOutboxEvent(prisma, { type });

    // First failure -> back to PENDING, but scheduled in the future (not due now).
    await processOutbox(async (e) => {
      if (e.type === type) throw new Error("handler boom");
    }, { maxAttempts: 2, retryBackoffMs: 60_000 });
    let row = await prisma.outboxEvent.findFirstOrThrow({ where: { type } });
    expect(row.status).toBe("PENDING");
    expect(row.attempts).toBe(1);
    expect(row.availableAt.getTime()).toBeGreaterThan(Date.now());

    // Force it due and fail again -> reaches maxAttempts -> FAILED.
    await prisma.outboxEvent.update({ where: { id: row.id }, data: { availableAt: new Date(0) } });
    await processOutbox(async (e) => {
      if (e.type === type) throw new Error("handler boom");
    }, { maxAttempts: 2, retryBackoffMs: 60_000 });
    row = await prisma.outboxEvent.findFirstOrThrow({ where: { type } });
    expect(row.status).toBe("FAILED");
    expect(row.attempts).toBe(2);
    expect(row.error).toContain("handler boom");
  });

  it("never double-processes under concurrent workers (SKIP LOCKED claim)", async () => {
    const type = uniqueType("test.concurrent");
    for (let i = 0; i < 30; i++) await appendOutboxEvent(prisma, { type, payload: { i } });

    const handled: string[] = [];
    const worker = () =>
      processOutbox(
        async (e) => {
          if (e.type === type) handled.push(e.id);
        },
        { batchSize: 10 },
      );

    // Run several passes of concurrent workers until all are drained.
    for (let round = 0; round < 6; round++) {
      await Promise.all([worker(), worker(), worker()]);
    }

    const ours = handled.filter((id, i, arr) => arr.indexOf(id) === i);
    // Every event handled exactly once (no duplicates).
    expect(handled.length).toBe(ours.length);
    expect(await prisma.outboxEvent.count({ where: { type, status: "PROCESSED" } })).toBe(30);
    expect(await prisma.outboxEvent.count({ where: { type, status: { not: "PROCESSED" } } })).toBe(0);
  });
});
