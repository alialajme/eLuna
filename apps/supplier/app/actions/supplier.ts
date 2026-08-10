"use server";

import { prisma } from "@e-luna/db";
import { safeCurrentUser } from "../lib/auth";
import { sanitizeMaterialTypes } from "../lib/materials";

export async function createSupplier(
  name: string,
  slug: string,
  materialTypes: string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await safeCurrentUser();
    if (!user) return { success: false, error: "Not signed in" };

    const trimmedName = name.trim();
    const trimmedSlug = slug.trim().toLowerCase();
    const cleanTypes = sanitizeMaterialTypes(materialTypes);

    if (trimmedName.length < 2 || trimmedName.length > 60) {
      return { success: false, error: "Company name must be 2–60 characters" };
    }
    if (!/^[a-z0-9-]{3,40}$/.test(trimmedSlug)) {
      return { success: false, error: "Slug must be 3–40 lowercase letters, numbers, or hyphens" };
    }
    if (cleanTypes.length === 0) {
      return { success: false, error: "Select at least one material type" };
    }

    const alreadyRegistered = await prisma.supplier.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (alreadyRegistered) {
      return { success: false, error: "You already have a supplier account" };
    }

    const existing = await prisma.supplier.findUnique({
      where: { companySlug: trimmedSlug },
      select: { id: true },
    });
    if (existing) {
      return { success: false, error: "That supplier URL is already taken" };
    }

    // Upsert User record with SUPPLIER role
    await prisma.user.upsert({
      where: { id: user.id },
      create: {
        id: user.id,
        email: user.emailAddresses[0]?.emailAddress ?? "",
        role: "SUPPLIER",
      },
      update: { role: "SUPPLIER" },
    });

    await prisma.supplier.create({
      data: {
        userId: user.id,
        companyName: trimmedName,
        companySlug: trimmedSlug,
        materialTypes: cleanTypes,
        status: "PENDING",
      },
    });

    return { success: true };
  } catch (err) {
    console.error("[createSupplier]", err);
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      return { success: false, error: "That supplier URL is already taken" };
    }
    return { success: false, error: "Something went wrong" };
  }
}
