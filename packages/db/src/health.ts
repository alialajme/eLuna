import { prisma } from "./client";

/**
 * Readiness probe helper: verifies the database is reachable. Kept cheap
 * (`SELECT 1`) so it can run on every readiness poll without load. Returns a
 * structured result rather than throwing so callers can shape the HTTP response.
 */
export async function checkDatabase(): Promise<{ ok: boolean; error?: string }> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}
