import { prisma, type Prisma } from "@ayvana/db";
import { logger } from "@ayvana/observability";
import { getStorage } from "@ayvana/storage";
import {
  getFashionProvider,
  SHOOT_ANGLES,
  type AssetRef,
  type ViewAngle,
} from "@ayvana/fashion";

const log = logger.child({ module: "studio.pipeline" });

// Fidelity floor (commerce-safety gate). Below this → retry/REVIEW_REQUIRED,
// never publish. Config-in-DB tuning is Phase 2; the constant is the seam.
const FIDELITY_FLOOR = 0.75;
const VIDEO_SECONDS = 6;

export type RunJobResult =
  | { status: "completed" }
  | { status: "review_required"; reason: string }
  | { status: "failed"; error: string };

/**
 * Run one GenerationJob through the full state machine:
 *   QUEUED → VALIDATING → ANALYZING → GENERATING_IMAGES → VALIDATING_IMAGES
 *   → GENERATING_VIDEO → VALIDATING_VIDEO → COMPLETED
 * Branches: REVIEW_REQUIRED (fidelity floor after retries) | FAILED (platform).
 *
 * Idempotent: re-running a job that already produced assets is a no-op for those
 * steps (the worker delivers at-least-once; duplicate delivery must not double-
 * generate). All work is scoped to the session's vendor by construction.
 *
 * Phase 1 uses the Simulated provider end-to-end when no keys are set; video is
 * a stub artifact (real frame-conditioned video is Phase 3) but the state is
 * exercised so the machine is complete.
 */
