import type { UserRole } from "@prisma/client";
import { prisma } from "./client";

type ClerkEmail = { id: string; email_address: string };

export type ClerkWebhookEvent = {
  type: string;
  data: {
    id: string;
    email_addresses?: ClerkEmail[];
    primary_email_address_id?: string | null;
    public_metadata?: { role?: string; vendorId?: string; supplierId?: string } | null;
    two_factor_enabled?: boolean;
  };
};

export type ReconcileResult = {
  action: "reconciled" | "upserted" | "ignored" | "skipped";
  reason?: string;
};

const ROLES = new Set(["CUSTOMER", "VENDOR", "ADMIN", "SUPPLIER"]);
function normalizeRole(role: string | undefined): UserRole | null {
  if (!role) return null;
  const up = role.toUpperCase();
  return ROLES.has(up) ? (up as UserRole) : null;
}

function primaryEmail(data: ClerkWebhookEvent["data"]): string | null {
  const list = data.email_addresses ?? [];
  const primary = list.find((e) => e.id === data.primary_email_address_id) ?? list[0];
  return primary?.email_address?.trim().toLowerCase() ?? null;
}

/**
 * Apply a Clerk `user.created` / `user.updated` webhook to the DB `User`.
 *
 * Two paths:
 *  - **Reconcile** an admin-provisioned partner: if a `User` already exists for
 *    this email under a placeholder id (`inv_…`, created by createVendorAccount /
 *    createSupplierAccount), rebind its Vendor/Supplier to the real Clerk id and
 *    drop the placeholder. This is what lets a provisioned partner actually log
 *    into their OS after accepting the invite.
 *  - **Upsert** by Clerk id otherwise — creating the DB row for a normal signup
 *    (e.g. a customer) and keeping email / role / MFA state in sync.
 *
 * Idempotent: safe to run on webhook retries. `two_factor_enabled` maps to
 * `User.mfaEnabled` so the admin "MFA not enabled" signal reflects reality.
 */
export async function reconcileClerkUser(event: ClerkWebhookEvent): Promise<ReconcileResult> {
  if (event.type !== "user.created" && event.type !== "user.updated") {
    return { action: "ignored", reason: event.type };
  }

  const clerkId = event.data.id;
  const email = primaryEmail(event.data);
  if (!clerkId || !email) return { action: "skipped", reason: "missing id/email" };

  const role = normalizeRole(event.data.public_metadata?.role ?? undefined);
  const mfaEnabled = !!event.data.two_factor_enabled;

  return prisma.$transaction(async (tx) => {
    // Already have the real Clerk user? Just keep it in sync (retry-safe).
    const existingById = await tx.user.findUnique({ where: { id: clerkId }, select: { id: true } });
    if (existingById) {
      await tx.user.update({
        where: { id: clerkId },
        data: { email, mfaEnabled, ...(role ? { role } : {}) },
      });
      return { action: "upserted" };
    }

    const byEmail = await tx.user.findUnique({ where: { email }, select: { id: true, role: true } });

    // Provisioned placeholder → rebind to the real Clerk id.
    if (byEmail && byEmail.id.startsWith("inv_")) {
      // Free the unique email off the placeholder first, then create the real
      // user, move the Vendor/Supplier FK, and delete the placeholder.
      await tx.user.update({
        where: { id: byEmail.id },
        data: { email: `moved-${byEmail.id}@invalid.local` },
      });
      await tx.user.create({
        data: { id: clerkId, email, role: role ?? byEmail.role, mfaEnabled },
      });
      await tx.vendor.updateMany({ where: { userId: byEmail.id }, data: { userId: clerkId } });
      await tx.supplier.updateMany({ where: { userId: byEmail.id }, data: { userId: clerkId } });
      await tx.user.delete({ where: { id: byEmail.id } });
      return { action: "reconciled" };
    }

    // A real user already owns this email under a different id — don't clobber.
    if (byEmail) return { action: "skipped", reason: "email owned by another user" };

    // Normal signup: create the DB row.
    await tx.user.create({
      data: { id: clerkId, email, role: role ?? "CUSTOMER", mfaEnabled },
    });
    return { action: "upserted" };
  });
}
