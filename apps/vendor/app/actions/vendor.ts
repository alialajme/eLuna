"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../lib/auth";

export async function createVendor(
  name: string,
  slug: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await safeCurrentUser();
    if (!user) return { success: false, error: "Not signed in" };

    const trimmedName = name.trim();
    const trimmedSlug = slug.trim().toLowerCase();

    if (trimmedName.length < 2 || trimmedName.length > 60) {
      return { success: false, error: "Store name must be 2–60 characters" };
    }
    if (!/^[a-z0-9-]{3,40}$/.test(trimmedSlug)) {
      return { success: false, error: "Slug must be 3–40 lowercase letters, numbers, or hyphens" };
    }

    const existing = await prisma.vendor.findUnique({
      where: { storeSlug: trimmedSlug },
      select: { id: true },
    });
    if (existing) {
      return { success: false, error: "That store URL is already taken" };
    }

    // Upsert User record with VENDOR role
    await prisma.user.upsert({
      where: { id: user.id },
      create: {
        id: user.id,
        email: user.emailAddresses[0]?.emailAddress ?? "",
        role: "VENDOR",
      },
      update: { role: "VENDOR" },
    });

    await prisma.vendor.create({
      data: {
        userId: user.id,
        storeName: trimmedName,
        storeSlug: trimmedSlug,
        status: "PENDING",
      },
    });

    return { success: true };
  } catch (err) {
    console.error("[createVendor]", err);
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      return { success: false, error: "That store URL is already taken" };
    }
    return { success: false, error: "Could not create store. Please try again." };
  }
}

export async function updateVendorProfile(data: {
  storeName?: string;
  description?: string;
  logoUrl?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await safeCurrentUser();
    if (!user) return { success: false, error: "Not signed in" };

    const trimmedName = data.storeName?.trim();
    if (trimmedName !== undefined && (trimmedName.length < 2 || trimmedName.length > 60)) {
      return { success: false, error: "Store name must be 2–60 characters" };
    }

    await prisma.vendor.update({
      where: { userId: user.id },
      data: {
        ...(trimmedName ? { storeName: trimmedName } : {}),
        description: data.description?.trim() || null,
        logoUrl: data.logoUrl?.trim() || null,
      },
    });

    revalidatePath("/");
    revalidatePath("/settings");
    return { success: true };
  } catch (err) {
    console.error("[updateVendorProfile]", err);
    return { success: false, error: "Could not update profile" };
  }
}

export async function updateVendorIBAN(
  iban: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await safeCurrentUser();
    if (!user) return { success: false, error: "Not signed in" };

    const trimmed = iban.replace(/\s/g, "");
    if (!/^AE\d{21}$/.test(trimmed)) {
      return { success: false, error: "Please enter a valid UAE IBAN (e.g. AE07 0331 2345 6789 0123 456)" };
    }

    await prisma.vendor.update({
      where: { userId: user.id },
      data: { ibanNumber: trimmed },
    });

    return { success: true };
  } catch (err) {
    console.error("[updateVendorIBAN]", err);
    return { success: false, error: "Could not save IBAN" };
  }
}
