import { prisma } from "@ayvana/db";
import { getStorage } from "@ayvana/storage";

// Vendor-scoped reads. Every read takes the server-resolved vendorId and filters
// by it so Seller A can never read Seller B's sessions/assets (isolation by
// construction). Signed, short-TTL URLs are minted for protected assets.

const READ_TTL_SECONDS = 600;

export type SessionView = {
  id: string;
  status: string;
  garmentId: string;
  createdAt: Date;
  jobs: { id: string; kind: string; state: string; error: string | null }[];
  assets: { id: string; type: string; url: string; isSimulated: boolean }[];
} | null;

/** Full session detail for the polling UI — null if not found OR not owned. */
export async function getSessionForVendor(sessionId: string, vendorId: string): Promise<SessionView> {
  const session = await prisma.generationSession
    .findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        vendorId: true,
        status: true,
        garmentId: true,
        createdAt: true,
        jobs: { select: { id: true, kind: true, state: true, error: true }, orderBy: { createdAt: "asc" } },
        assets: {
          select: { id: true, type: true, storageKey: true, isSimulated: true },
          orderBy: { createdAt: "asc" },
        },
      },
    })
    .catch(() => null);

  // Ownership check: undisclosed existence — a non-owner gets null, same as missing.
  if (!session || session.vendorId !== vendorId) return null;

  const storage = getStorage();
  const assets = await Promise.all(
    session.assets.map(async (a) => {
      const signed = await storage.getSignedUrl({ key: a.storageKey, ttlSeconds: READ_TTL_SECONDS });
      return {
        id: a.id,
        type: a.type,
        url: signed.status === "ok" ? signed.url : "",
        isSimulated: a.isSimulated,
      };
    }),
  );

  return {
    id: session.id,
    status: session.status,
    garmentId: session.garmentId,
    createdAt: session.createdAt,
    jobs: session.jobs,
    assets,
  };
}

/** List a vendor's recent sessions (newest first). */
export async function listSessionsForVendor(vendorId: string, limit = 50) {
  return prisma.generationSession
    .findMany({
      where: { vendorId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, status: true, garmentId: true, createdAt: true },
    })
    .catch(() => []);
}
