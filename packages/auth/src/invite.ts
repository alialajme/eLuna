import { clerkClient } from "@clerk/nextjs/server";
import type { UserRole } from "./roles";

export type InviteParams = {
  email: string;
  role: UserRole;
  vendorId?: string;
  supplierId?: string;
  /** Where the invitee lands after accepting (their app's sign-up URL). */
  redirectUrl?: string;
};

export type InviteResult = { invited: boolean; reason?: "no_clerk_key" | "clerk_error" };

/**
 * Send a Clerk email invitation that pre-sets the invitee's role (and vendor/
 * supplier id) in `publicMetadata`. When they accept and sign up, Clerk creates
 * their user already carrying the role claim — so an admin-provisioned partner
 * can log straight into their OS.
 *
 * Credential-gated + best-effort, like `syncClerkRole`:
 *   - No `CLERK_SECRET_KEY` (local/demo) → no-op. The DB record is still created
 *     by the caller, so the account exists and is manageable immediately; in the
 *     keyless demo you "log in as" it via the demo switch.
 *   - A Clerk error is logged and swallowed — provisioning must not roll back
 *     just because the invite email failed; the admin can re-send.
 *
 * See docs/deployment/clerk-roles.md (invite acceptance is reconciled to the
 * pre-created DB record by email via the user.created webhook).
 */
export async function invitePartner(params: InviteParams): Promise<InviteResult> {
  if (!process.env.CLERK_SECRET_KEY) return { invited: false, reason: "no_clerk_key" };

  try {
    const publicMetadata: Record<string, unknown> = { role: params.role };
    if (params.vendorId) publicMetadata.vendorId = params.vendorId;
    if (params.supplierId) publicMetadata.supplierId = params.supplierId;

    // Clerk v6: clerkClient is an async factory.
    const client = await clerkClient();
    await client.invitations.createInvitation({
      emailAddress: params.email,
      publicMetadata,
      ...(params.redirectUrl ? { redirectUrl: params.redirectUrl } : {}),
      ignoreExisting: true,
    });
    return { invited: true };
  } catch (err) {
    console.error("[invitePartner] failed to send Clerk invitation", {
      email: params.email,
      role: params.role,
      error: err instanceof Error ? err.message : String(err),
    });
    return { invited: false, reason: "clerk_error" };
  }
}
