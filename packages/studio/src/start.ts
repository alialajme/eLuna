import { prisma, appendOutboxEvent, reserveCredit } from "@ayvana/db";
import { logger } from "@ayvana/observability";
import {
  OUTBOX_GENERATION_ENQUEUED,
  type StartGenerationInput,
  type StartGenerationResult,
} from "./types";

const log = logger.child({ module: "studio.start" });

/** Thrown inside the start transaction to roll back when the wallet is empty. */
class InsufficientCreditsError extends Error {
  constructor() {
    super("INSUFFICIENT_CREDITS");
    this.name = "InsufficientCreditsError";
  }
}

/**
 * Start an AI Shoot: create a GenerationSession + a QUEUED ANALYZE GenerationJob
 * + an outbox event, all in ONE transaction (no "committed but event lost"). The
 * API only enqueues — generation runs in the worker (no long-held HTTP; replaces
 * the Phase 5 fire-and-forget-in-a-server-action anti-pattern).
 *
 * Security: vendorId is resolved server-side by the caller and NEVER trusted
 * from the client. The garment is re-checked to belong to this vendor and the
 * vendor must be ACTIVE. Idempotent: a duplicate idempotencyKey returns the same
 * session/job instead of starting a second shoot (no double-generation).
 *
 * Credits (Phase 4): one AI Shoot is RESERVED from the vendor's wallet INSIDE
 * the same transaction that creates the session/job/outbox event. Because the
 * reserve row-locks the wallet (`SELECT … FOR UPDATE`) and the job's
 * idempotencyKey dedupes replays, (a) two concurrent generations can't spend one
 * remaining shoot twice, and (b) a duplicate request can't double-charge. If the
 * wallet is empty the whole transaction is rolled back — no session, no job, no
 * reservation — and the caller gets INSUFFICIENT_CREDITS to prompt an upgrade.
 */
export async function startGeneration(input: StartGenerationInput): Promise<StartGenerationResult> {
  const l = log.child({ correlationId: input.correlationId, vendorId: input.vendorId });

  // Idempotency: if a job with this key exists (and belongs to this vendor), return it.
  const existing = await prisma.generationJob
    .findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      select: { id: true, sessionId: true, session: { select: { vendorId: true } } },
    })
    .catch(() => null);
  if (existing) {
    if (existing.session.vendorId !== input.vendorId) {
      return { ok: false, reason: "NOT_OWNED" };
    }
    l.info("startGeneration deduped", { jobId: existing.id, sessionId: existing.sessionId });
    return { ok: true, sessionId: existing.sessionId, jobId: existing.id, deduped: true };
  }

  // Ownership + ACTIVE gate (server-authoritative).
  const garment = await prisma.garmentAsset
    .findUnique({
      where: { id: input.garmentId },
      select: { id: true, vendorId: true, vendor: { select: { status: true } } },
    })
    .catch(() => null);
  if (!garment) return { ok: false, reason: "GARMENT_NOT_FOUND" };
  if (garment.vendorId !== input.vendorId) return { ok: false, reason: "NOT_OWNED" };
  if (garment.vendor.status !== "ACTIVE") return { ok: false, reason: "VENDOR_INACTIVE" };

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      const session = await tx.generationSession.create({
        data: {
          vendorId: input.vendorId,
          garmentId: input.garmentId,
          modelProfileId: input.modelProfileId ?? null,
          productId: input.productId ?? null,
          backgroundId: input.backgroundId ?? null,
          resolution: input.resolution ?? null,
          seed: input.seed != null ? BigInt(input.seed) : null,
          status: "RUNNING",
          correlationId: input.correlationId,
        },
        select: { id: true },
      });

      const job = await tx.generationJob.create({
        data: {
          sessionId: session.id,
          kind: "ANALYZE", // the pipeline entry point; the worker advances kinds
          state: "QUEUED",
          idempotencyKey: input.idempotencyKey,
          correlationId: input.correlationId,
        },
        select: { id: true },
      });

      // Reserve 1 AI Shoot atomically (row-locked wallet). Keyed to this session
      // so the pipeline can CONSUME on success / RELEASE on platform failure.
      // An empty wallet rolls back the whole transaction (no orphan session/job).
      const reserve = await reserveCredit(
        {
          vendorId: input.vendorId,
          shoots: 1,
          idempotencyKey: `reserve:${session.id}`,
          sessionId: session.id,
          jobId: job.id,
          reason: "AI shoot started",
        },
        tx,
      );
      if (!reserve.ok) {
        // Throw to roll back the session + job; caught below as INSUFFICIENT_CREDITS.
        throw new InsufficientCreditsError();
      }

      await appendOutboxEvent(tx, {
        type: OUTBOX_GENERATION_ENQUEUED,
        payload: { jobId: job.id, sessionId: session.id, correlationId: input.correlationId },
      });

      return { sessionId: session.id, jobId: job.id };
    });

    l.info("startGeneration enqueued", { sessionId: outcome.sessionId, jobId: outcome.jobId });
    return { ok: true, sessionId: outcome.sessionId, jobId: outcome.jobId, deduped: false };
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      l.info("startGeneration blocked — no shoots");
      return { ok: false, reason: "INSUFFICIENT_CREDITS" };
    }
    const message = err instanceof Error ? err.message : "unknown";
    l.error("startGeneration failed", { error: message });
    return { ok: false, reason: "ERROR", message };
  }
}
