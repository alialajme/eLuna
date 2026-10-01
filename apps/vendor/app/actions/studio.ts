"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@ayvana/db";
import { newCorrelationId } from "@ayvana/observability";
import {
  createGarment,
  startGeneration,
  approveSession,
  linkSessionToProduct,
  type GarmentImageInput,
} from "@ayvana/studio";
import { fashionAvailable } from "@ayvana/fashion";
import { safeCurrentUser } from "../lib/auth";
import { getVendorByUserId } from "../lib/vendor";

// All actions resolve the vendor server-side (safeCurrentUser → getVendorByUserId
// → ACTIVE) and NEVER trust a vendorId from the client. Generation runs in the
// worker — these actions only validate + enqueue (no long-held HTTP).

type ResolvedVendor =
  | { ok: true; vendor: { id: string } }
  | { ok: false; error: string };

async function resolveActiveVendor(): Promise<ResolvedVendor> {
  const user = await safeCurrentUser();
  if (!user) return { ok: false, error: "Unauthorized" };
  const vendor = await getVendorByUserId(user.id);
  if (!vendor) return { ok: false, error: "Vendor not found" };
  if (vendor.status !== "ACTIVE") return { ok: false, error: "Your store is not active yet." };
  return { ok: true, vendor: { id: vendor.id } };
}

/**
 * Validate that an optional productId belongs to THIS vendor before we link a
 * shoot to it. A vendor may only scope a shoot to / attach assets to their own
 * product. Returns the owned productId, null (no product — a new-product shoot),
 * or an error for a product that isn't theirs (undisclosed as "not found").
 */
async function resolveOwnedProductId(
  vendorId: string,
  productId: string | null | undefined,
): Promise<{ productId: string | null } | { error: string }> {
  if (!productId) return { productId: null };
  const product = await prisma.product
    .findUnique({ where: { id: productId }, select: { id: true, vendorId: true } })
    .catch(() => null);
  // Non-owner (or missing) → undisclosed existence, same as a missing product.
  if (!product || product.vendorId !== vendorId) return { error: "That product could not be found." };
  return { productId: product.id };
}

export type StudioUploadImage = {
  role: string;
  storageKey: string;
  contentType: string;
  bytes: number;
  width?: number;
  height?: number;
};

export type CreateGarmentActionResult =
  | { ok: true; garmentId: string }
  | { ok: false; error?: string; issues?: { role?: string; message: string }[] };

/**
 * Validate uploads (QC) and create a garment. QC runs BEFORE any generation and
 * starts no job on failure — the vendor gets actionable issues to fix.
 */
export async function createGarmentAction(
  images: StudioUploadImage[],
  productId?: string | null,
): Promise<CreateGarmentActionResult> {
  const resolved = await resolveActiveVendor();
  if (!resolved.ok) return { ok: false, error: resolved.error };

  // Ownership-check the optional product link (an existing-product shoot). A new
  // product has no id yet — productId stays null and is linked after the save.
  const owned = await resolveOwnedProductId(resolved.vendor.id, productId);
  if ("error" in owned) return { ok: false, error: owned.error };

  const correlationId = newCorrelationId();
  const res = await createGarment({
    vendorId: resolved.vendor.id,
    productId: owned.productId,
    images: images as GarmentImageInput[],
    correlationId,
  });

  if (res.ok) {
    revalidatePath("/studio");
    return { ok: true, garmentId: res.garmentId };
  }
  if (res.reason === "QC_FAILED") {
    return { ok: false, issues: res.issues.map((i) => ({ role: i.role, message: i.message })) };
  }
  return { ok: false, error: res.message ?? "Could not prepare your photos." };
}

export type BeginShootActionResult =
  | { ok: true; sessionId: string }
  | { ok: false; error: string };

/**
 * Begin an AI shoot for a garment: reserve nothing (credits are later), create
 * the session + queue the job. Idempotency key is derived per request so a
 * double-click returns the same shoot instead of starting two.
 */
