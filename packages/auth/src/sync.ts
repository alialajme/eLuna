import { clerkClient } from "@clerk/nextjs/server";
import type { UserRole } from "./roles";

export type RoleMetadata = {
  role: UserRole;
  vendorId?: string | null;
  supplierId?: string | null;
};

export type SyncResult = { synced: boolean; reason?: "no_clerk_key" | "clerk_error" };

/**
 * Push a user's role (and vendor/supplier id) into Clerk `publicMetadata`, which
 * the customized session token surfaces as `sessionClaims.metadata.*` — the exact
 * shape `getAuthUser()` reads. This is the bridge between the DB (where onboarding
 * and admin approval write role/status) and the runtime auth claims: without it,
 * an approved vendor's token still carries no role and they can't enter their OS.
 *
 * Credential-gated + best-effort by design, matching the platform's other
 * external integrations:
 *   - No `CLERK_SECRET_KEY` (local/demo) → no-op. The demo shim reads role from
 *     the DB, so nothing here is needed to run the demo.
 *   - A Clerk API error is logged and swallowed, never thrown. The DB remains the
 *     source of truth for account status, so onboarding/approval must not fail
 *     just because the metadata push hiccuped; approval re-syncs idempotently.
 *
 * Operator note: in the Clerk dashboard the session token must map
 * `metadata` → `{{user.public_metadata}}` for these claims to appear.
 * See docs/deployment/clerk-roles.md.
 */
export async function syncClerkRole(userId: string, meta: RoleMetadata): Promise<SyncResult> {
  if (!process.env.CLERK_SECRET_KEY) return { synced: false, reason: "no_clerk_key" };

  try {
    const publicMetadata: Record<string, unknown> = { role: meta.role };
    if (meta.vendorId !== undefined) publicMetadata.vendorId = meta.vendorId;
    if (meta.supplierId !== undefined) publicMetadata.supplierId = meta.supplierId;

    await clerkClient.users.updateUserMetadata(userId, { publicMetadata });
    return { synced: true };
  } catch (err) {
    console.error("[syncClerkRole] failed to update Clerk metadata", {
      userId,
      role: meta.role,
      error: err instanceof Error ? err.message : String(err),
    });
    return { synced: false, reason: "clerk_error" };
  }
}
