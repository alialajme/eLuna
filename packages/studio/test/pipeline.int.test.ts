import { describe, it, expect } from "vitest";
import { prisma } from "@ayvana/db";
import { startGeneration, runGenerationJob, runWorkerOnce } from "../src";
import { makeVendor, makeGarment } from "./factories";

const cid = () => `cid_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const idem = () => `idem_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

describe("generation pipeline (integration, keyless Simulated)", () => {
  it("runs the full state machine to COMPLETED and produces 4 images + a video", async () => {
    const { vendorId } = await makeVendor();
    const { garmentId } = await makeGarment(vendorId);

    const start = await startGeneration({ vendorId, garmentId, idempotencyKey: idem(), correlationId: cid() });
    expect(start.ok).toBe(true);
    if (!start.ok) return;

    const result = await runGenerationJob(start.jobId);
    expect(result.status).toBe("completed");

    const job = await prisma.generationJob.findUniqueOrThrow({ where: { id: start.jobId } });
    expect(job.state).toBe("COMPLETED");
    expect(job.finishedAt).not.toBeNull();

    const session = await prisma.generationSession.findUniqueOrThrow({ where: { id: start.sessionId } });
    expect(session.status).toBe("PREVIEW");

    const images = await prisma.generatedAsset.findMany({
      where: { sessionId: start.sessionId, type: { not: "VIDEO_TURNTABLE" } },
    });
    expect(images.length).toBe(4);
    expect(images.every((a) => a.isSimulated)).toBe(true);
    const types = new Set(images.map((a) => a.type));
    expect(types).toEqual(new Set(["IMAGE_FRONT", "IMAGE_BACK", "IMAGE_34_FRONT", "IMAGE_34_BACK"]));

    const video = await prisma.generatedAsset.findFirst({
      where: { sessionId: start.sessionId, type: "VIDEO_TURNTABLE" },
    });
    expect(video).not.toBeNull();

    // The garment was analyzed exactly once.
    const analysis = await prisma.garmentAnalysis.findUnique({ where: { garmentId } });
    expect(analysis).not.toBeNull();
  });

  it("is idempotent: re-running a completed job does NOT double-generate", async () => {
    const { vendorId } = await makeVendor();
    const { garmentId } = await makeGarment(vendorId);
    const start = await startGeneration({ vendorId, garmentId, idempotencyKey: idem(), correlationId: cid() });
    if (!start.ok) throw new Error("start failed");

    await runGenerationJob(start.jobId);
    await runGenerationJob(start.jobId); // re-deliver

    const images = await prisma.generatedAsset.count({
      where: { sessionId: start.sessionId, type: { not: "VIDEO_TURNTABLE" } },
    });
    expect(images).toBe(4); // still 4, not 8
    const analyses = await prisma.garmentAnalysis.count({ where: { garmentId } });
    expect(analyses).toBe(1);
  });

  it("deduplicates startGeneration on a duplicate idempotencyKey (one session, one job)", async () => {
    const { vendorId } = await makeVendor();
    const { garmentId } = await makeGarment(vendorId);
    const key = idem();

    const a = await startGeneration({ vendorId, garmentId, idempotencyKey: key, correlationId: cid() });
    const b = await startGeneration({ vendorId, garmentId, idempotencyKey: key, correlationId: cid() });
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(b.deduped).toBe(true);
      expect(b.sessionId).toBe(a.sessionId);
      expect(b.jobId).toBe(a.jobId);
    }
    const sessions = await prisma.generationSession.count({ where: { vendorId } });
    expect(sessions).toBe(1);
  });

  it("drives the job to COMPLETED via the outbox worker (no double-generation on re-claim)", async () => {
    const { vendorId } = await makeVendor();
    const { garmentId } = await makeGarment(vendorId);
    const start = await startGeneration({ vendorId, garmentId, idempotencyKey: idem(), correlationId: cid() });
    if (!start.ok) throw new Error("start failed");

    // Drain the outbox (several passes; other tests' events may share the queue).
    for (let i = 0; i < 6; i++) await runWorkerOnce();

    const job = await prisma.generationJob.findUniqueOrThrow({ where: { id: start.jobId } });
    expect(job.state).toBe("COMPLETED");

    const images = await prisma.generatedAsset.count({
      where: { sessionId: start.sessionId, type: { not: "VIDEO_TURNTABLE" } },
    });
    expect(images).toBe(4);
  });
});
