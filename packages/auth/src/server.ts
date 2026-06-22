import { auth, currentUser } from "@clerk/nextjs/server";
import type { UserRole } from "./roles";

type LunaClaims = { metadata?: { role?: UserRole; mfaEnabled?: boolean; vendorId?: string } };

function parseClaims(sessionClaims: unknown): LunaClaims {
  if (
    sessionClaims &&
    typeof sessionClaims === "object" &&
    "metadata" in sessionClaims &&
    (sessionClaims.metadata === null || typeof sessionClaims.metadata === "object")
  ) {
    return sessionClaims as LunaClaims;
  }
  return {};
}

export async function getAuthUser() {
  const { userId, sessionClaims } = await auth();
  if (!userId) return null;

  const claims = parseClaims(sessionClaims);
  const role = claims.metadata?.role ?? null;
  const mfaEnabled = claims.metadata?.mfaEnabled ?? false;
  const vendorId = claims.metadata?.vendorId ?? null;

  return { userId, role, mfaEnabled, vendorId };
}

export async function requireRole(role: UserRole) {
  const user = await getAuthUser();
  if (!user) {
    throw new Error("Unauthenticated");
  }
  if (user.role !== role) {
    throw new Error(`Requires role: ${role}`);
  }
  return user;
}

export { auth, currentUser };
