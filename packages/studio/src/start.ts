import { prisma, appendOutboxEvent, reserveCredit } from "@ayvana/db";
import { logger } from "@ayvana/observability";
import {
  OUTBOX_GENERATION_ENQUEUED,
  type StartGenerationInput,
  type StartGenerationResult,
} from "./types";

const log = logger.child({ module: "studio.start" });

/**
 * Per-vendor ceiling on simultaneously in-flight AI Shoots. This is an abuse /
 * runaway guard (e.g. a bug or 100 browser tabs firing generations in parallel
 * must not drain the platform's GPU/provider budget), NOT a billing limit —
 * plan-based monthly/overage limits (SubscriptionPlan.monthlyLimit) are a
 * separate billing-policy concern. Generous enough never to block legitimate use.
 */
const MAX_CONCURRENT_JOBS_PER_VENDOR = 10;

/** Job states that are actively occupying the pipeline (queued or processing). */
const IN_FLIGHT_JOB_STATES = [
  "QUEUED",
  "VALIDATING",
  "ANALYZING",
  "GENERATING_IMAGES",
  "VALIDATING_IMAGES",
  "GENERATING_VIDEO",
  "VALIDATING_VIDEO",
] as const;

/** Thrown inside the start transaction to roll back when the wallet is empty. */
class InsufficientCreditsError extends Error {
  constructor() {
    super("INSUFFICIENT_CREDITS");
    this.name = "InsufficientCreditsError";
  }
}

/** Thrown inside the start transaction when the vendor is at the concurrency cap. */
class TooManyConcurrentError extends Error {
  constructor() {
    super("TOO_MANY_CONCURRENT");
    this.name = "TooManyConcurrentError";
  }
}

/**
 * Thrown when the vendor's plan sets an OPTIONAL monthly shoot ceiling
 * (SubscriptionPlan.monthlyLimit) and they've reached it this billing period.
 * Null (every default plan) = no ceiling; the wallet balance + credit packs
 * remain the only limit, so this never fires for a plan that didn't opt in.
 */
class MonthlyLimitError extends Error {
  constructor() {
    super("MONTHLY_LIMIT_REACHED");
    this.name = "MonthlyLimitError";
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
      // Abuse ceiling: reject if the vendor already has too many shoots in
      // flight. Checked inside the tx (against committed state) before creating
      // the session, so a runaway caller can't pile up unbounded work.
      const inFlight = await tx.generationJob.count({
        where: {
          session: { vendorId: input.vendorId },
          state: { in: [...IN_FLIGHT_JOB_STATES] },
        },
      });
      if (inFlight >= MAX_CONCURRENT_JOBS_PER_VENDOR) {
        throw new TooManyConcurrentError();
      }

      // Optional per-plan monthly ceiling. Enforced ONLY when the vendor's
      // active subscription's plan sets a non-null monthlyLimit (null = no cap,
      // the default for every plan — the wallet + packs stay the only limit).
      // Counts shoots STARTED in the current billing period; an expired/absent
      // subscription has no active period, so the wallet is the sole gate.
      const sub = await tx.studioSubscription.findUnique({
        where: { vendorId: input.vendorId },
        select: {
          status: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
          plan: { select: { monthlyLimit: true } },
        },
      });
      const limit = sub?.plan.monthlyLimit ?? null;
      const periodActive = !!sub && sub.status === "ACTIVE" && sub.currentPeriodEnd.getTime() > Date.now();
      if (limit != null && periodActive) {
        const startedThisPeriod = await tx.generationSession.count({
          where: { vendorId: input.vendorId, createdAt: { gte: sub!.currentPeriodStart } },
        });
        if (startedThisPeriod >= limit) {
          throw new MonthlyLimitError();
        }
      }

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
    if (err instanceof TooManyConcurrentError) {
      l.info("startGeneration blocked — concurrency cap", { cap: MAX_CONCURRENT_JOBS_PER_VENDOR });
      return { ok: false, reason: "TOO_MANY_CONCURRENT" };
    }
    if (err instanceof MonthlyLimitError) {
      l.info("startGeneration blocked — plan monthly limit reached");
      return { ok: false, reason: "MONTHLY_LIMIT_REACHED" };
    }
    const message = err instanceof Error ? err.message : "unknown";
    l.error("startGeneration failed", { error: message });
    return { ok: false, reason: "ERROR", message };
  }
}
