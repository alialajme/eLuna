"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { prisma, type VendorStatus, writeAuditLog } from "@e-luna/db";
import { getAuthUser, syncClerkRole, invitePartner } from "@e-luna/auth";

type ActionResult = { success: true } | { error: string };
type CreateResult = { success: true; id: string; invited: boolean } | { error: string };

const VENDOR_APP_URL = process.env.VENDOR_APP_URL ?? "https://sell.luna.ae";

async function setVendorStatus(
  id: string,
  status: VendorStatus
): Promise<ActionResult> {
  // Defense-in-depth: verify the ADMIN role in the action itself, not just in
  // middleware. Server actions are directly-invocable POST endpoints, so route
  // gating alone would leave this update open to any authenticated user.
  const user = await getAuthUser();
  if (!user) return { error: "Unauthorized" };
  if (user.role !== "ADMIN") return { error: "Forbidden" };

  try {
    const vendor = await prisma.$transaction(async (tx) => {
      const v = await tx.vendor.update({
        where: { id },
        data: { status },
        select: { userId: true },
      });
      // Immutable audit trail of the vendor-status change, atomic with it.
      await writeAuditLog(tx, {
        actorId: user.userId,
        actorRole: user.role,
        action: `vendor.status.${status.toLowerCase()}`,
        targetType: "Vendor",
        targetId: id,
        metadata: { status },
      });
      return v;
    });

    // On approval, sync the role + vendorId into Clerk so the vendor's session
    // claim grants access to their OS. (Suspend/reject leave the claim alone —
    // the app gates those by the DB status.) Best-effort; never blocks the DB write.
    if (status === "ACTIVE") {
      await syncClerkRole(vendor.userId, { role: "VENDOR", vendorId: id });
    }

    revalidatePath("/");
    revalidatePath("/sellers");
    revalidatePath("/sellers/approvals");
    revalidatePath(`/sellers/${id}`);
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Update failed" };
  }
}

export async function approveVendor(id: string): Promise<ActionResult> {
  return setVendorStatus(id, "ACTIVE");
}

export async function rejectVendor(id: string): Promise<ActionResult> {
  return setVendorStatus(id, "REJECTED");
}

export async function suspendVendor(id: string): Promise<ActionResult> {
  return setVendorStatus(id, "SUSPENDED");
}

export async function reactivateVendor(id: string): Promise<ActionResult> {
  return setVendorStatus(id, "ACTIVE");
}

/**
 * Admin-provisions a contracted vendor: creates the DB account (role VENDOR,
 * status ACTIVE) and sends a Clerk email invitation carrying role + vendorId so
 * the partner can set up their login and land straight in the Vendor OS. The
 * invite is credential-gated (no Clerk key → record created, no email). The DB
 * User is keyed by a placeholder id until the invitee accepts (reconciled by
 * email via the user.created webhook — see docs/deployment/clerk-roles.md).
 */
export async function createVendorAccount(input: {
  email: string;
  storeName: string;
  storeSlug: string;
}): Promise<CreateResult> {
  const user = await getAuthUser();
  if (!user) return { error: "Unauthorized" };
  if (user.role !== "ADMIN") return { error: "Forbidden" };

  const email = input.email.trim().toLowerCase();
  const storeName = input.storeName.trim();
  const storeSlug = input.storeSlug.trim().toLowerCase();

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter a valid email" };
  if (storeName.length < 2 || storeName.length > 60) return { error: "Store name must be 2–60 characters" };
  if (!/^[a-z0-9-]{3,40}$/.test(storeSlug)) return { error: "Slug must be 3–40 lowercase letters, numbers, or hyphens" };

  const [emailTaken, slugTaken] = await Promise.all([
    prisma.user.findUnique({ where: { email }, select: { id: true } }),
    prisma.vendor.findUnique({ where: { storeSlug }, select: { id: true } }),
  ]);
  if (emailTaken) return { error: "A user with that email already exists" };
  if (slugTaken) return { error: "That store URL is already taken" };

  const placeholderId = `inv_${randomUUID()}`;

  try {
    const vendor = await prisma.$transaction(async (tx) => {
      await tx.user.create({ data: { id: placeholderId, email, role: "VENDOR" } });
      const v = await tx.vendor.create({
        data: { userId: placeholderId, storeName, storeSlug, status: "ACTIVE" },
        select: { id: true },
      });
      await writeAuditLog(tx, {
        actorId: user.userId,
        actorRole: user.role,
        action: "vendor.provisioned",
        targetType: "Vendor",
        targetId: v.id,
        metadata: { email, storeSlug },
      });
      return v;
    });

    const invite = await invitePartner({
      email,
      role: "VENDOR",
      vendorId: vendor.id,
      redirectUrl: `${VENDOR_APP_URL}/sign-up`,
    });

    revalidatePath("/sellers");
    return { success: true, id: vendor.id, invited: invite.invited };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create vendor" };
  }
}
