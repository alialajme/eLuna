"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@ayvana/db";
import { safeCurrentUser } from "../lib/auth";
import { getTradeLicenseVerifier } from "../lib/trade-license/factory";

type ActiveSupplier = { id: string; companyName: string };

async function resolveActiveSupplier(): Promise<{ supplier: ActiveSupplier } | { error: string }> {
  const user = await safeCurrentUser();
  if (!user) return { error: "Not signed in" };
  const supplier = await prisma.supplier
    .findUnique({ where: { userId: user.id }, select: { id: true, companyName: true, status: true } })
    .catch(() => null);
  if (!supplier) return { error: "Not a supplier" };
  if (supplier.status !== "ACTIVE") return { error: "Your supplier account is not active" };
  return { supplier: { id: supplier.id, companyName: supplier.companyName } };
}

export async function submitTradeLicense(
  licenseNumber: string
): Promise<{ success: boolean; status?: string; error?: string }> {
  const auth = await resolveActiveSupplier();
  if ("error" in auth) return { success: false, error: auth.error };

  const num = licenseNumber.trim();
  if (num.length < 4 || num.length > 30) {
    return { success: false, error: "Enter a valid trade licence number" };
  }

  // Verification is credential-gated: real registry when configured, else a
  // local simulated verifier. The gateway never throws.
  const result = await getTradeLicenseVerifier().verify({
    licenseNumber: num,
    companyName: auth.supplier.companyName,
  });

  try {
    if (result.status === "verified") {
      await prisma.supplier.update({
        where: { id: auth.supplier.id },
        data: {
          tradeLicenseNumber: num,
          tradeLicenseStatus: "VERIFIED",
          tradeLicenseExpiry: result.expiry,
          tradeLicenseVerifiedAt: new Date(),
          tradeLicenseRef: result.externalRef,
        },
      });
      revalidatePath("/settings");
      return { success: true, status: "VERIFIED" };
    }

    if (result.status === "pending") {
      await prisma.supplier.update({
        where: { id: auth.supplier.id },
        data: {
          tradeLicenseNumber: num,
          tradeLicenseStatus: "PENDING",
          tradeLicenseExpiry: null,
          tradeLicenseVerifiedAt: null,
          tradeLicenseRef: result.externalRef,
        },
      });
      revalidatePath("/settings");
      return { success: true, status: "PENDING" };
    }

    // rejected
    await prisma.supplier.update({
      where: { id: auth.supplier.id },
      data: {
        tradeLicenseNumber: num,
        tradeLicenseStatus: "REJECTED",
        tradeLicenseExpiry: null,
        tradeLicenseVerifiedAt: null,
        tradeLicenseRef: null,
      },
    });
    revalidatePath("/settings");
    return { success: false, status: "REJECTED", error: result.reason };
  } catch {
    return { success: false, error: "Failed to save trade licence" };
  }
}