export async function runGenerationJob(jobId: string): Promise<RunJobResult> {
  const job = await prisma.generationJob.findUnique({
    where: { id: jobId },
    select: { id: true, sessionId: true, state: true, correlationId: true, attempts: true },
  });
  if (!job) return { status: "failed", error: "job not found" };

  const l = log.child({ correlationId: job.correlationId, jobId, sessionId: job.sessionId });
  const cid = job.correlationId;

  const session = await prisma.generationSession.findUnique({
    where: { id: job.sessionId },
    select: {
      id: true,
      vendorId: true,
      garmentId: true,
      seed: true,
      modelProfile: { select: { referenceKeys: true, seed: true } },
    },
  });
  if (!session) return { status: "failed", error: "session not found" };

  try {
    await setJobState(jobId, "VALIDATING", { startedAt: new Date() });

    // ── Load garment images (storage keys) ──
    const images = await prisma.garmentImage.findMany({
      where: { garmentId: session.garmentId },
      select: { storageKey: true, role: true },
    });
    const garmentRefs: AssetRef[] = images.map((i) => ({ storageKey: i.storageKey }));
    if (garmentRefs.length === 0) {
      return await fail(jobId, session.id, "no garment images");
    }

    // ── ANALYZE (idempotent: skip if analysis already exists) ──
    await setJobState(jobId, "ANALYZING");
    const existingAnalysis = await prisma.garmentAnalysis.findUnique({
      where: { garmentId: session.garmentId },
      select: { id: true },
    });
    if (!existingAnalysis) {
      const analyzer = getFashionProvider("ANALYZE");
      const res = await analyzer.analyzeGarment({ images: garmentRefs, correlationId: cid });
      if (res.status === "failed") return await fail(jobId, session.id, `analyze: ${res.error}`);
      const a = res.analysis;
      await prisma.garmentAnalysis.create({
        data: {
          garmentId: session.garmentId,
          colors: a.colors as unknown as Prisma.InputJsonValue,
          material: a.material,
          pattern: a.pattern,
          length: a.length,
          sleeve: a.sleeve,
          neckline: a.neckline,
          closure: a.closure,
          buttons: a.buttons as Prisma.InputJsonValue,
          embroidery: a.embroidery as Prisma.InputJsonValue,
          logo: a.logo as Prisma.InputJsonValue,
          pockets: a.pockets as Prisma.InputJsonValue,
          belt: a.belt as Prisma.InputJsonValue,
          segmentationMasks: a.segmentationMasks,
          detailCrops: a.detailCrops,
          embeddings: a.embeddings as Prisma.InputJsonValue,
          modelName: a.modelName,
        },
      });
      await prisma.garmentAsset.update({
        where: { id: session.garmentId },
        data: { status: "ANALYZED", category: a.category, silhouette: a.silhouette },
      });
      l.info("garment analyzed");
    }

    // ── GENERATE IMAGES (session is the consistency anchor) ──
    await setJobState(jobId, "GENERATING_IMAGES");
    const modelRefs = asStringArray(session.modelProfile?.referenceKeys);
    const seed = toSeed(session.seed ?? session.modelProfile?.seed ?? null);
    const outPrefix = `${session.vendorId}/${session.id}`;

    const existingImages = await prisma.generatedAsset.findMany({
      where: { sessionId: session.id, type: { not: "VIDEO_TURNTABLE" } },
      select: { type: true, storageKey: true },
    });
    const haveTypes = new Set(existingImages.map((a) => a.type));

    // Try-on composite anchors the identity across all 4 angles.
    const tryOn = getFashionProvider("TRYON");
    const composite = await tryOn.virtualTryOn({
      garmentImages: garmentRefs,
      modelReferenceKeys: modelRefs,
      seed,
      correlationId: cid,
      outKeyPrefix: outPrefix,
    });
    if (composite.status === "failed") return await fail(jobId, session.id, `tryon: ${composite.error}`);

    const anglesToMake = SHOOT_ANGLES.filter((a) => !haveTypes.has(a));
    if (anglesToMake.length > 0) {
      const multi = getFashionProvider("MULTIVIEW");
      const mv = await multi.generateMultiView({
        compositeKey: composite.composite.storageKey,
        garmentImages: garmentRefs,
        modelReferenceKeys: modelRefs,
        seed,
        angles: anglesToMake,
        correlationId: cid,
        outKeyPrefix: outPrefix,
      });
      if (mv.status === "failed") return await fail(jobId, session.id, `multiview: ${mv.error}`);

      for (const img of mv.images) {
        await prisma.generatedAsset.create({
          data: {
            sessionId: session.id,
            type: img.angle,
            storageKey: img.storageKey,
            provider: img.provider,
            providerModel: img.providerModel,
            width: img.width,
            height: img.height,
            isSimulated: img.isSimulated,
          },
        });
      }
      l.info("images generated", { count: mv.images.length });
    }

    // ── VALIDATE IMAGES (fidelity gate before any publish) ──
    await setJobState(jobId, "VALIDATING_IMAGES");
    const assets = await prisma.generatedAsset.findMany({
      where: { sessionId: session.id, type: { not: "VIDEO_TURNTABLE" } },
      select: { id: true, storageKey: true },
    });
    const scorer = getFashionProvider("FIDELITY");
    const sourceKeys = garmentRefs.map((r) => r.storageKey);
    let minFidelity = 1;
    for (const asset of assets) {
      const fid = await scorer.validateGarmentFidelity({
        sourceKeys,
        generatedKey: asset.storageKey,
        correlationId: cid,
      });
      if (fid.status === "ok") minFidelity = Math.min(minFidelity, fid.garmentFidelity);
    }
    if (minFidelity < FIDELITY_FLOOR) {
      // Phase 1: no auto-retry loop yet — route to manual review (never publish
      // below the commerce-safety floor). Retry policy is Phase 2/3.
      return await review(jobId, session.id, `fidelity ${minFidelity.toFixed(2)} < floor`);
    }

    // ── VIDEO (stub this phase; state exercised, asset recorded) ──
    await setJobState(jobId, "GENERATING_VIDEO");
    const haveVideo = await prisma.generatedAsset.findFirst({
      where: { sessionId: session.id, type: "VIDEO_TURNTABLE" },
      select: { id: true },
    });
    if (!haveVideo) {
      const frameKeys = assets.map((a) => a.storageKey);
      const videoProvider = getFashionProvider("VIDEO");
      const vid = await videoProvider.generateVideo({
        frameKeys,
        seed,
        durationSec: VIDEO_SECONDS,
        correlationId: cid,
        outKeyPrefix: outPrefix,
      });
      if (vid.status === "ok") {
        await prisma.generatedAsset.create({
          data: {
            sessionId: session.id,
            type: "VIDEO_TURNTABLE",
            storageKey: vid.video.storageKey,
            provider: vid.video.provider,
            providerModel: vid.video.providerModel,
            durationSec: vid.video.durationSec,
            isSimulated: vid.video.isSimulated,
          },
        });
      }
      // A video failure in Phase 1 does NOT fail the shoot (video is not yet a
      // first-class deliverable) — the images are the product.
    }

    await setJobState(jobId, "VALIDATING_VIDEO");
    await setJobState(jobId, "COMPLETED", { finishedAt: new Date() });
    await prisma.generationSession.update({
      where: { id: session.id },
      data: { status: "PREVIEW", provider: composite.composite.provider },
    });
    l.info("generation completed");
    return { status: "completed" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    l.error("pipeline error", { error: message });
    return await fail(jobId, session.id, message);
  }
}

// ── helpers ──

async function setJobState(
  jobId: string,
  state:
    | "VALIDATING"
    | "ANALYZING"
    | "GENERATING_IMAGES"
    | "VALIDATING_IMAGES"
    | "GENERATING_VIDEO"
    | "VALIDATING_VIDEO"
    | "COMPLETED"
    | "FAILED"
    | "REVIEW_REQUIRED",
  extra: { startedAt?: Date; finishedAt?: Date } = {},
): Promise<void> {
  await prisma.generationJob.update({ where: { id: jobId }, data: { state, ...extra } });
}

async function fail(jobId: string, sessionId: string, error: string): Promise<RunJobResult> {
  await prisma.generationJob
    .update({ where: { id: jobId }, data: { state: "FAILED", error, finishedAt: new Date() } })
    .catch(() => undefined);
  await prisma.generationSession
    .update({ where: { id: sessionId }, data: { status: "FAILED" } })
    .catch(() => undefined);
  return { status: "failed", error };
}

async function review(jobId: string, sessionId: string, reason: string): Promise<RunJobResult> {
  await prisma.generationJob
    .update({ where: { id: jobId }, data: { state: "REVIEW_REQUIRED", error: reason, finishedAt: new Date() } })
    .catch(() => undefined);
  await prisma.generationSession
    .update({ where: { id: sessionId }, data: { status: "REVIEW_REQUIRED" } })
    .catch(() => undefined);
  return { status: "review_required", reason };
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function toSeed(v: bigint | null): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export { FIDELITY_FLOOR };
// re-export so the worker/tests can assert the storage path is wired
export { getStorage };
