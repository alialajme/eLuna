import { prisma } from "@ayvana/db";
import { getStorage } from "@ayvana/storage";
import { logger } from "@ayvana/observability";

const log = logger.child({ module: "studio.approve" });

// Signed-URL TTL for the approved images handed back to the product flow. The
// product form keeps these in its images state until the vendor saves, so the
// window must comfortably outlast a review-and-save (mirrors the read TTL).
const APPROVE_TTL_SECONDS = 3600;

// Front → ¾-front → ¾-back → back: the natural reading order for a listing's
// gallery. Video is never a product image.
const IMAGE_ORDER = ["IMAGE_FRONT", "IMAGE_34_FRONT", "IMAGE_34_BACK", "IMAGE_BACK"];

export type ApproveSessionResult =
  | { ok: true; images: string[]; productId: string | null }
  | { ok: false; reason: "NOT_FOUND" | "NOT_OWNED" | "NOT_READY" | "ERROR"; message?: string };

/**
 * Approve a completed shoot: flip the session to APPROVED and return the four
 * generated on-model views as signed URLs, in listing order. These URLs become
 * the product's images (the caller persists them via createProduct/updateProduct).
 *
 * Security: vendorId is resolved server-side by the caller and NEVER trusted
 * from the client. The session is re-checked to belong to this vendor — a
 * non-owner (or missing) session returns NOT_OWNED (undisclosed existence).
 *
 * Idempotent: approving an already-APPROVED session just re-mints the URLs.
 */
export async function approveSession(sessionId: string, vendorId: string): Promise<ApproveSessionResult> {
  const session = await prisma.generationSession
    .findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        vendorId: true,
        status: true,
        productId: true,
        assets: {
          where: { type: { not: "VIDEO_TURNTABLE" } },
          select: { type: true, storageKey: true },
        },
      },
    })
    .catch(() => null);

  // Ownership check first — a non-owner gets the same answer as a missing session.
  if (!session || session.vendorId !== vendorId) return { ok: false, reason: "NOT_OWNED" };

  // Only a finished shoot with images can be approved (PREVIEW is the done state;
  // APPROVED is allowed so the action is idempotent/re-runnable).
  if (session.status !== "PREVIEW" && session.status !== "APPROVED") {
    return { ok: false, reason: "NOT_READY" };
  }
  if (session.assets.length === 0) return { ok: false, reason: "NOT_READY" };

  const storage = getStorage();
  const ordered = [...session.assets].sort(
    (a, b) => IMAGE_ORDER.indexOf(a.type) - IMAGE_ORDER.indexOf(b.type),
  );
  const images: string[] = [];
  for (const asset of ordered) {
    const signed = await storage.getSignedUrl({ key: asset.storageKey, ttlSeconds: APPROVE_TTL_SECONDS });
    if (signed.status === "ok") images.push(signed.url);
  }
  if (images.length === 0) return { ok: false, reason: "ERROR", message: "No viewable images." };

  if (session.status !== "APPROVED") {
    await prisma.generationSession
      .update({ where: { id: session.id }, data: { status: "APPROVED" } })
      .catch((err) => log.error("approve status write failed", { sessionId, error: String(err) }));
  }

  log.info("session approved", { sessionId, productId: session.productId, images: images.length });
  return { ok: true, images, productId: session.productId };
}

/**
 * Link a shoot (session + its garment) to a product the vendor just created, so
 * `/studio` and the product page cross-reference each other. Vendor-scoped on
 * every side: the product, the session, and the garment must all belong to the
 * caller, or nothing is linked. Safe to call best-effort — failures never block
 * the product save.
 */
export async function linkSessionToProduct(
  sessionId: string,
  productId: string,
  vendorId: string,
): Promise<{ ok: boolean }> {
  const [session, product] = await Promise.all([
    prisma.generationSession
      .findUnique({ where: { id: sessionId }, select: { id: true, vendorId: true, garmentId: true } })
      .catch(() => null),
    prisma.product
      .findUnique({ where: { id: productId }, select: { id: true, vendorId: true } })
      .catch(() => null),
  ]);

  if (!session || session.vendorId !== vendorId) return { ok: false };
  if (!product || product.vendorId !== vendorId) return { ok: false };

  await prisma
    .$transaction([
      prisma.generationSession.update({ where: { id: session.id }, data: { productId } }),
      prisma.garmentAsset.update({ where: { id: session.garmentId }, data: { productId } }),
    ])
    .catch((err) => log.error("link session→product failed", { sessionId, productId, error: String(err) }));

  return { ok: true };
}