export async function beginShootAction(
  garmentId: string,
  options: { modelProfileId?: string | null; backgroundId?: string | null; productId?: string | null } = {},
): Promise<BeginShootActionResult> {
  const resolved = await resolveActiveVendor();
  if (!resolved.ok) return { ok: false, error: resolved.error };

  // Server-side feature gate: in prod with no provider keys the feature is
  // disabled rather than producing publishable fake output (ADR R2).
  if (!fashionAvailable("TRYON")) {
    return { ok: false, error: "AI shoots are not available yet. Please check back soon." };
  }

  // Ownership-check the optional product link before scoping the session to it.
  const owned = await resolveOwnedProductId(resolved.vendor.id, options.productId);
  if ("error" in owned) return { ok: false, error: owned.error };

  const correlationId = newCorrelationId();
  // Idempotency: one in-flight shoot per (garment, model, background) tuple.
  const idempotencyKey = `shoot:${garmentId}:${options.modelProfileId ?? "_"}:${options.backgroundId ?? "_"}`;

  const res = await startGeneration({
    vendorId: resolved.vendor.id,
    garmentId,
    modelProfileId: options.modelProfileId ?? null,
    productId: owned.productId,
    backgroundId: options.backgroundId ?? null,
    idempotencyKey,
    correlationId,
  });

  if (res.ok) {
    revalidatePath("/studio");
    revalidatePath(`/studio/${res.sessionId}`);
    return { ok: true, sessionId: res.sessionId };
  }
  const messages: Record<string, string | undefined> = {
    GARMENT_NOT_FOUND: "That garment could not be found.",
    NOT_OWNED: "That garment could not be found.",
    VENDOR_INACTIVE: "Your store is not active yet.",
    ERROR: res.message ?? "Could not start the shoot.",
  };
  return { ok: false, error: messages[res.reason] ?? "Could not start the shoot." };
}

export type ApproveShootActionResult =
  | { ok: true; images: string[]; productId: string | null }
  | { ok: false; error: string };

/**
 * Approve a finished shoot — the four on-model views become the product's
 * images. Returns the signed image URLs so the product form can carry them into
 * its images state (new product, linked after save) or confirm they're attached
 * (existing product). Vendor-scoped: a non-owner can neither approve a shoot nor
 * read its assets.
 */
export async function approveShootAction(sessionId: string): Promise<ApproveShootActionResult> {
  const resolved = await resolveActiveVendor();
  if (!resolved.ok) return { ok: false, error: resolved.error };

  const res = await approveSession(sessionId, resolved.vendor.id);
  if (!res.ok) {
    const messages: Record<string, string> = {
      NOT_FOUND: "That shoot could not be found.",
      NOT_OWNED: "That shoot could not be found.",
      NOT_READY: "This shoot isn't ready to approve yet.",
      ERROR: res.message ?? "Could not approve the shoot.",
    };
    return { ok: false, error: messages[res.reason] ?? "Could not approve the shoot." };
  }

  // An existing-product shoot already carries the images into the listing; a
  // new-product shoot links after the product is saved (linkShootToProductAction).
  if (res.productId) {
    revalidatePath(`/products/${res.productId}`);
  }
  revalidatePath("/studio");
  revalidatePath(`/studio/${sessionId}`);
  return { ok: true, images: res.images, productId: res.productId };
}

/**
 * Link an approved shoot to a product the vendor just created (the new-product
 * path: the shoot ran with no productId; now the product exists). Ownership of
 * both the shoot and the product is re-checked server-side. Best-effort — the
 * product is already saved with its AI images; this only wires the cross-links.
 */
export async function linkShootToProductAction(
  sessionId: string,
  productId: string,
): Promise<{ ok: boolean }> {
  const resolved = await resolveActiveVendor();
  if (!resolved.ok) return { ok: false };

  // resolveOwnedProductId doubles as the product ownership check; linkSessionToProduct
  // re-checks both sides too, so a crafted request can't attach a foreign shoot.
  const owned = await resolveOwnedProductId(resolved.vendor.id, productId);
  if ("error" in owned || !owned.productId) return { ok: false };

  const res = await linkSessionToProduct(sessionId, owned.productId, resolved.vendor.id);
  if (res.ok) {
    revalidatePath("/studio");
    revalidatePath(`/products/${owned.productId}`);
  }
  return res;
}
