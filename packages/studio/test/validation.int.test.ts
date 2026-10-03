import { describe, it, expect } from "vitest";
import { prisma } from "@ayvana/db";
import { createGarment } from "../src";
import { makeVendor } from "./factories";

const cid = () => `cid_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const okImage = (role: string) => ({
  role,
  storageKey: `original/${role.toLowerCase()}.jpg`,
  contentType: "image/jpeg",
  bytes: 2_000_000,
  width: 1024,
  height: 1536,
});

describe("upload QC validation (integration)", () => {
  it("creates a garment when QC passes", async () => {
    const { vendorId } = await makeVendor();
    const res = await createGarment({
      vendorId,
      images: [okImage("FRONT"), okImage("BACK")],
      correlationId: cid(),
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.qc.passed).toBe(true);
      const imgs = await prisma.garmentImage.count({ where: { garmentId: res.garmentId } });
      expect(imgs).toBe(2);
    }
  });

  it("FAILS QC and creates NO garment (and starts NO job) on unsupported type / too-large / missing front", async () => {
    const { vendorId } = await makeVendor();
    const before = await prisma.garmentAsset.count({ where: { vendorId } });

    const res = await createGarment({
      vendorId,
      images: [
        { role: "BACK", storageKey: "k1", contentType: "image/gif", bytes: 99_000_000, width: 100, height: 100 },
      ],
      correlationId: cid(),
    });

    expect(res.ok).toBe(false);
    if (!res.ok && res.reason === "QC_FAILED") {
      const codes = res.issues.map((i) => i.code);
      expect(codes).toContain("TOO_FEW");
      expect(codes).toContain("UNSUPPORTED_TYPE");
      expect(codes).toContain("TOO_LARGE");
      expect(codes).toContain("LOW_RESOLUTION");
    } else {
      throw new Error(`expected QC_FAILED, got ${JSON.stringify(res)}`);
    }

    // Critical: no garment persisted, no job created on a QC failure.
    const after = await prisma.garmentAsset.count({ where: { vendorId } });
    expect(after).toBe(before);
    const sessions = await prisma.generationSession.count({ where: { vendorId } });
    expect(sessions).toBe(0);
    const jobs = await prisma.generationJob.count({ where: { session: { vendorId } } });
    expect(jobs).toBe(0);
  });

  it("flags a missing FRONT even with enough images", async () => {
    const { vendorId } = await makeVendor();
    const res = await createGarment({
      vendorId,
      images: [okImage("BACK"), okImage("SLEEVE")],
      correlationId: cid(),
    });
    expect(res.ok).toBe(false);
    if (!res.ok && res.reason === "QC_FAILED") {
      expect(res.issues.map((i) => i.code)).toContain("MISSING_FRONT");
    } else {
      throw new Error("expected MISSING_FRONT");
    }
  });

  it("refuses a non-ACTIVE vendor", async () => {
    const { vendorId } = await makeVendor("PENDING");
    const res = await createGarment({
      vendorId,
      images: [okImage("FRONT"), okImage("BACK")],
      correlationId: cid(),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("VENDOR_INACTIVE");
  });
});
