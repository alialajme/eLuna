import { auth, currentUser } from "@clerk/nextjs/server";
import type { UserRole } from "./roles";

export async function getAuthUser() {
  const { userId, sessionClaims } = await auth();
  if (!userId) return null;

  const claims = sessionClaims as { metadata?: { role?: UserRole } } | null;
  const role = claims?.metadata?.role ?? null;

  return { userId, role };
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
