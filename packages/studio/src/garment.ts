import { prisma } from "@ayvana/db";
import { logger } from "@ayvana/observability";
import {
  getFashionProvider,
  type UploadDescriptor,
  type UploadValidationIssue,
} from "@ayvana/fashion";

const log = logger.child({ module: "studio.garment" });

export type GarmentImageInput = {
  role: string; // GarmentImageRole
  storageKey: string;
  contentType: string;
  bytes: number;
  width?: number;
  height?: number;
};

export type CreateGarmentInput = {
  vendorId: string;
  productId?: string | null;
  images: GarmentImageInput[];
  correlationId: string;
};

export type CreateGarmentResult =
  | { ok: true; garmentId: string; qc: { passed: true; issues: [] } }
  | { ok: false; reason: "QC_FAILED"; issues: UploadValidationIssue[] }
  | { ok: false; reason: "VENDOR_INACTIVE" | "ERROR"; message?: string };

const ROLE_VALUES = new Set([
  "FRONT",
  "BACK",
  "OPEN",
  "SLEEVE",
  "EMBROIDERY",
  "BUTTON",
  "FABRIC",
  "LOGO",
  "COLLAR",
  "BELT",
  "POCKET",
  "DETAIL",
]);

/**
 * Create a GarmentAsset from already-uploaded images, running upload QC FIRST.
 *
 * Validation runs BEFORE any generation and consumes NO credit on failure — on a
 * QC failure we persist nothing and start no job, returning actionable errors so
 * the seller can fix and retry. (Credits are Phase 4; "consume nothing" here just
 * means "don't start a shoot".)
 *
 * vendorId is server-resolved by the caller; the vendor must be ACTIVE.
 */
export async function createGarment(input: CreateGarmentInput): Promise<CreateGarmentResult> {
  const l = log.child({ correlationId: input.correlationId, vendorId: input.vendorId });

  const vendor = await prisma.vendor
    .findUnique({ where: { id: input.vendorId }, select: { status: true } })
    .catch(() => null);
  if (!vendor || vendor.status !== "ACTIVE") return { ok: false, reason: "VENDOR_INACTIVE" };

  // QC gate (deterministic, no generation, no credit).
  const descriptors: UploadDescriptor[] = input.images.map((i) => ({
    role: i.role,
    contentType: i.contentType,
    bytes: i.bytes,
    width: i.width,
    height: i.height,
  }));
  const qc = getFashionProvider("ANALYZE").validateUpload(descriptors);
  if (!qc.passed) {
    l.info("garment QC failed (no job started)", { issues: qc.issues.length });
    return { ok: false, reason: "QC_FAILED", issues: qc.issues };
  }

  try {
    const garment = await prisma.garmentAsset.create({
      data: {
        vendorId: input.vendorId,
        productId: input.productId ?? null,
        status: "QC_PASSED",
        images: {
          create: input.images.map((i) => ({
            role: normalizeRole(i.role),
            storageKey: i.storageKey,
            width: i.width ?? null,
            height: i.height ?? null,
            qcPassed: true,
            qcIssues: [],
          })),
        },
      },
      select: { id: true },
    });
    l.info("garment created", { garmentId: garment.id, images: input.images.length });
    return { ok: true, garmentId: garment.id, qc: { passed: true, issues: [] } };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    l.error("createGarment failed", { error: message });
    return { ok: false, reason: "ERROR", message };
  }
}

function normalizeRole(role: string) {
  const up = role.toUpperCase();
  return (ROLE_VALUES.has(up) ? up : "DETAIL") as
    | "FRONT"
    | "BACK"
    | "OPEN"
    | "SLEEVE"
    | "EMBROIDERY"
    | "BUTTON"
    | "FABRIC"
    | "LOGO"
    | "COLLAR"
    | "BELT"
    | "POCKET"
    | "DETAIL";
}
