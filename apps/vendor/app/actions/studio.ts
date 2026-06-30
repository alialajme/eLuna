"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@e-luna/db";
import { detectGarment, writeCopy } from "@e-luna/ai";
import { safeCurrentUser } from "../lib/auth";
import { getVendorByUserId } from "../lib/vendor";

export async function createStudioUpload(
  sourceImageUrls: string[]
): Promise<{ id: string } | { error: string }> {
  const user = await safeCurrentUser();
  if (!user) return { error: "Unauthorized" };

  const vendor = await getVendorByUserId(user.id);
  if (!vendor) return { error: "Vendor not found" };

  const upload = await prisma.studioUpload
    .create({
      data: {
        vendorId: vendor.id,
        sourceImages: sourceImageUrls,
        status: "PENDING",
      },
    })
    .catch((err: Error) => ({ error: err.message }));

  if ("error" in upload) return upload;
  return { id: upload.id };
}

export async function triggerStudioPipeline(
  uploadId: string
): Promise<{ success: boolean; error?: string }> {
  const user = await safeCurrentUser();
  if (!user) return { success: false, error: "Unauthorized" };

  const vendor = await getVendorByUserId(user.id);
  if (!vendor) return { success: false, error: "Vendor not found" };

  const upload = await prisma.studioUpload
    .findUnique({ where: { id: uploadId } })
    .catch(() => null);

  if (!upload) return { success: false, error: "Not found" };
  if (upload.vendorId !== vendor.id)
    return { success: false, error: "Unauthorized" };

  // Mark as processing
  await prisma.studioUpload.update({
    where: { id: uploadId },
    data: { status: "PROCESSING" },
  });

  try {
    const sourceImages = upload.sourceImages as string[];

    const garment = await detectGarment(sourceImages);
    const copy = await writeCopy(garment);

    await prisma.studioUpload.update({
      where: { id: uploadId },
      data: {
        generatedAssets: { garment, copy },
        status: "COMPLETE",
      },
    });

    revalidatePath("/studio");
    revalidatePath(`/studio/${uploadId}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await prisma.studioUpload.update({
      where: { id: uploadId },
      data: {
        generatedAssets: { error: message },
        status: "FAILED",
      },
    });
    revalidatePath("/studio");
    revalidatePath(`/studio/${uploadId}`);
    return { success: false, error: message };
  }
}
