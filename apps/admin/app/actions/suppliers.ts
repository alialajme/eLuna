"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { prisma, type SupplierStatus } from "@ayvana/db";
import { getAuthUser, syncClerkRole, invitePartner } from "@ayvana/auth";

type ActionResult = { success: true } | { error: string };
type CreateResult = { success: true; id: string; invited: boolean } | { error: string };

const SUPPLIER_APP_URL = process.env.SUPPLIER_APP_URL ?? "https://supply.ayvana.ae";

// Mirrors the supplier onboarding allowlist (apps/supplier/app/lib/materials MATERIAL_TYPES).
const MATERIAL_TYPE_VALUES = ["fabric", "trim", "lining", "thread", "hardware"];
const sanitizeTypes = (input: string[]) =>
  [...new Set(input.map((t) => t.trim().toLowerCase()).filter((t) => MATERIAL_TYPE_VALUES.includes(t)))];

async function setSupplierStatus(
  id: string,
  status: SupplierStatus
): Promise<ActionResult> {
  // Defense-in-depth: verify the ADMIN role in the action itself, not just in
  // middleware. Server actions are directly-invocable POST endpoints.
  const user = await getAuthUser();
  if (!user) return { error: "Unauthorized" };
  if (user.role !== "ADMIN") return { error: "Forbidden" };

  try {
    const supplier = await prisma.supplier.update({
      where: { id },
      data: { status },
      select: { userId: true },
    });

    // On approval, sync role + supplierId into Clerk so the supplier's session
    // claim grants access to their OS. Best-effort; never blocks the DB write.
    if (status === "ACTIVE") {
      await syncClerkRole(supplier.userId, { role: "SUPPLIER", supplierId: id });
    }

    revalidatePath("/");
    revalidatePath("/suppliers");
    revalidatePath("/suppliers/approvals");
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Update failed" };
  }
}

export async function approveSupplier(id: string): Promise<ActionResult> {
  return setSupplierStatus(id, "ACTIVE");
}

export async function rejectSupplier(id: string): Promise<ActionResult> {
  return setSupplierStatus(id, "REJECTED");
}

export async function suspendSupplier(id: string): Promise<ActionResult> {
  return setSupplierStatus(id, "SUSPENDED");
}

export async function reactivateSupplier(id: string): Promise<ActionResult> {
  return setSupplierStatus(id, "ACTIVE");
}

/**
 * Admin-provisions a contracted supplier: creates the DB account (role SUPPLIER,
 * status ACTIVE) and sends a Clerk email invitation carrying role + supplierId.
 * Invite is credential-gated (no Clerk key → record only). The DB User is keyed
 * by a placeholder id until acceptance (reconciled by email via the user.created
 * webhook — see docs/deployment/clerk-roles.md).
 */
export async function createSupplierAccount(input: {
  email: string;
  companyName: string;
  companySlug: string;
  materialTypes: string[];
}): Promise<CreateResult> {
  const user = await getAuthUser();
  if (!user) return { error: "Unauthorized" };
  if (user.role !== "ADMIN") return { error: "Forbidden" };

  const email = input.email.trim().toLowerCase();
  const companyName = input.companyName.trim();
  const companySlug = input.companySlug.trim().toLowerCase();
  const materialTypes = sanitizeTypes(input.materialTypes);

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter a valid email" };
  if (companyName.length < 2 || companyName.length > 60) return { error: "Company name must be 2–60 characters" };
  if (!/^[a-z0-9-]{3,40}$/.test(companySlug)) return { error: "Slug must be 3–40 lowercase letters, numbers, or hyphens" };
  if (materialTypes.length === 0) return { error: "Select at least one material type" };

  const [emailTaken, slugTaken] = await Promise.all([
    prisma.user.findUnique({ where: { email }, select: { id: true } }),
    prisma.supplier.findUnique({ where: { companySlug }, select: { id: true } }),
  ]);
  if (emailTaken) return { error: "A user with that email already exists" };
  if (slugTaken) return { error: "That supplier URL is already taken" };

  const placeholderId = `inv_${randomUUID()}`;

  try {
    const supplier = await prisma.$transaction(async (tx) => {
      await tx.user.create({ data: { id: placeholderId, email, role: "SUPPLIER" } });
      return tx.supplier.create({
        data: { userId: placeholderId, companyName, companySlug, materialTypes, status: "ACTIVE" },
        select: { id: true },
      });
    });

    const invite = await invitePartner({
      email,
      role: "SUPPLIER",
      supplierId: supplier.id,
      redirectUrl: `${SUPPLIER_APP_URL}/sign-up`,
    });

    revalidatePath("/suppliers");
    return { success: true, id: supplier.id, invited: invite.invited };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create supplier" };
  }
}
