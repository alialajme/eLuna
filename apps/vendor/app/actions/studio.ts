"use server";

import { revalidatePath } from "next/cache";
import { newCorrelationId } from "@ayvana/observability";
import {
  createGarment,
  startGeneration,
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
): Promise<CreateGarmentActionResult> {
  const resolved = await resolveActiveVendor();
  if (!resolved.ok) return { ok: false, error: resolved.error };

  const correlationId = newCorrelationId();
  const res = await createGarment({
    vendorId: resolved.vendor.id,
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
  options: { modelProfileId?: string | null; backgroundId?: string | null } = {},
): Promise<BeginShootActionResult> {
  const resolved = await resolveActiveVendor();
  if (!resolved.ok) return { ok: false, error: resolved.error };

  // Server-side feature gate: in prod with no provider keys the feature is
  // disabled rather than producing publishable fake output (ADR R2).
  if (!fashionAvailable("TRYON")) {
    return { ok: false, error: "AI shoots are not available yet. Please check back soon." };
  }

  const correlationId = newCorrelationId();
  // Idempotency: one in-flight shoot per (garment, model, background) tuple.
  const idempotencyKey = `shoot:${garmentId}:${options.modelProfileId ?? "_"}:${options.backgroundId ?? "_"}`;

  const res = await startGeneration({
    vendorId: resolved.vendor.id,
    garmentId,
    modelProfileId: options.modelProfileId ?? null,
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
